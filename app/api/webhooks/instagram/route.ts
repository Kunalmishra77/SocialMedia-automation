import { NextRequest, NextResponse } from 'next/server'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  fetchInstagramProfile, sendInstagramDM, sendInstagramButtons,
  replyToComment, sendPrivateReply, likeComment,
} from '@/lib/channels/instagram'
import { getAIReply } from '@/lib/ai/reply'
import { callAI, aiConfigured } from '@/lib/ai/client'
import { applyInboxRules } from '@/lib/inbox-rules'

type Admin = ReturnType<typeof createAdminClient>

/** GET: Meta webhook verification handshake. */
export async function GET(req: NextRequest) {
  const p = new URL(req.url).searchParams
  const verifyToken = process.env.META_VERIFY_TOKEN ?? 'socialflow_verify'
  if (p.get('hub.mode') === 'subscribe' && p.get('hub.verify_token') === verifyToken) {
    return new Response(p.get('hub.challenge') ?? '', { status: 200 })
  }
  return new Response('Forbidden', { status: 403 })
}

function verifySig(raw: string, sig: string | null): boolean {
  const secret = process.env.INSTAGRAM_APP_SECRET || process.env.META_APP_SECRET
  if (!secret) return true
  if (!sig?.startsWith('sha256=')) return false
  const expected = 'sha256=' + createHmac('sha256', secret).update(raw).digest('hex')
  try { return timingSafeEqual(Buffer.from(sig), Buffer.from(expected)) } catch { return false }
}

export async function POST(req: NextRequest) {
  const raw = await req.text()
  if (!verifySig(raw, req.headers.get('x-hub-signature-256'))) {
    return NextResponse.json({ ok: false }, { status: 401 })
  }
  let body: any
  try { body = JSON.parse(raw) } catch { return NextResponse.json({ ok: true }) }
  if (body.object !== 'instagram') return NextResponse.json({ ok: true })

  const admin = createAdminClient()
  await admin.from('ig_webhook_events').insert({ object_type: 'instagram', payload: body, status: 'received' })

  for (const entry of body.entry ?? []) {
    const igBusinessId = String(entry.id)
    const { data: account } = await admin
      .from('channel_accounts')
      .select('id, workspace_id, access_token, is_active')
      .eq('channel', 'instagram')
      .eq('external_id', igBusinessId)
      .maybeSingle()
    if (!account?.access_token || !account.is_active) continue

    const token = account.access_token
    const workspaceId = account.workspace_id
    const settings = await getSettings(admin, workspaceId)

    // ---- Postback (follow-gate verify) ----
    const messaging = entry.messaging?.[0]
    if (messaging?.postback?.payload === 'VERIFY_FOLLOW') {
      const igsid = String(messaging.sender.id)
      const profile = await fetchInstagramProfile(igsid, token)
      if (profile.is_user_follow_business) {
        await sendInstagramDM(token, igsid, "✅ Verified — thanks for following! How can I help you today? 😊")
        await markFollow(admin, workspaceId, igsid, true)
      } else {
        await sendInstagramButtons(token, igsid, "I still don't see you as a follower. Please hit follow and tap verify again 👇", [{ title: "I've Followed", payload: 'VERIFY_FOLLOW' }])
      }
      continue
    }

    // ---- Comments ----
    for (const change of entry.changes ?? []) {
      if (change.field !== 'comments') continue
      const v = change.value
      const commentId = v?.id
      const text: string = v?.text ?? ''
      const fromId = String(v?.from?.id ?? '')
      if (!commentId || !fromId || fromId === igBusinessId) continue

      const profile = await fetchInstagramProfile(fromId, token)
      const contact = await upsertContact(admin, workspaceId, fromId, profile)
      const convId = await findOrCreateConv(admin, workspaceId, contact.id, account.id, fromId)

      await admin.from('ig_comments').upsert(
        { workspace_id: workspaceId, ig_comment_id: commentId, ig_post_id: v?.media?.id, commenter_ig_id: fromId, contact_id: contact.id, text },
        { onConflict: 'ig_comment_id' },
      )

      // 1) Auto-like the comment
      if (settings.autoLikeComments !== false) await likeComment(token, igBusinessId, commentId)

      // 2) Public reply (AI or template)
      const publicReply = await oneShot(workspaceId, `Someone commented: "${text}". Write ONE short friendly public reply telling them to check their DMs. No hashtags.`, 'Thanks! Check your DMs 💬')
      await replyToComment(token, commentId, publicReply)

      // 3) Private DM (comment → DM)
      const dm = await oneShot(workspaceId, `Someone commented "${text}" on our post. Write a short, warm welcome DM.`, "Hey! Thanks for your comment 😊 How can I help?")
      let ok = await sendPrivateReply(token, commentId, dm)
      if (!ok) ok = (await sendInstagramDM(token, fromId, dm)).ok
      if (ok) await saveMsg(admin, convId, workspaceId, 'bot', 'outbound', dm)

      // 4) Follow-gate for commenters who don't follow
      if (settings.followGate && profile.is_user_follow_business === false) {
        await sendInstagramButtons(token, fromId, settings.followGateMsg, [{ title: "I've Followed", payload: 'VERIFY_FOLLOW' }])
        await admin.from('conversations').update({ follow_gate_pending: true }).eq('id', convId)
      }
    }

    // ---- Direct messages ----
    if (messaging?.message && !messaging.message.is_echo && messaging.message.text) {
      const igsid = String(messaging.sender.id)
      const text: string = messaging.message.text
      const mid = messaging.message.mid
      const profile = await fetchInstagramProfile(igsid, token)
      const contact = await upsertContact(admin, workspaceId, igsid, profile)
      const convId = await findOrCreateConv(admin, workspaceId, contact.id, account.id, igsid)

      const { error: dup } = await admin.from('messages').insert({
        conversation_id: convId, workspace_id: workspaceId, sender_type: 'contact',
        direction: 'inbound', type: 'text', content: text, ig_message_id: `ig_${mid}`, status: 'delivered',
        metadata: { ig_igsid: igsid },
      })
      if (dup) continue // duplicate

      // Blockers
      const { data: conv } = await admin.from('conversations').select('bot_paused').eq('id', convId).maybeSingle()
      if (conv?.bot_paused || contact.is_blocked || contact.opted_out) continue
      if (!settings.autoReply) continue

      // Follow-gate: pause AI until the user follows
      if (settings.followGate && profile.is_user_follow_business === false) {
        await sendInstagramButtons(token, igsid, settings.followGateMsg, [{ title: "I've Followed", payload: 'VERIFY_FOLLOW' }])
        await admin.from('conversations').update({ follow_gate_pending: true }).eq('id', convId)
        await saveMsg(admin, convId, workspaceId, 'system', 'outbound', '[Follow-gate sent — AI paused until follow]')
        continue
      }

      // Inbox rules (keyword auto-reply / label / assign) run before AI
      const ruled = await applyInboxRules(admin, workspaceId, convId, text)
      if (ruled.autoReply) {
        const sent = await sendInstagramDM(token, igsid, ruled.autoReply)
        if (sent.ok) await saveMsg(admin, convId, workspaceId, 'bot', 'outbound', ruled.autoReply)
        continue
      }

      // AI reply (KB + persona + history)
      if (aiConfigured()) {
        const reply = await getAIReply(admin, workspaceId, convId, text)
        if (reply) {
          const sent = await sendInstagramDM(token, igsid, reply)
          if (sent.ok) await saveMsg(admin, convId, workspaceId, 'bot', 'outbound', reply)
        }
      }
    }
  }

  return NextResponse.json({ ok: true })
}

// ---------- helpers ----------
async function getSettings(admin: Admin, workspaceId: string) {
  const { data: ws } = await admin.from('workspaces').select('settings').eq('id', workspaceId).maybeSingle()
  const s = (ws?.settings ?? {}) as Record<string, unknown>
  return {
    autoReply: s.auto_reply_enabled === true,
    followGate: s.follow_gate_enabled !== false, // default ON
    followGateMsg: (s.follow_gate_message as string) || "I'd love to help! My automations are exclusive to followers 🌟 Please follow and tap verify 👇",
    autoLikeComments: s.auto_like_comments !== false, // default ON
  }
}
async function oneShot(workspaceId: string, prompt: string, fallback: string): Promise<string> {
  if (!aiConfigured()) return fallback
  const out = await callAI([{ role: 'user', content: prompt }], { maxTokens: 120, temperature: 0.7 })
  return out?.slice(0, 900) || fallback
}
async function upsertContact(admin: Admin, workspaceId: string, igsid: string, p: { username: string | null; name: string | null; follower_count: number | null; is_user_follow_business: boolean | null }) {
  const { data } = await admin.from('contacts').upsert(
    {
      workspace_id: workspaceId, ig_user_id: igsid, channel: 'instagram', source: 'dm',
      ig_username: p.username, full_name: p.name, ig_followers_count: p.follower_count,
      ig_is_follower: p.is_user_follow_business,
    },
    { onConflict: 'workspace_id,ig_user_id' },
  ).select('id, is_blocked, opted_out').single()
  return data as { id: string; is_blocked: boolean; opted_out: boolean }
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
  return created!.id
}
async function saveMsg(admin: Admin, convId: string, workspaceId: string, sender: string, direction: string, content: string) {
  await admin.from('messages').insert({
    conversation_id: convId, workspace_id: workspaceId, sender_type: sender,
    direction, type: 'text', content, status: 'sent',
  })
}
