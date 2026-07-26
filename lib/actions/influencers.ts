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

export async function createInfluencerAction(formData: FormData): Promise<{ error?: string }> {
  const workspaceId = await ctx()
  const name = String(formData.get('name') ?? '').trim()
  const ig_username = String(formData.get('ig_username') ?? '').trim() || null
  const category = String(formData.get('category') ?? '').trim() || null
  const followers = Number(formData.get('followers_count') ?? 0) || null
  const rate = Number(formData.get('rate_per_post') ?? 0) || null
  if (!name && !ig_username) return { error: 'Enter a name or username' }

  const admin = createAdminClient()
  await admin.from('influencers').insert({
    workspace_id: workspaceId,
    name: name || null,
    ig_username,
    category,
    followers_count: followers,
    rate_per_post: rate,
    status: 'prospect',
  })
  revalidatePath('/influencers')
  return {}
}

export async function deleteInfluencerAction(formData: FormData): Promise<void> {
  const workspaceId = await ctx()
  const id = String(formData.get('id'))
  const admin = createAdminClient()
  await admin.from('influencers').delete().eq('id', id).eq('workspace_id', workspaceId)
  revalidatePath('/influencers')
}
