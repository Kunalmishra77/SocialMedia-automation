import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { decryptToken } from '@/lib/crypto'
import { sendTelegramMessage } from '@/lib/channels/telegram'
import { getAIReply } from '@/lib/ai/reply'
import { aiConfigured } from '@/lib/ai/client'
import { applyInboxRules } from '@/lib/inbox-rules'
import { runFlowsForDM } from '@/lib/flow-runner'

/**
 * Telegram webhook. One endpoint per connected bot (channel_account id in the path).
 * Verifies the secret token, then persists the inbound message as a
 * contact + conversation + message (triggers handle the rollups).
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: channelAccountId } = await params
  const admin = createAdminClient()

  const { data: account } = await admin
    .from('channel_accounts')
    .select('id, workspace_id, webhook_secret, is_active, access_token')
    .eq('id', channelAccountId)
    .eq('channel', 'telegram')
    .maybeSingle()

  // Always 200 to Telegram so it doesn't retry; just no-op on problems.
  if (!account || !account.is_active) return NextResponse.json({ ok: true })

  // Constant-time compare of the per-bot webhook secret (mitigates timing attacks).
  const secret = req.headers.get('x-telegram-bot-api-secret-token') ?? ''
  const storedSecret = decryptToken(account.webhook_secret as string | null)
  if (storedSecret) {
    const a = Buffer.from(secret)
    const b = Buffer.from(storedSecret)
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return NextResponse.json({ ok: true })
    }
  }
  const tgToken = decryptToken(account.access_token as string | null)

  let update: any
  try {
    update = await req.json()
  } catch {
    return NextResponse.json({ ok: true })
  }

  const msg = update?.message
  if (!msg?.from || !msg.chat) return NextResponse.json({ ok: true })

  const externalUserId = String(msg.from.id)
  const chatId = String(msg.chat.id)
  const fullName = [msg.from.first_name, msg.from.last_name].filter(Boolean).join(' ') || null
  const username = msg.from.username ?? null
  const text: string | null = msg.text ?? msg.caption ?? null
  const tgMessageId = `tg_${chatId}_${msg.message_id}`

  const workspaceId = account.workspace_id

  // Upsert contact (ig_user_id reused as the generic external id; ids never collide across channels).
  const { data: contact } = await admin
    .from('contacts')
    .upsert(
      {
        workspace_id: workspaceId,
        ig_user_id: externalUserId,
        ig_username: username,
        full_name: fullName,
        channel: 'telegram',
        source: 'telegram',
      },
      { onConflict: 'workspace_id,ig_user_id' },
    )
    .select('id')
    .single()

  if (!contact) return NextResponse.json({ ok: true })

  // Find-or-create the telegram conversation for this contact.
  let conversationId: string
  const { data: existing } = await admin
    .from('conversations')
    .select('id')
    .eq('workspace_id', workspaceId)
    .eq('contact_id', contact.id)
    .eq('channel', 'telegram')
    .maybeSingle()

  if (existing) {
    conversationId = existing.id
  } else {
    const { data: created } = await admin
      .from('conversations')
      .insert({
        workspace_id: workspaceId,
        contact_id: contact.id,
        channel: 'telegram',
        channel_account_id: account.id,
        status: 'open',
        meta: { telegram_chat_id: chatId },
      })
      .select('id')
      .single()
    if (!created) return NextResponse.json({ ok: true })
    conversationId = created.id
  }

  // Insert the inbound message (dedup on ig_message_id).
  const { error: insErr } = await admin.from('messages').insert({
    conversation_id: conversationId,
    workspace_id: workspaceId,
    sender_type: 'contact',
    direction: 'inbound',
    type: 'text',
    content: text,
    ig_message_id: tgMessageId,
    status: 'delivered',
    metadata: { telegram_chat_id: chatId },
  })
  // Duplicate delivery (same ig_message_id) — stop to avoid double auto-reply.
  if (insErr) return NextResponse.json({ ok: true })

  // Custom flow builder (multi-step) runs first; if a flow matched, we're done.
  if (text && tgToken) {
    const flowRan = await runFlowsForDM(admin, {
      workspaceId, conversationId, contactId: contact.id, channel: 'telegram',
      token: tgToken, recipient: chatId, text, isFirstDm: !existing,
    })
    if (flowRan) return NextResponse.json({ ok: true })
  }

  // Inbox rules (keyword auto-reply / label / assign) run before AI.
  if (text && tgToken) {
    const ruled = await applyInboxRules(admin, workspaceId, conversationId, text)
    if (ruled.autoReply) {
      const sent = await sendTelegramMessage(tgToken, chatId, ruled.autoReply)
      if (sent.ok) {
        await admin.from('messages').insert({
          conversation_id: conversationId, workspace_id: workspaceId, sender_type: 'bot',
          direction: 'outbound', type: 'text', content: ruled.autoReply, status: 'sent',
          metadata: { telegram_chat_id: chatId, rule: true },
        })
      }
      return NextResponse.json({ ok: true })
    }
  }

  // AI auto-reply (if configured + enabled + bot not paused).
  if (text && aiConfigured() && tgToken) {
    const [{ data: ws }, { data: conv }] = await Promise.all([
      admin.from('workspaces').select('settings').eq('id', workspaceId).maybeSingle(),
      admin.from('conversations').select('bot_paused').eq('id', conversationId).maybeSingle(),
    ])
    const autoReply = (ws?.settings as { auto_reply_enabled?: boolean } | null)?.auto_reply_enabled
    if (autoReply && !conv?.bot_paused) {
      const reply = await getAIReply(admin, workspaceId, conversationId, text)
      if (reply) {
        const sent = await sendTelegramMessage(tgToken, chatId, reply)
        if (sent.ok) {
          await admin.from('messages').insert({
            conversation_id: conversationId,
            workspace_id: workspaceId,
            sender_type: 'bot',
            direction: 'outbound',
            type: 'text',
            content: reply,
            status: 'sent',
            metadata: { telegram_chat_id: chatId, ai: true },
          })
        }
      }
    }
  }

  return NextResponse.json({ ok: true })
}
