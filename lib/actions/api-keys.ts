'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { getUser, getActiveMembership, roleCan } from '@/lib/authz'
import { generateApiKey } from '@/lib/api-keys'

async function ctx() {
  const user = await getUser()
  if (!user) redirect('/login')
  const { active } = await getActiveMembership(user.id)
  if (!active) redirect('/workspace/new')
  if (!roleCan(active.role, 'manage_workspace')) throw new Error('Forbidden')
  return { user, workspaceId: active.workspaceId }
}

export async function createApiKeyAction(
  _prev: { error?: string; key?: string },
  formData: FormData,
): Promise<{ error?: string; key?: string }> {
  const { user, workspaceId } = await ctx()
  const name = String(formData.get('name') ?? '').trim() || 'API key'
  const { key, prefix, hash } = generateApiKey()
  const admin = createAdminClient()
  await admin.from('workspace_api_keys').insert({
    workspace_id: workspaceId, name, key_prefix: prefix, key_hash: hash, created_by: user.id,
  })
  revalidatePath('/settings/api-keys')
  return { key } // shown once
}

export async function revokeApiKeyAction(formData: FormData): Promise<void> {
  const { workspaceId } = await ctx()
  const id = String(formData.get('id'))
  const admin = createAdminClient()
  await admin.from('workspace_api_keys').update({ revoked_at: new Date().toISOString() }).eq('id', id).eq('workspace_id', workspaceId)
  revalidatePath('/settings/api-keys')
}
