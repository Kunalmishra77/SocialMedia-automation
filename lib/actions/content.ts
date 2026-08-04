'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { getUser, getActiveMembership } from '@/lib/authz'
import { callAI, aiConfigured } from '@/lib/ai/client'
import { getBrandProfile } from '@/lib/ai/brand'
import { generateContent, generateDesign, expandPoster, describeReference, type PlatformVariants, type PostDesign } from '@/lib/ai/content-gen'
import { generatePostImage, generateHeroImage, generatePoster, generatePosterWithAssets } from '@/lib/ai/image-gen'
import { retrieveKbContext } from '@/lib/ai/reply'

/** IG feed post caption from the instagram variant (falls back to first variant). */
function igCaptionFrom(variants: PlatformVariants): { caption: string; hashtags: string[] } {
  const v = variants.instagram ?? Object.values(variants)[0]
  return { caption: v?.caption ?? '', hashtags: v?.hashtags ?? [] }
}

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

// ── AI content automation: generate → review → approve → schedule ──────────

export interface GeneratedPost {
  id: string
  title: string
  brief: string
  variants: PlatformVariants
  media_url: string | null
  image_source: string | null
  target_platforms: string[]
}

/**
 * Generate a full AI post from a topic/brief: per-platform copy + a visual.
 * Persists it as `pending_approval` and returns it for the preview UI.
 */
export async function generateAiPostAction(
  brief: string,
  platforms: string[],
): Promise<{ post?: GeneratedPost; error?: string }> {
  const { user, workspaceId } = await ctx()
  if (!aiConfigured()) return { error: 'Add an OpenAI/OpenRouter key to enable AI generation.' }
  const b = brief.trim()
  if (!b) return { error: 'Enter a topic or content idea.' }
  const targets = platforms.filter(Boolean)
  const target_platforms = targets.length ? targets : ['instagram']

  const admin = createAdminClient()
  const brand = await getBrandProfile(admin, workspaceId)
  const kbContext = await retrieveKbContext(admin, workspaceId, b, false)

  const gen = await generateContent({ brand, brief: b, platforms: target_platforms, kbContext })
  if (!gen) return { error: 'AI could not generate content — try rephrasing the topic.' }

  const image = await generatePostImage(admin, workspaceId, { prompt: gen.image_prompt, headline: gen.title, brand })
  const ig = igCaptionFrom(gen.variants)

  const { data: row, error } = await admin
    .from('content_posts')
    .insert({
      workspace_id: workspaceId,
      type: 'feed',
      brief: b,
      caption: ig.caption,
      hashtags: ig.hashtags,
      media_urls: image ? [image.url] : [],
      target_platforms,
      platform_variants: gen.variants,
      image_prompt: gen.image_prompt,
      image_source: image?.source ?? null,
      status: 'pending_approval',
      requires_approval: true,
      ai_generated: true,
      ai_prompt: b,
      ai_model: process.env.AI_MODEL ?? null,
      created_by: user.id,
    })
    .select('id')
    .single()
  if (error || !row) return { error: 'Could not save the generated post.' }

  revalidatePath('/content')
  return {
    post: {
      id: row.id,
      title: gen.title,
      brief: b,
      variants: gen.variants,
      media_url: image?.url ?? null,
      image_source: image?.source ?? null,
      target_platforms,
    },
  }
}

/** Regenerate a post's copy, image, or both. Returns the refreshed fields. */
export async function regeneratePostAction(
  postId: string,
  what: 'caption' | 'image' | 'all',
): Promise<{ variants?: PlatformVariants; media_url?: string | null; error?: string }> {
  const { workspaceId } = await ctx()
  if (!aiConfigured()) return { error: 'Add an OpenAI/OpenRouter key to enable AI generation.' }
  const admin = createAdminClient()
  const { data: post } = await admin
    .from('content_posts')
    .select('id, brief, ai_prompt, target_platforms, platform_variants, image_prompt')
    .eq('id', postId)
    .eq('workspace_id', workspaceId)
    .maybeSingle()
  if (!post) return { error: 'Post not found.' }

  const brand = await getBrandProfile(admin, workspaceId)
  const brief = post.brief || post.ai_prompt || ''
  const platforms = (post.target_platforms as string[] | null) ?? ['instagram']
  const update: Record<string, unknown> = {}
  let variants = (post.platform_variants ?? {}) as PlatformVariants

  if (what === 'caption' || what === 'all') {
    const kbContext = await retrieveKbContext(admin, workspaceId, brief, false)
    const gen = await generateContent({ brand, brief, platforms, kbContext })
    if (!gen) return { error: 'AI could not regenerate — try again.' }
    variants = gen.variants
    const ig = igCaptionFrom(variants)
    update.platform_variants = variants
    update.caption = ig.caption
    update.hashtags = ig.hashtags
    update.image_prompt = gen.image_prompt || post.image_prompt
  }

  let mediaUrl: string | null | undefined
  if (what === 'image' || what === 'all') {
    const prompt = (update.image_prompt as string) || post.image_prompt || brief
    const image = await generatePostImage(admin, workspaceId, { prompt, headline: brief.slice(0, 120), brand })
    if (image) {
      mediaUrl = image.url
      update.media_urls = [image.url]
      update.image_source = image.source
    }
  }

  if (Object.keys(update).length) await admin.from('content_posts').update(update).eq('id', postId)
  revalidatePath('/content')
  return { variants, media_url: mediaUrl }
}

/** Manually edit one platform's copy in a generated post. */
export async function updatePostVariantAction(
  postId: string,
  platform: string,
  edits: { caption: string; hashtags: string; cta: string },
): Promise<{ error?: string }> {
  const { workspaceId } = await ctx()
  const admin = createAdminClient()
  const { data: post } = await admin
    .from('content_posts')
    .select('platform_variants')
    .eq('id', postId)
    .eq('workspace_id', workspaceId)
    .maybeSingle()
  if (!post) return { error: 'Post not found.' }

  const variants = { ...((post.platform_variants ?? {}) as PlatformVariants) }
  const hashtags = edits.hashtags.split(/[\s,]+/).map((h) => h.replace(/^#/, '')).filter(Boolean)
  variants[platform] = {
    ...variants[platform],
    caption: edits.caption.trim(),
    hashtags,
    cta: edits.cta.trim(),
  }
  const update: Record<string, unknown> = { platform_variants: variants }
  if (platform === 'instagram') {
    update.caption = edits.caption.trim()
    update.hashtags = hashtags
  }
  await admin.from('content_posts').update(update).eq('id', postId).eq('workspace_id', workspaceId)
  revalidatePath('/content')
  return {}
}

/** Approve a generated post and (optionally) schedule it for auto-publishing. */
export async function approvePostAction(formData: FormData): Promise<{ error?: string }> {
  const { user, workspaceId } = await ctx()
  const id = String(formData.get('id') ?? '')
  const scheduledAt = String(formData.get('scheduled_at') ?? '').trim()
  const targets = formData.getAll('target_platforms').map((t) => String(t)).filter(Boolean)
  if (!id) return { error: 'Missing post.' }

  const admin = createAdminClient()
  const { data: post } = await admin
    .from('content_posts')
    .select('media_urls, platform_variants')
    .eq('id', id)
    .eq('workspace_id', workspaceId)
    .maybeSingle()
  if (!post) return { error: 'Post not found.' }
  if (!(post.media_urls as string[] | null)?.length) {
    return { error: 'Add an image before approving — regenerate the visual or upload one.' }
  }

  const ig = igCaptionFrom((post.platform_variants ?? {}) as PlatformVariants)
  const update: Record<string, unknown> = {
    status: scheduledAt ? 'scheduled' : 'approved',
    scheduled_at: scheduledAt ? new Date(scheduledAt).toISOString() : null,
    approved_by: user.id,
    approved_at: new Date().toISOString(),
    rejection_note: null,
  }
  if (targets.length) update.target_platforms = targets
  if (ig.caption) update.caption = ig.caption
  if (ig.hashtags.length) update.hashtags = ig.hashtags
  await admin.from('content_posts').update(update).eq('id', id).eq('workspace_id', workspaceId)
  revalidatePath('/content')
  return {}
}

/** Reject a generated post with a note. */
export async function rejectPostAction(formData: FormData): Promise<{ error?: string }> {
  const { user, workspaceId } = await ctx()
  const id = String(formData.get('id') ?? '')
  const note = String(formData.get('note') ?? '').trim()
  if (!id) return { error: 'Missing post.' }
  const admin = createAdminClient()
  await admin
    .from('content_posts')
    .update({ status: 'rejected', rejected_by: user.id, rejection_note: note || 'Rejected by client.' })
    .eq('id', id)
    .eq('workspace_id', workspaceId)
  revalidatePath('/content')
  return {}
}

/** Reschedule a post to a new date/time (drag on the calendar). Client sends a
 *  full ISO timestamp. Only movable posts (not published/publishing) can move. */
export async function reschedulePostAction(id: string, iso: string): Promise<{ error?: string }> {
  const { workspaceId } = await ctx()
  if (!id || !iso) return { error: 'Missing data.' }
  const when = new Date(iso)
  if (isNaN(when.getTime())) return { error: 'Invalid date.' }

  const admin = createAdminClient()
  const { data: post } = await admin
    .from('content_posts')
    .select('status')
    .eq('id', id)
    .eq('workspace_id', workspaceId)
    .maybeSingle()
  if (!post) return { error: 'Post not found.' }
  if (['published', 'publishing'].includes(post.status)) return { error: 'Published posts can’t be moved.' }

  // Moving onto the calendar means it should go out at that time.
  const status = post.status === 'rejected' ? 'rejected' : 'scheduled'
  await admin
    .from('content_posts')
    .update({ scheduled_at: when.toISOString(), status })
    .eq('id', id)
    .eq('workspace_id', workspaceId)
  revalidatePath('/content')
  return {}
}

// ── Design Studio: AI designed posts (branded template + AI hero photo) ─────

export interface DesignPayload {
  design: PostDesign
  heroUrl: string | null
  brand: { name: string; colors: string[]; logo: string; website: string; phone: string; handle: string }
}

/** Generate structured design content (badge/headline/subtext) + an AI hero photo. */
export async function generateDesignAction(brief: string): Promise<{ payload?: DesignPayload; error?: string }> {
  const { workspaceId } = await ctx()
  if (!aiConfigured()) return { error: 'Add an OpenAI key to generate designs.' }
  const b = brief.trim()
  if (!b) return { error: 'Enter a topic or idea.' }
  const admin = createAdminClient()
  const brand = await getBrandProfile(admin, workspaceId)
  const kbContext = await retrieveKbContext(admin, workspaceId, b, false)
  const design = await generateDesign({ brand, brief: b, kbContext })
  if (!design) return { error: 'Could not generate — try rephrasing the topic.' }
  const heroUrl = await generateHeroImage(admin, workspaceId, design.heroPrompt, brand, '1024x1024')
  return {
    payload: {
      design, heroUrl,
      brand: { name: brand.business_name, colors: brand.brand_colors, logo: brand.logo_url, website: brand.website, phone: brand.phone, handle: brand.handle },
    },
  }
}

/** Regenerate just the hero photo for a given prompt. */
export async function regenerateHeroAction(prompt: string): Promise<{ url?: string | null; error?: string }> {
  const { workspaceId } = await ctx()
  const admin = createAdminClient()
  const brand = await getBrandProfile(admin, workspaceId)
  const url = await generateHeroImage(admin, workspaceId, prompt, brand, '1024x1024')
  return { url }
}

// ── AI Poster: full gpt-image-1 poster from topic + brand kit ──────────────

export interface PosterResult { url: string; imagePrompt: string; caption: string; hashtags: string[]; logo: string; logoBaked: boolean }

/** Social size → gpt-image-1 dimensions. */
const POSTER_SIZE: Record<string, '1024x1536' | '1024x1024' | '1536x1024'> = {
  portrait: '1024x1536', square: '1024x1024', landscape: '1536x1024',
}

/** Topic + brand kit → AI writes a detailed prompt → gpt-image-1 full poster
 *  (with the real brand logo integrated when available). */
export async function generatePosterAction(brief: string, shape = 'portrait', refUrl?: string): Promise<{ poster?: PosterResult; error?: string }> {
  const { workspaceId } = await ctx()
  if (!aiConfigured()) return { error: 'Add an OpenAI key to generate posters.' }
  const b = brief.trim()
  if (!b) return { error: 'Enter a topic or brief.' }
  const admin = createAdminClient()
  const brand = await getBrandProfile(admin, workspaceId)
  const kbContext = await retrieveKbContext(admin, workspaceId, b, false)
  const referenceStyle = refUrl ? (await describeReference(refUrl)) ?? undefined : undefined
  const ex = await expandPoster({ brand, brief: b, kbContext, shape, referenceStyle })
  if (!ex) return { error: 'Could not build the poster — try rephrasing.' }
  const size = POSTER_SIZE[shape] ?? '1024x1536'
  // Prefer integrating real brand assets (logo + product photos); fall back to plain generation.
  const assets = [brand.logo_url, ...brand.product_images].filter(Boolean)
  const prompt = assetInstruction(brand) + ex.imagePrompt
  let logoBaked = false
  let url = assets.length ? await generatePosterWithAssets(admin, workspaceId, prompt, assets, size) : null
  if (url) logoBaked = true
  else url = await generatePoster(admin, workspaceId, ex.imagePrompt, size)
  if (!url) return { error: 'Image generation failed. Ensure your OpenAI account has gpt-image-1 access (may need org verification), then retry.' }
  return { poster: { url, imagePrompt: ex.imagePrompt, caption: ex.caption, hashtags: ex.hashtags, logo: brand.logo_url, logoBaked } }
}

/** Instruction prefix telling the model how to use the provided input images. */
function assetInstruction(brand: { logo_url: string; product_images: string[] }): string {
  const parts: string[] = []
  if (brand.logo_url) parts.push('the brand LOGO — place THIS EXACT logo prominently and crisply, unaltered')
  if (brand.product_images.length) parts.push(`${brand.product_images.length} REAL PRODUCT photo(s) — show THESE EXACT products in the poster, do not invent different products`)
  if (!parts.length) return ''
  return `PROVIDED INPUT IMAGES (use them faithfully): in order, ${parts.join('; then ')}.\n\n`
}

/** Upload a reference image (for style-guided generation) → returns its URL. */
export async function uploadReferenceAction(formData: FormData): Promise<{ url?: string; error?: string }> {
  const { workspaceId } = await ctx()
  const file = formData.get('file') as File | null
  if (!file || typeof file !== 'object' || file.size === 0) return { error: 'Choose an image.' }
  if (file.size > 10 * 1024 * 1024) return { error: 'Image must be under 10 MB.' }
  const admin = createAdminClient()
  const ext = (file.name.split('.').pop() || 'png').toLowerCase()
  const path = `${workspaceId}/ref-${Date.now()}.${ext}`
  const { error } = await admin.storage.from('content-media').upload(path, file, { contentType: file.type || undefined, upsert: false })
  if (error) return { error: `Upload failed: ${error.message}` }
  return { url: admin.storage.from('content-media').getPublicUrl(path).data.publicUrl }
}

/** Regenerate the poster image from an existing prompt (a fresh variation). */
export async function regeneratePosterAction(prompt: string, shape = 'portrait'): Promise<{ url?: string | null; error?: string }> {
  const { workspaceId } = await ctx()
  const admin = createAdminClient()
  const brand = await getBrandProfile(admin, workspaceId)
  const size = POSTER_SIZE[shape] ?? '1024x1536'
  const assets = [brand.logo_url, ...brand.product_images].filter(Boolean)
  const url = (assets.length ? await generatePosterWithAssets(admin, workspaceId, assetInstruction(brand) + prompt, assets, size) : null)
    ?? await generatePoster(admin, workspaceId, prompt, size)
  return { url }
}

/** Save an AI poster (already in storage) as a content post. */
export async function savePosterAction(input: {
  url: string; caption: string; hashtags?: string; brief?: string; scheduledAt?: string
}): Promise<{ id?: string; error?: string }> {
  const { user, workspaceId } = await ctx()
  if (!input.url) return { error: 'No poster to save.' }
  const admin = createAdminClient()
  const hashtags = (input.hashtags ?? '').split(/[\s,]+/).map((h) => h.replace(/^#/, '')).filter(Boolean)
  const scheduled = input.scheduledAt?.trim()
  const { data, error } = await admin.from('content_posts').insert({
    workspace_id: workspaceId, type: 'feed', brief: input.brief ?? null,
    caption: input.caption ?? '', hashtags, media_urls: [input.url],
    target_platforms: ['instagram'], image_source: 'ai_poster',
    status: scheduled ? 'scheduled' : 'draft',
    scheduled_at: scheduled ? new Date(scheduled).toISOString() : null,
    ai_generated: true, created_by: user.id,
  }).select('id').single()
  if (error || !data) return { error: 'Could not save the poster.' }
  revalidatePath('/content')
  return { id: data.id }
}

/** Save the exported design PNG as a content post (draft or scheduled). */
export async function saveDesignAction(input: {
  dataUrl: string; caption: string; hashtags?: string; brief?: string; scheduledAt?: string; postId?: string
}): Promise<{ id?: string; error?: string }> {
  const { user, workspaceId } = await ctx()
  const m = input.dataUrl.match(/^data:image\/png;base64,(.+)$/)
  if (!m) return { error: 'Invalid image data.' }
  const admin = createAdminClient()
  const bytes = Buffer.from(m[1], 'base64')
  const path = `${workspaceId}/design-${Date.now()}-${Math.random().toString(36).slice(2)}.png`
  const { error: upErr } = await admin.storage.from('content-media').upload(path, bytes, { contentType: 'image/png', upsert: false })
  if (upErr) return { error: `Upload failed: ${upErr.message}` }
  const publicUrl = admin.storage.from('content-media').getPublicUrl(path).data.publicUrl

  const hashtags = (input.hashtags ?? '').split(/[\s,]+/).map((h) => h.replace(/^#/, '')).filter(Boolean)
  const scheduled = input.scheduledAt?.trim()
  const row: Record<string, unknown> = {
    workspace_id: workspaceId, type: 'feed', brief: input.brief ?? null,
    caption: input.caption ?? '', hashtags, media_urls: [publicUrl],
    target_platforms: ['instagram'], image_source: 'design',
    status: scheduled ? 'scheduled' : 'draft',
    scheduled_at: scheduled ? new Date(scheduled).toISOString() : null,
    ai_generated: true, created_by: user.id,
  }
  if (input.postId) {
    await admin.from('content_posts').update(row).eq('id', input.postId).eq('workspace_id', workspaceId)
    revalidatePath('/content')
    return { id: input.postId }
  }
  const { data, error } = await admin.from('content_posts').insert(row).select('id').single()
  if (error || !data) return { error: 'Could not save the design.' }
  revalidatePath('/content')
  return { id: data.id }
}

export async function deletePostAction(formData: FormData): Promise<void> {
  const { workspaceId } = await ctx()
  const id = String(formData.get('id'))
  const admin = createAdminClient()
  await admin.from('content_posts').delete().eq('id', id).eq('workspace_id', workspaceId)
  revalidatePath('/content')
}
