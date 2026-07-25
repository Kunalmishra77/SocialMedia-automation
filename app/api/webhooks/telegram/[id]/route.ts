import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

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
    .select('id, workspace_id, webhook_secret, is_active')
    .eq('id', channelAccountId)
    .eq('channel', 'telegram')
    .maybeSingle()

  // Always 200 to Telegram so it doesn't retry; just no-op on problems.
  if (!account || !account.is_active) return NextResponse.json({ ok: true })

  const secret = req.headers.get('x-telegram-bot-api-secret-token')
  if (account.webhook_secret && secret !== account.webhook_secret) {
    return NextResponse.json({ ok: true })
  }

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
  await admin.from('messages').insert({
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

  return NextResponse.json({ ok: true })
}
