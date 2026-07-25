'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { getUser, getActiveMembership } from '@/lib/authz'
import { sendTelegramMessage } from '@/lib/channels/telegram'

async function ctx() {
  const user = await getUser()
  if (!user) redirect('/login')
  const { active } = await getActiveMembership(user.id)
  if (!active) redirect('/workspace/new')
  return { user, workspaceId: active.workspaceId, role: active.role }
}

/**
 * Send an outbound message. Stores it immediately; when a channel is connected
 * the channel adapter will also deliver it to the platform (wired with channels).
 */
export async function sendMessageAction(formData: FormData): Promise<{ error?: string }> {
  const { user, workspaceId } = await ctx()
  const conversationId = String(formData.get('conversationId'))
  const content = String(formData.get('content') ?? '').trim()
  if (!content) return { error: 'Message is empty' }

  const admin = createAdminClient()
  const { data: conv } = await admin
    .from('conversations')
    .select('id, workspace_id, channel, channel_account_id, meta')
    .eq('id', conversationId)
    .eq('workspace_id', workspaceId)
    .maybeSingle()
  if (!conv) return { error: 'Conversation not found' }

  // Deliver via the channel adapter (Telegram wired; IG/FB add on connect).
  let deliveryStatus = 'sent'
  if (conv.channel === 'telegram' && conv.channel_account_id) {
    const { data: acct } = await admin
      .from('channel_accounts')
      .select('access_token')
      .eq('id', conv.channel_account_id)
      .maybeSingle()
    const chatId = (conv.meta as { telegram_chat_id?: string } | null)?.telegram_chat_id
    if (acct?.access_token && chatId) {
      const res = await sendTelegramMessage(acct.access_token, chatId, content)
      if (!res.ok) deliveryStatus = 'failed'
    } else {
      deliveryStatus = 'failed'
    }
  }

  await admin.from('messages').insert({
    conversation_id: conversationId,
    workspace_id: workspaceId,
    sender_type: 'agent',
    sender_id: user.id,
    direction: 'outbound',
    type: 'text',
    content,
    status: deliveryStatus,
  })

  revalidatePath('/conversations')
  return deliveryStatus === 'failed' ? { error: 'Message saved but delivery failed.' } : {}
}

export async function resolveConversationAction(formData: FormData): Promise<void> {
  const { workspaceId } = await ctx()
  const conversationId = String(formData.get('conversationId'))
  const admin = createAdminClient()
  await admin
    .from('conversations')
    .update({ status: 'resolved', resolved_at: new Date().toISOString() })
    .eq('id', conversationId)
    .eq('workspace_id', workspaceId)
  revalidatePath('/conversations')
}

export async function reopenConversationAction(formData: FormData): Promise<void> {
  const { workspaceId } = await ctx()
  const conversationId = String(formData.get('conversationId'))
  const admin = createAdminClient()
  await admin
    .from('conversations')
    .update({ status: 'open', resolved_at: null })
    .eq('id', conversationId)
    .eq('workspace_id', workspaceId)
  revalidatePath('/conversations')
}

export async function assignToMeAction(formData: FormData): Promise<void> {
  const { user, workspaceId } = await ctx()
  const conversationId = String(formData.get('conversationId'))
  const admin = createAdminClient()
  await admin
    .from('conversations')
    .update({ assigned_agent_id: user.id, status: 'assigned' })
    .eq('id', conversationId)
    .eq('workspace_id', workspaceId)
  revalidatePath('/conversations')
}
