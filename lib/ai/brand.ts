import 'server-only'

import type { createAdminClient } from '@/lib/supabase/admin'

type Admin = ReturnType<typeof createAdminClient>

/**
 * Structured brand/business profile that grounds AI content generation.
 * Persisted in workspaces.settings.brand_profile (JSONB) so no migration is
 * needed; name/industry/brand_color/logo fall back to workspace columns.
 */
export interface BrandProfile {
  business_name: string
  industry: string
  target_audience: string
  brand_voice: string        // tone of communication
  content_style: string      // e.g. educational, playful, minimal
  language: string           // preferred output language
  products: string           // products / services offered
  topics_focus: string[]     // topics to lean into
  topics_avoid: string[]     // topics / claims to never make
  default_cta: string        // preferred call-to-action
  competitors: string
  objectives: string         // content goals (awareness, sales, ...)
  brand_colors: string[]     // hex palette; [0] is primary
  logo_url: string
  // ── Visual identity (Brand Kit — used for designed posts) ──
  website: string            // footer website
  phone: string              // footer phone
  handle: string             // social handle
  theme: string              // 'bold' | 'minimal' | 'dark' | 'playful'
  imagery_style: string      // e.g. 'real photo' | '3d render' | 'illustration' | 'abstract gradient'
  product_images: string[]   // real product photos → used as inputs so AI shows the actual products
}

const EMPTY: BrandProfile = {
  business_name: '', industry: '', target_audience: '', brand_voice: '',
  content_style: '', language: 'English', products: '', topics_focus: [],
  topics_avoid: [], default_cta: '', competitors: '', objectives: '',
  brand_colors: [], logo_url: '',
  website: '', phone: '', handle: '', theme: 'bold', imagery_style: 'real photo', product_images: [],
}

/** Merge the workspace columns + settings.brand_profile into a full profile. */
export async function getBrandProfile(admin: Admin, workspaceId: string): Promise<BrandProfile> {
  const { data: ws } = await admin
    .from('workspaces')
    .select('name, industry, brand_color, logo_url, settings')
    .eq('id', workspaceId)
    .maybeSingle()

  const settings = (ws?.settings ?? {}) as { brand_profile?: Partial<BrandProfile>; agent_persona?: string }
  const bp = settings.brand_profile ?? {}

  return {
    ...EMPTY,
    ...bp,
    business_name: bp.business_name || ws?.name || 'this business',
    industry: bp.industry || ws?.industry || '',
    language: bp.language || 'English',
    brand_colors: bp.brand_colors?.length ? bp.brand_colors : (ws?.brand_color ? [ws.brand_color] : []),
    logo_url: bp.logo_url || ws?.logo_url || '',
    // persona is a useful voice hint when brand_voice isn't set explicitly
    brand_voice: bp.brand_voice || settings.agent_persona || '',
    topics_focus: bp.topics_focus ?? [],
    topics_avoid: bp.topics_avoid ?? [],
    website: bp.website || '',
    phone: bp.phone || '',
    handle: bp.handle || '',
    theme: bp.theme || 'bold',
    imagery_style: bp.imagery_style || 'real photo',
    product_images: bp.product_images ?? [],
  }
}

/** True if the client has filled in enough brand context to personalise output. */
export function brandIsConfigured(b: BrandProfile): boolean {
  return !!(b.target_audience || b.brand_voice || b.products || b.objectives)
}

/** Render the brand profile as a prompt block the content engine can ground on. */
export function buildBrandBlock(b: BrandProfile): string {
  const lines: string[] = [`Business: ${b.business_name}`]
  if (b.industry) lines.push(`Industry / niche: ${b.industry}`)
  if (b.target_audience) lines.push(`Target audience: ${b.target_audience}`)
  if (b.brand_voice) lines.push(`Brand voice / tone: ${b.brand_voice}`)
  if (b.content_style) lines.push(`Content style: ${b.content_style}`)
  if (b.products) lines.push(`Products / services: ${b.products}`)
  if (b.objectives) lines.push(`Content objectives: ${b.objectives}`)
  if (b.default_cta) lines.push(`Preferred call-to-action: ${b.default_cta}`)
  if (b.topics_focus.length) lines.push(`Lean into these topics: ${b.topics_focus.join(', ')}`)
  if (b.topics_avoid.length) lines.push(`NEVER mention or make claims about: ${b.topics_avoid.join(', ')}`)
  if (b.competitors) lines.push(`Competitor references (for context, do not disparage): ${b.competitors}`)
  if (b.theme) lines.push(`Visual theme: ${b.theme}.`)
  if (b.imagery_style) lines.push(`Preferred imagery style: ${b.imagery_style}.`)
  lines.push(`Write all content in ${b.language}.`)
  return lines.join('\n')
}
