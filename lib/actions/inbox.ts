'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { getUser, getActiveMembership } from '@/lib/authz'

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
    .select('id, workspace_id')
    .eq('id', conversationId)
    .eq('workspace_id', workspaceId)
    .maybeSingle()
  if (!conv) return { error: 'Conversation not found' }

  await admin.from('messages').insert({
    conversation_id: conversationId,
    workspace_id: workspaceId,
    sender_type: 'agent',
    sender_id: user.id,
    direction: 'outbound',
    type: 'text',
    content,
    status: 'sent',
  })
  // TODO(channels): deliver via ChannelAdapter.sendDM once a channel is connected.

  revalidatePath('/conversations')
  return {}
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
