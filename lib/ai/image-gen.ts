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
  const key = process.env.OPENAI_API_KEY
  if (!key || !prompt) return null
  try {
    const styled = `${prompt}\n\nSquare social media image. Modern, high quality, on-brand${brand.brand_colors[0] ? `, accent color ${brand.brand_colors[0]}` : ''}. No text, no words, no logos, no watermarks.`
    const res = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: 'gpt-image-1', prompt: styled.slice(0, 3000), size: '1024x1024', quality: 'medium', n: 1 }),
    })
    if (!res.ok) return null
    const data = await res.json()
    const b64 = data?.data?.[0]?.b64_json
    if (!b64) return null
    const bytes = Buffer.from(b64, 'base64')
    const path = `${workspaceId}/ai-${Date.now()}-${Math.random().toString(36).slice(2)}.png`
    const { error } = await admin.storage.from(BUCKET).upload(path, bytes, { contentType: 'image/png', upsert: false })
    if (error) return null
    const { data: pub } = admin.storage.from(BUCKET).getPublicUrl(path)
    return { url: pub.publicUrl, source: 'ai' }
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
