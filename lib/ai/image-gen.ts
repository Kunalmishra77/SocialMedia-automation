import 'server-only'

import type { createAdminClient } from '@/lib/supabase/admin'
import type { BrandProfile } from '@/lib/ai/brand'

type Admin = ReturnType<typeof createAdminClient>

export interface GeneratedImage {
  url: string
  source: 'ai' | 'template'
}

const BUCKET = 'content-media'

/**
 * Produce a post visual. Tries OpenAI gpt-image-1 first (real AI art, uploaded
 * to storage for a stable URL); on any failure or missing key, falls back to a
 * branded template card served by /api/render/content-card. Returns null only
 * if even the template URL can't be built.
 */
export async function generatePostImage(
  admin: Admin,
  workspaceId: string,
  opts: { prompt: string; headline: string; brand: BrandProfile },
): Promise<GeneratedImage | null> {
  const ai = await tryOpenAiImage(admin, workspaceId, opts.prompt, opts.brand)
  if (ai) return ai
  const url = templateCardUrl(opts.headline, opts.brand)
  return url ? { url, source: 'template' } : null
}

/** OpenAI gpt-image-1 → PNG bytes → upload to content-media. Null on any issue. */
async function tryOpenAiImage(
  admin: Admin,
  workspaceId: string,
  prompt: string,
  brand: BrandProfile,
): Promise<GeneratedImage | null> {
  const styled = `${prompt}\n\nSquare social media image. Modern, high quality, on-brand${brand.brand_colors[0] ? `, accent color ${brand.brand_colors[0]}` : ''}. No text, no words, no logos, no watermarks.`
  const url = await callGptImage(admin, workspaceId, styled, 'medium', '1024x1024')
  return url ? { url, source: 'ai' } : null
}

/**
 * Generate an art-directed PHOTOREALISTIC hero image (no template fallback).
 * Used by the design editor — returns a clean photo to composite branded text over.
 */
export async function generateHeroImage(
  admin: Admin,
  workspaceId: string,
  prompt: string,
  brand: BrandProfile,
  size: '1024x1024' | '1024x1536' = '1024x1024',
): Promise<string | null> {
  if (!prompt) return null
  const styled = [
    prompt,
    '',
    'Photorealistic, cinematic, professional photography. Sharp focus, natural lighting, high detail, editorial quality.',
    brand.brand_colors[0] ? `Subtle ${brand.brand_colors[0]} accent tones welcome.` : '',
    'Absolutely NO text, NO words, NO letters, NO logos, NO watermarks, NO UI overlays in the image.',
  ].filter(Boolean).join('\n')
  return callGptImage(admin, workspaceId, styled, 'high', size)
}

/**
 * Full AI poster — gpt-image-1 renders the complete branded poster (text + subject
 * + products) from a detailed prompt. High quality, portrait. Returns URL or null.
 */
export async function generatePoster(admin: Admin, workspaceId: string, prompt: string, size: '1024x1536' | '1024x1024' | '1536x1024' = '1024x1536'): Promise<string | null> {
  if (!prompt) return null
  return callGptImage(admin, workspaceId, prompt, 'high', size)
}

/**
 * Poster generation that INTEGRATES real brand assets (logo + product photos) —
 * passes them as input images to gpt-image-1's edits endpoint so the model uses
 * the ACTUAL logo/products (like giving ChatGPT your images). The prompt should
 * already instruct how to use them. Returns null (caller falls back) if no usable
 * raster asset or the call fails.
 */
export async function generatePosterWithAssets(admin: Admin, workspaceId: string, prompt: string, assetUrls: string[], size: string): Promise<string | null> {
  const key = process.env.OPENAI_API_KEY
  if (!key || !assetUrls.length) return null
  try {
    const form = new FormData()
    form.append('model', 'gpt-image-1')
    let added = 0
    for (const url of assetUrls) {
      try {
        const r = await fetch(url)
        if (!r.ok) continue
        const ct = r.headers.get('content-type') || 'image/png'
        if (ct.includes('svg')) continue // edits needs raster images
        const buf = Buffer.from(await r.arrayBuffer())
        form.append('image[]', new Blob([buf], { type: ct }), `asset-${added}.png`)
        added++
      } catch { /* skip this asset */ }
    }
    if (!added) return null
    form.append('prompt', prompt.slice(0, 4000))
    form.append('size', size)
    form.append('quality', 'high')
    form.append('n', '1')
    const res = await fetch('https://api.openai.com/v1/images/edits', { method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: form })
    if (!res.ok) return null
    const data = await res.json()
    const b64 = data?.data?.[0]?.b64_json
    if (!b64) return null
    const bytes = Buffer.from(b64, 'base64')
    const path = `${workspaceId}/poster-${Date.now()}-${Math.random().toString(36).slice(2)}.png`
    const { error } = await admin.storage.from(BUCKET).upload(path, bytes, { contentType: 'image/png', upsert: false })
    if (error) return null
    return admin.storage.from(BUCKET).getPublicUrl(path).data.publicUrl
  } catch {
    return null
  }
}

/** Shared gpt-image-1 call → upload → public URL. */
async function callGptImage(
  admin: Admin, workspaceId: string, prompt: string,
  quality: 'low' | 'medium' | 'high', size: string,
): Promise<string | null> {
  const key = process.env.OPENAI_API_KEY
  if (!key) return null
  try {
    const res = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: 'gpt-image-1', prompt: prompt.slice(0, 4000), size, quality, n: 1 }),
    })
    if (!res.ok) return null
    const data = await res.json()
    const b64 = data?.data?.[0]?.b64_json
    if (!b64) return null
    const bytes = Buffer.from(b64, 'base64')
    const path = `${workspaceId}/ai-${Date.now()}-${Math.random().toString(36).slice(2)}.png`
    const { error } = await admin.storage.from(BUCKET).upload(path, bytes, { contentType: 'image/png', upsert: false })
    if (error) return null
    return admin.storage.from(BUCKET).getPublicUrl(path).data.publicUrl
  } catch {
    return null
  }
}

/** Build the public /api/render/content-card URL for the branded fallback. */
export function templateCardUrl(headline: string, brand: BrandProfile): string | null {
  const base = process.env.NEXT_PUBLIC_APP_URL
  if (!base) return null
  const p = new URLSearchParams({ t: headline.slice(0, 140) })
  if (brand.business_name) p.set('b', brand.business_name)
  if (brand.brand_colors[0]) p.set('c', brand.brand_colors[0])
  if (brand.brand_colors[1]) p.set('c2', brand.brand_colors[1])
  if (brand.logo_url) p.set('logo', brand.logo_url)
  return `${base.replace(/\/$/, '')}/api/render/content-card?${p.toString()}`
}
