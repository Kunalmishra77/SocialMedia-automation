import { NextRequest, NextResponse } from 'next/server'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendInstagramDM } from '@/lib/channels/instagram'
import { getAIReply } from '@/lib/ai/reply'
import { aiConfigured } from '@/lib/ai/client'

/** GET: Meta webhook verification handshake. */
export async function GET(req: NextRequest) {
  const p = new URL(req.url).searchParams
  const verifyToken = process.env.META_VERIFY_TOKEN ?? 'socialflow_verify'
  if (p.get('hub.mode') === 'subscribe' && p.get('hub.verify_token') === verifyToken) {
    return new Response(p.get('hub.challenge') ?? '', { status: 200 })
  }
  return new Response('Forbidden', { status: 403 })
}

function verifySignature(raw: string, signature: string | null): boolean {
  const secret = process.env.META_APP_SECRET
  if (!secret) return true // dev / not configured — accept
  if (!signature?.startsWith('sha256=')) return false
  const expected = 'sha256=' + createHmac('sha256', secret).update(raw).digest('hex')
  try {
    return timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
  } catch {
    return false
  }
}

export async function POST(req: NextRequest) {
  const raw = await req.text()
  if (!verifySignature(raw, req.headers.get('x-hub-signature-256'))) {
    return NextResponse.json({ ok: false }, { status: 401 })
  }

  let body: any
  try {
    body = JSON.parse(raw)
  } catch {
    return NextResponse.json({ ok: true })
  }

  const admin = createAdminClient()
  await admin.from('ig_webhook_events').insert({ object_type: body.object, payload: body, status: 'received' })

  for (const entry of body.entry ?? []) {
    const igAccountId = String(entry.id)
    const { data: account } = await admin
      .from('channel_accounts')
      .select('id, workspace_id, access_token, is_active')
      .eq('channel', 'instagram')
      .eq('external_id', igAccountId)
      .maybeSingle()
    if (!account || !account.is_active) continue

    // Direct messages
    for (const m of entry.messaging ?? []) {
      if (m.message?.is_echo) continue
      const senderId = String(m.sender?.id ?? '')
      const text: string | null = m.message?.text ?? null
      const mid = m.message?.mid
      if (!senderId || !mid) continue
      await handleInboundDM(admin, account, senderId, text, `ig_${mid}`)
    }

    // Comments
    for (const change of entry.changes ?? []) {
      if (change.field === 'comments') {
        await handleComment(admin, account, change.value)
      }
    }
  }

  return NextResponse.json({ ok: true })
}

async function handleInboundDM(
  admin: ReturnType<typeof createAdminClient>,
  account: { id: string; workspace_id: string; access_token: string | null },
  senderIgsid: string,
  text: string | null,
  dedupId: string,
) {
  const workspaceId = account.workspace_id

  const { data: contact } = await admin
    .from('contacts')
    .upsert(
      { workspace_id: workspaceId, ig_user_id: senderIgsid, channel: 'instagram', source: 'dm' },
      { onConflict: 'workspace_id,ig_user_id' },
    )
    .select('id, is_blocked, opted_out')
    .single()
  if (!contact) return

  let conversationId: string
  const { data: existing } = await admin
    .from('conversations')
    .select('id, bot_paused')
    .eq('workspace_id', workspaceId)
    .eq('contact_id', contact.id)
    .eq('channel', 'dm')
    .maybeSingle()

  let botPaused = existing?.bot_paused ?? false
  if (existing) {
    conversationId = existing.id
  } else {
    const { data: created } = await admin
      .from('conversations')
      .insert({
        workspace_id: workspaceId,
        contact_id: contact.id,
        channel: 'dm',
        channel_account_id: account.id,
        status: 'open',
        meta: { ig_igsid: senderIgsid },
      })
      .select('id')
      .single()
    if (!created) return
    conversationId = created.id
  }

  const { error: insErr } = await admin.from('messages').insert({
    conversation_id: conversationId,
    workspace_id: workspaceId,
    sender_type: 'contact',
    direction: 'inbound',
    type: 'text',
    content: text,
    ig_message_id: dedupId,
    status: 'delivered',
  })
  if (insErr) return // duplicate

  // AI auto-reply
  if (text && aiConfigured() && account.access_token && !botPaused && !contact.is_blocked && !contact.opted_out) {
    const { data: ws } = await admin.from('workspaces').select('settings').eq('id', workspaceId).maybeSingle()
    const autoReply = (ws?.settings as { auto_reply_enabled?: boolean } | null)?.auto_reply_enabled
    if (autoReply) {
      const reply = await getAIReply(admin, workspaceId, conversationId, text)
      if (reply) {
        const sent = await sendInstagramDM(account.access_token, senderIgsid, reply)
        if (sent.ok) {
          await admin.from('messages').insert({
            conversation_id: conversationId,
            workspace_id: workspaceId,
            sender_type: 'bot',
            direction: 'outbound',
            type: 'text',
            content: reply,
            status: 'sent',
            metadata: { ai: true },
          })
        }
      }
    }
  }
}

async function handleComment(
  admin: ReturnType<typeof createAdminClient>,
  account: { id: string; workspace_id: string; access_token: string | null },
  value: any,
) {
  const workspaceId = account.workspace_id
  const commentId = value?.id
  const postId = value?.media?.id
  const fromId = value?.from?.id
  const text: string = value?.text ?? ''
  if (!commentId || !fromId) return

  const { data: contact } = await admin
    .from('contacts')
    .upsert(
      { workspace_id: workspaceId, ig_user_id: String(fromId), channel: 'instagram', source: 'comment' },
      { onConflict: 'workspace_id,ig_user_id' },
    )
    .select('id')
    .single()

  await admin.from('ig_comments').upsert(
    {
      workspace_id: workspaceId,
      ig_account_id: null,
      ig_comment_id: commentId,
      ig_post_id: postId,
      commenter_ig_id: String(fromId),
      contact_id: contact?.id,
      text,
    },
    { onConflict: 'ig_comment_id' },
  )

  // Comment → DM automation
  const { data: autos } = await admin
    .from('post_automations')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('ig_post_id', postId)
    .eq('is_active', true)

  for (const auto of autos ?? []) {
    const match =
      auto.trigger_type === 'any_comment' ||
      (auto.trigger_keywords ?? []).some((kw: string) => text.toLowerCase().includes(kw.toLowerCase()))
    if (!match || !account.access_token) continue
    await sendInstagramDM(account.access_token, String(fromId), auto.dm_message)
    await admin.from('post_automations').update({ trigger_count: (auto.trigger_count ?? 0) + 1 }).eq('id', auto.id)
  }
}
