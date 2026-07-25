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
  return { user, workspaceId: active.workspaceId }
}

export async function createPostAction(formData: FormData): Promise<{ error?: string }> {
  const { user, workspaceId } = await ctx()
  const caption = String(formData.get('caption') ?? '').trim()
  const type = String(formData.get('type') ?? 'feed')
  const hashtagsRaw = String(formData.get('hashtags') ?? '').trim()
  const scheduledAt = String(formData.get('scheduled_at') ?? '').trim()
  if (!caption) return { error: 'Caption is required' }

  const hashtags = hashtagsRaw
    ? hashtagsRaw.split(/[\s,]+/).map((h) => h.replace(/^#/, '')).filter(Boolean)
    : []

  const admin = createAdminClient()
  await admin.from('content_posts').insert({
    workspace_id: workspaceId,
    type,
    caption,
    hashtags,
    status: scheduledAt ? 'scheduled' : 'draft',
    scheduled_at: scheduledAt ? new Date(scheduledAt).toISOString() : null,
    created_by: user.id,
  })
  revalidatePath('/content')
  return {}
}

export async function deletePostAction(formData: FormData): Promise<void> {
  const { workspaceId } = await ctx()
  const id = String(formData.get('id'))
  const admin = createAdminClient()
  await admin.from('content_posts').delete().eq('id', id).eq('workspace_id', workspaceId)
  revalidatePath('/content')
}
