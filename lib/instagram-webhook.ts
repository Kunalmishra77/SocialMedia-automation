import 'server-only'

import { createHmac, timingSafeEqual } from 'node:crypto'
import { decryptToken } from '@/lib/crypto'
import type { createAdminClient } from '@/lib/supabase/admin'
import {
  fetchInstagramProfile, sendInstagramDM, sendInstagramButtons,
  replyToComment, sendPrivateReply, likeComment, type InstagramProfile,
} from '@/lib/channels/instagram'
import { getAIReply } from '@/lib/ai/reply'
import { callAI, aiConfigured } from '@/lib/ai/client'
import { applyInboxRules } from '@/lib/inbox-rules'
import { logUsage } from '@/lib/usage'
import { withinAiQuota } from '@/lib/quota'

type Admin = ReturnType<typeof createAdminClient>

/**
 * Verify Meta's X-Hub-Signature-256 against the app secret. Fails CLOSED: with no
 * secret we cannot authenticate the sender, so the request is rejected (a missing
 * secret used to return true, which let anyone POST forged webhooks).
 */
export function verifyIgSignature(raw: string, sig: string | null, secret: string | undefined): boolean {
  if (!secret) return false
  if (!sig?.startsWith('sha256=')) return false
  const expected = 'sha256=' + createHmac('sha256', secret).update(raw).digest('hex')
  try { return timingSafeEqual(Buffer.from(sig), Buffer.from(expected)) } catch { return false }
}

/**
 * Follow status the IG API actually told us. The `is_user_follow_business` field
 * is only returned with Advanced Access AND an active messaging thread — otherwise
 * it is absent (null). We must NOT treat "unknown" as "follows" (would defeat the
 * gate) nor as "doesn't follow" for verification (would lock real followers out).
 */
type FollowState = 'yes' | 'no' | 'unknown'
function followState(p: InstagramProfile): FollowState {
  if (p.is_user_follow_business === true) return 'yes'
  if (p.is_user_follow_business === false) return 'no'
  return 'unknown'
}

/**
 * Process an Instagram webhook payload: route DMs (AI auto-reply, follow-gate,
 * inbox rules) and comments (auto-like, public reply, comment→DM). Multi-tenant:
 * each entry.id is resolved to the owning workspace via channel_accounts.
 */
export async function processInstagramWebhook(admin: Admin, body: { entry?: unknown[] }): Promise<void> {
  for (const entry of (body.entry ?? []) as InstagramEntry[]) {
    const igBusinessId = String(entry.id)
    const { data: account } = await admin
      .from('channel_accounts')
      .select('id, workspace_id, access_token, is_active')
      .eq('channel', 'instagram')
      .eq('external_id', igBusinessId)
      .maybeSingle()
    if (!account?.access_token || !account.is_active) continue

    const token = decryptToken(account.access_token)
    if (!token) continue
    const workspaceId = account.workspace_id
    const settings = await getSettings(admin, workspaceId)

    try {
      // ---- Messaging events (postbacks + DMs) — process EVERY event, not just [0] ----
      for (const messaging of entry.messaging ?? []) {
        if (messaging.postback?.payload === 'VERIFY_FOLLOW') {
          await handleVerifyFollow(admin, workspaceId, token, settings, String(messaging.sender.id))
          continue
        }
        if (messaging.message && !messaging.message.is_echo && messaging.message.text) {
          await handleDm(admin, workspaceId, token, igBusinessId, account.id, settings, messaging)
        }
      }

      // ---- Comments ----
      for (const change of entry.changes ?? []) {
        if (change.field !== 'comments') continue
        await handleComment(admin, workspaceId, token, igBusinessId, account.id, settings, change.value)
      }
    } catch (err) {
      // One bad row must not 500 the whole webhook (Meta would retry → disable it).
      console.error('[ig-webhook] entry processing failed', err)
    }
  }
}

// ---------- handlers ----------

async function handleVerifyFollow(admin: Admin, workspaceId: string, token: string, settings: Settings, igsid: string) {
  const profile = await fetchInstagramProfile(igsid, token)
  const state = followState(profile)

  // STRICT mode: only a follow the API CONFIRMS ('yes') passes — a tap alone never
  // counts. Real enforcement, but needs Meta Advanced Access (else 'yes' never
  // comes back and no one passes). LENIENT mode (default): pass on 'yes' OR when the
  // API genuinely can't tell us ('unknown'), trusting the tap.
  const passes = settings.followGateStrict ? state === 'yes' : state !== 'no'
  if (!passes) {
    const msg = settings.followGateStrict
      ? "I couldn't confirm your follow yet. Please make sure you've followed, then tap verify again 👇"
      : "I still don't see you as a follower. Please hit follow and tap verify again 👇"
    await sendInstagramButtons(token, igsid, msg, [{ title: "I've Followed", payload: 'VERIFY_FOLLOW' }])
    return
  }
  await sendInstagramDM(token, igsid, '✅ Verified — thanks for following! How can I help you today? 😊')
  await markFollow(admin, workspaceId, igsid, true)
}

async function handleComment(
  admin: Admin, workspaceId: string, token: string, igBusinessId: string, accountId: string,
  settings: Settings, v: CommentValue | undefined,
) {
  const commentId = v?.id
  const text: string = v?.text ?? ''
  const fromId = String(v?.from?.id ?? '')
  if (!commentId || !fromId || fromId === igBusinessId) return

  // Dedup: insert-first. The unique ig_comment_id makes redeliveries collide → skip.
  const { error: dupErr } = await admin.from('ig_comments').insert({
    workspace_id: workspaceId, ig_comment_id: commentId, ig_post_id: v?.media?.id, commenter_ig_id: fromId, text,
  })
  if (dupErr) return // already processed (or transient) — do not re-like/re-reply/re-DM

  const profile = await fetchInstagramProfile(fromId, token)
  const contact = await upsertContact(admin, workspaceId, fromId, profile)
  if (!contact.id) return
  await admin.from('ig_comments').update({ contact_id: contact.id }).eq('ig_comment_id', commentId)

  // Auto-like is independent of auto-reply (a lightweight courtesy).
  if (settings.autoLikeComments) await likeComment(token, igBusinessId, commentId)

  // Respect the master auto-reply toggle and contact consent for all messaging.
  if (!settings.autoReply || contact.is_blocked || contact.opted_out) return
  if (!(await withinAiQuota(admin, workspaceId))) return

  const convId = await findOrCreateConv(admin, workspaceId, contact.id, accountId, fromId)

  // Follow-gate FIRST — never leak the welcome DM to a non-follower.
  if (settings.followGate && !contact.follow_gate_passed && followState(profile) !== 'yes') {
    const publicReply = await oneShot(admin, workspaceId, `Someone commented: "${text}". Write ONE short friendly public reply inviting them to follow and check their DMs. No hashtags.`, 'Thanks! Check your DMs 💬')
    await replyToComment(token, commentId, publicReply)
    await sendInstagramButtons(token, fromId, settings.followGateMsg, [{ title: "I've Followed", payload: 'VERIFY_FOLLOW' }])
    await admin.from('conversations').update({ follow_gate_pending: true }).eq('id', convId)
    await saveMsg(admin, convId, workspaceId, 'system', 'outbound', '[Follow-gate sent on comment — AI paused until follow]')
    return
  }

  const publicReply = await oneShot(admin, workspaceId, `Someone commented: "${text}". Write ONE short friendly public reply telling them to check their DMs. No hashtags.`, 'Thanks! Check your DMs 💬')
  await replyToComment(token, commentId, publicReply)

  const dm = await oneShot(admin, workspaceId, `Someone commented "${text}" on our post. Write a short, warm welcome DM.`, 'Hey! Thanks for your comment 😊 How can I help?')
  let ok = await sendPrivateReply(token, commentId, dm)
  if (!ok) ok = (await sendInstagramDM(token, fromId, dm)).ok
  if (ok) await saveMsg(admin, convId, workspaceId, 'bot', 'outbound', dm)
}

async function handleDm(
  admin: Admin, workspaceId: string, token: string, igBusinessId: string, accountId: string,
  settings: Settings, messaging: MessagingEvent,
) {
  const igsid = String(messaging.sender.id)
  const text = messaging.message!.text!
  const mid = messaging.message!.mid
  const profile = await fetchInstagramProfile(igsid, token)
  const contact = await upsertContact(admin, workspaceId, igsid, profile)
  if (!contact.id) return
  const convId = await findOrCreateConv(admin, workspaceId, contact.id, accountId, igsid)

  // Dedup: insert-first (unique ig_message_id). Only a genuine new message proceeds.
  const { error: dup } = await admin.from('messages').insert({
    conversation_id: convId, workspace_id: workspaceId, sender_type: 'contact',
    direction: 'inbound', type: 'text', content: text, ig_message_id: `ig_${mid}`, status: 'delivered',
    metadata: { ig_igsid: igsid },
  })
  if (dup) return

  const { data: conv } = await admin.from('conversations').select('bot_paused').eq('id', convId).maybeSingle()
  if (conv?.bot_paused || contact.is_blocked || contact.opted_out) return
  if (!settings.autoReply) return

  // Follow-gate: gate anyone we haven't confirmed as a follower (and who hasn't
  // already passed). 'unknown' is gated too — the verify step lets them through.
  if (settings.followGate && !contact.follow_gate_passed && followState(profile) !== 'yes') {
    await sendInstagramButtons(token, igsid, settings.followGateMsg, [{ title: "I've Followed", payload: 'VERIFY_FOLLOW' }])
    await admin.from('conversations').update({ follow_gate_pending: true }).eq('id', convId)
    await saveMsg(admin, convId, workspaceId, 'system', 'outbound', '[Follow-gate sent — AI paused until follow]')
    return
  }

  const ruled = await applyInboxRules(admin, workspaceId, convId, text)
  if (ruled.autoReply) {
    const sent = await sendInstagramDM(token, igsid, ruled.autoReply)
    if (sent.ok) await saveMsg(admin, convId, workspaceId, 'bot', 'outbound', ruled.autoReply)
    return
  }

  if (aiConfigured()) {
    if (!(await withinAiQuota(admin, workspaceId))) return
    const reply = await getAIReply(admin, workspaceId, convId, text)
    if (reply) {
      const sent = await sendInstagramDM(token, igsid, reply)
      if (sent.ok) await saveMsg(admin, convId, workspaceId, 'bot', 'outbound', reply)
    }
  }
}

// ---------- types ----------
interface MessagingEvent {
  sender: { id: string }
  message?: { is_echo?: boolean; text?: string; mid?: string }
  postback?: { payload?: string }
}
interface CommentValue { id?: string; text?: string; from?: { id?: string }; media?: { id?: string } }
interface InstagramEntry {
  id: string
  messaging?: MessagingEvent[]
  changes?: Array<{ field: string; value?: CommentValue }>
}

// ---------- helpers ----------
interface Settings { autoReply: boolean; followGate: boolean; followGateStrict: boolean; followGateMsg: string; autoLikeComments: boolean }
async function getSettings(admin: Admin, workspaceId: string): Promise<Settings> {
  const { data: ws } = await admin.from('workspaces').select('settings').eq('id', workspaceId).maybeSingle()
  const s = (ws?.settings ?? {}) as Record<string, unknown>
  return {
    autoReply: s.auto_reply_enabled === true,
    followGate: s.follow_gate_enabled !== false,
    followGateStrict: s.follow_gate_strict === true,
    followGateMsg: (s.follow_gate_message as string) || "I'd love to help! My automations are exclusive to followers 🌟 Please follow and tap verify 👇",
    autoLikeComments: s.auto_like_comments !== false,
  }
}
async function oneShot(admin: Admin, workspaceId: string, prompt: string, fallback: string): Promise<string> {
  if (!aiConfigured()) return fallback
  const out = await callAI([{ role: 'user', content: prompt }], { maxTokens: 120, temperature: 0.7 })
  if (out) await logUsage(admin, workspaceId, 'ai_reply')
  return out?.slice(0, 900) || fallback
}
async function upsertContact(admin: Admin, workspaceId: string, igsid: string, p: InstagramProfile) {
  const { data } = await admin.from('contacts').upsert(
    {
      workspace_id: workspaceId, ig_user_id: igsid, channel: 'instagram', source: 'dm',
      ig_username: p.username, full_name: p.name, ig_followers_count: p.follower_count,
      ig_is_follower: p.is_user_follow_business,
    },
    { onConflict: 'workspace_id,ig_user_id' },
  ).select('id, is_blocked, opted_out, follow_gate_passed').single()
  return (data ?? { id: '', is_blocked: false, opted_out: false, follow_gate_passed: false }) as {
    id: string; is_blocked: boolean; opted_out: boolean; follow_gate_passed: boolean
  }
}
async function markFollow(admin: Admin, workspaceId: string, igsid: string, followed: boolean) {
  await admin.from('contacts').update({ ig_is_follower: followed, follow_gate_passed: followed })
    .eq('workspace_id', workspaceId).eq('ig_user_id', igsid)
}
async function findOrCreateConv(admin: Admin, workspaceId: string, contactId: string, accountId: string, igsid: string): Promise<string> {
  const { data: existing } = await admin.from('conversations').select('id')
    .eq('workspace_id', workspaceId).eq('contact_id', contactId).eq('channel', 'dm').maybeSingle()
  if (existing) return existing.id
  const { data: created } = await admin.from('conversations').insert({
    workspace_id: workspaceId, contact_id: contactId, channel: 'dm', channel_account_id: accountId,
    status: 'open', meta: { ig_igsid: igsid },
  }).select('id').single()
  if (!created) throw new Error('conversation create failed')
  return created.id
}
async function saveMsg(admin: Admin, convId: string, workspaceId: string, sender: string, direction: string, content: string) {
  await admin.from('messages').insert({
    conversation_id: convId, workspace_id: workspaceId, sender_type: sender,
    direction, type: 'text', content, status: 'sent',
  })
}
