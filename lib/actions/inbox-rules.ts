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
  if (active.role === 'agent') throw new Error('Forbidden')
  return active.workspaceId
}

export async function createRuleAction(formData: FormData): Promise<{ error?: string }> {
  const workspaceId = await ctx()
  const name = String(formData.get('name') ?? '').trim()
  const keywordsRaw = String(formData.get('keywords') ?? '').trim()
  const match = String(formData.get('match') ?? 'any')
  const autoReply = String(formData.get('auto_reply') ?? '').trim() || undefined
  const addLabel = String(formData.get('add_label') ?? '').trim() || undefined
  const keywords = keywordsRaw ? keywordsRaw.split(',').map((k) => k.trim()).filter(Boolean) : []
  if (!name || keywords.length === 0) return { error: 'Name and at least one keyword required' }

  const admin = createAdminClient()
  await admin.from('inbox_rules').insert({
    workspace_id: workspaceId,
    name,
    is_active: true,
    priority: 0,
    conditions: { match, keywords },
    actions: { auto_reply: autoReply, add_label: addLabel },
  })
  revalidatePath('/automation/rules')
  return {}
}

export async function toggleRuleAction(formData: FormData): Promise<void> {
  const workspaceId = await ctx()
  const id = String(formData.get('id'))
  const isActive = formData.get('is_active') === 'true'
  const admin = createAdminClient()
  await admin.from('inbox_rules').update({ is_active: isActive }).eq('id', id).eq('workspace_id', workspaceId)
  revalidatePath('/automation/rules')
}

export async function deleteRuleAction(formData: FormData): Promise<void> {
  const workspaceId = await ctx()
  const id = String(formData.get('id'))
  const admin = createAdminClient()
  await admin.from('inbox_rules').delete().eq('id', id).eq('workspace_id', workspaceId)
  revalidatePath('/automation/rules')
}
