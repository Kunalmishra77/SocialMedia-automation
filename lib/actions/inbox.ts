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

/**
 * Toggle the AI on/off for a conversation. Pausing = human takeover (the webhook
 * AI paths skip conversations where bot_paused is true). Resuming re-enables AI.
 */
export async function toggleBotPausedAction(formData: FormData): Promise<void> {
  const { workspaceId } = await ctx()
  const conversationId = String(formData.get('conversationId'))
  const paused = String(formData.get('paused')) === 'true'
  const admin = createAdminClient()
  await admin
    .from('conversations')
    .update({ bot_paused: paused })
    .eq('id', conversationId)
    .eq('workspace_id', workspaceId)
  revalidatePath('/conversations')
}

/** Add an internal note (visible to the team, never sent to the customer or AI). */
export async function addInternalNoteAction(formData: FormData): Promise<void> {
  const { user, workspaceId } = await ctx()
  const conversationId = String(formData.get('conversationId'))
  const content = String(formData.get('content') ?? '').trim()
  if (!content) return
  const admin = createAdminClient()
  const { data: conv } = await admin.from('conversations').select('id').eq('id', conversationId).eq('workspace_id', workspaceId).maybeSingle()
  if (!conv) return
  await admin.from('messages').insert({
    conversation_id: conversationId,
    workspace_id: workspaceId,
    sender_type: 'agent',
    sender_id: user.id,
    direction: 'outbound',
    type: 'internal_note',
    content,
    status: 'sent',
  })
  revalidatePath('/conversations')
}

const PRIORITIES = ['low', 'normal', 'high', 'urgent']
export async function setPriorityAction(formData: FormData): Promise<void> {
  const { workspaceId } = await ctx()
  const conversationId = String(formData.get('conversationId'))
  const priority = String(formData.get('priority') ?? 'normal')
  if (!PRIORITIES.includes(priority)) return
  const admin = createAdminClient()
  await admin.from('conversations').update({ priority }).eq('id', conversationId).eq('workspace_id', workspaceId)
  revalidatePath('/conversations')
}

export async function addTagAction(formData: FormData): Promise<void> {
  const { workspaceId } = await ctx()
  const conversationId = String(formData.get('conversationId'))
  const tag = String(formData.get('tag') ?? '').trim().toLowerCase().slice(0, 24)
  if (!tag) return
  const admin = createAdminClient()
  const { data: conv } = await admin.from('conversations').select('tags').eq('id', conversationId).eq('workspace_id', workspaceId).maybeSingle()
  const tags = Array.from(new Set([...(((conv?.tags as string[]) ?? [])), tag])).slice(0, 12)
  await admin.from('conversations').update({ tags }).eq('id', conversationId).eq('workspace_id', workspaceId)
  revalidatePath('/conversations')
}

export async function removeTagAction(formData: FormData): Promise<void> {
  const { workspaceId } = await ctx()
  const conversationId = String(formData.get('conversationId'))
  const tag = String(formData.get('tag') ?? '')
  const admin = createAdminClient()
  const { data: conv } = await admin.from('conversations').select('tags').eq('id', conversationId).eq('workspace_id', workspaceId).maybeSingle()
  const tags = (((conv?.tags as string[]) ?? [])).filter((t) => t !== tag)
  await admin.from('conversations').update({ tags }).eq('id', conversationId).eq('workspace_id', workspaceId)
  revalidatePath('/conversations')
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
