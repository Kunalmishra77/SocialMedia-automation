'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { getUser, getActiveMembership, roleCan } from '@/lib/authz'

async function requireManageKb(): Promise<string> {
  const user = await getUser()
  if (!user) redirect('/login')
  const { active } = await getActiveMembership(user.id)
  if (!active) redirect('/workspace/new')
  // managers/admins manage KB; agents cannot.
  if (!roleCan(active.role, 'manage_content') && active.role !== 'manager') throw new Error('Forbidden')
  return active.workspaceId
}

export async function createKbEntryAction(formData: FormData): Promise<{ error?: string }> {
  const workspaceId = await requireManageKb()
  const title = String(formData.get('title') ?? '').trim()
  const content = String(formData.get('content') ?? '').trim()
  const category = String(formData.get('category') ?? '').trim() || null
  if (!title || !content) return { error: 'Title and content are required' }

  const admin = createAdminClient()
  await admin.from('knowledge_base').insert({
    workspace_id: workspaceId,
    title,
    content,
    category,
    source: 'manual',
    is_active: true,
  })
  // Embedding generation happens when OPENAI_API_KEY is configured (wired with AI engine).
  revalidatePath('/knowledge-base')
  return {}
}

export async function deleteKbEntryAction(formData: FormData): Promise<void> {
  const workspaceId = await requireManageKb()
  const id = String(formData.get('id'))
  const admin = createAdminClient()
  await admin.from('knowledge_base').delete().eq('id', id).eq('workspace_id', workspaceId)
  revalidatePath('/knowledge-base')
}

export async function toggleKbEntryAction(formData: FormData): Promise<void> {
  const workspaceId = await requireManageKb()
  const id = String(formData.get('id'))
  const isActive = formData.get('is_active') === 'true'
  const admin = createAdminClient()
  await admin.from('knowledge_base').update({ is_active: isActive }).eq('id', id).eq('workspace_id', workspaceId)
  revalidatePath('/knowledge-base')
}

/** Update workspace AI settings stored in workspaces.settings JSONB. */
export async function updateAiSettingsAction(formData: FormData): Promise<{ ok?: boolean; error?: string }> {
  const workspaceId = await requireManageKb()
  const persona = String(formData.get('agent_persona') ?? '').trim()
  const autoReply = formData.get('auto_reply') === 'on'

  const admin = createAdminClient()
  const { data: ws } = await admin.from('workspaces').select('settings').eq('id', workspaceId).single()
  const settings = { ...(ws?.settings ?? {}), agent_persona: persona, auto_reply_enabled: autoReply }
  await admin.from('workspaces').update({ settings }).eq('id', workspaceId)
  revalidatePath('/knowledge-base')
  return { ok: true }
}
