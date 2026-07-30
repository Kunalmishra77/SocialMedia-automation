'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { getUser, getActiveMembership } from '@/lib/authz'
import { callAI, aiConfigured } from '@/lib/ai/client'

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
  let type = String(formData.get('type') ?? 'feed')
  const hashtagsRaw = String(formData.get('hashtags') ?? '').trim()
  const scheduledAt = String(formData.get('scheduled_at') ?? '').trim()
  const mediaUrlInput = String(formData.get('media_url') ?? '').trim()
  if (!caption) return { error: 'Caption is required' }

  const hashtags = hashtagsRaw
    ? hashtagsRaw.split(/[\s,]+/).map((h) => h.replace(/^#/, '')).filter(Boolean)
    : []

  const targets = formData.getAll('target_platforms').map((t) => String(t)).filter(Boolean)
  const target_platforms = targets.length > 0 ? targets : ['instagram']

  const admin = createAdminClient()

  // Media: an uploaded file (preferred) or a pasted public URL.
  const media_urls: string[] = []
  const file = formData.get('media') as File | null
  if (file && typeof file === 'object' && file.size > 0) {
    if (file.size > 100 * 1024 * 1024) return { error: 'Media must be under 100 MB.' }
    const ext = (file.name.split('.').pop() || 'bin').toLowerCase()
    const path = `${workspaceId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
    const { error: upErr } = await admin.storage.from('content-media').upload(path, file, {
      contentType: file.type || undefined, upsert: false,
    })
    if (upErr) return { error: `Upload failed: ${upErr.message}` }
    const { data: pub } = admin.storage.from('content-media').getPublicUrl(path)
    media_urls.push(pub.publicUrl)
    if (file.type.startsWith('video/')) type = 'reel'
  } else if (mediaUrlInput) {
    media_urls.push(mediaUrlInput)
    if (/\.(mp4|mov|webm)(\?|$)/i.test(mediaUrlInput)) type = 'reel'
  }

  await admin.from('content_posts').insert({
    workspace_id: workspaceId,
    type,
    caption,
    hashtags,
    media_urls,
    target_platforms,
    status: scheduledAt ? 'scheduled' : 'draft',
    scheduled_at: scheduledAt ? new Date(scheduledAt).toISOString() : null,
    created_by: user.id,
  })
  revalidatePath('/content')
  return {}
}

/** AI-generate a caption + hashtags for a topic. */
export async function generateCaptionAction(
  topic: string,
  tone: string,
): Promise<{ caption?: string; hashtags?: string; error?: string }> {
  await ctx()
  if (!aiConfigured()) return { error: 'Add an OpenAI/OpenRouter key to enable AI generation.' }
  const t = topic.trim()
  if (!t) return { error: 'Enter a topic or idea' }

  const out = await callAI(
    [{
      role: 'user',
      content: `Write an Instagram caption for this: "${t}". Tone: ${tone || 'friendly'}. Keep it under 60 words, engaging, with 1-2 emojis. Then on a new line starting with "HASHTAGS:" give 8 relevant hashtags space-separated.`,
    }],
    { maxTokens: 220, temperature: 0.8 },
  )
  if (!out) return { error: 'Generation failed, try again.' }
  const parts = out.split(/HASHTAGS:/i)
  return {
    caption: parts[0].trim(),
    hashtags: (parts[1] ?? '').trim().replace(/^#/, ''),
  }
}

export async function deletePostAction(formData: FormData): Promise<void> {
  const { workspaceId } = await ctx()
  const id = String(formData.get('id'))
  const admin = createAdminClient()
  await admin.from('content_posts').delete().eq('id', id).eq('workspace_id', workspaceId)
  revalidatePath('/content')
}
