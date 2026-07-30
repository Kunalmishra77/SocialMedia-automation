import 'server-only'

import type { createAdminClient } from '@/lib/supabase/admin'
import { getBrandProfile } from '@/lib/ai/brand'
import { generateContent, suggestTopic } from '@/lib/ai/content-gen'
import { generatePostImage } from '@/lib/ai/image-gen'
import { retrieveKbContext } from '@/lib/ai/reply'

type Admin = ReturnType<typeof createAdminClient>

export interface ContentPlan {
  id: string
  workspace_id: string
  platforms: string[]
  frequency: string
  days_of_week: number[]
  time_of_day: string
  timezone: string
  themes: string | null
  mode: string
  is_active: boolean
  next_run_at: string | null
}

/** Minutes the timezone is ahead of UTC at the given instant (DST-aware). */
function tzOffsetMinutes(date: Date, tz: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
  const map: Record<string, number> = {}
  for (const p of dtf.formatToParts(date)) if (p.type !== 'literal') map[p.type] = Number(p.value)
  const asUtc = Date.UTC(map.year, map.month - 1, map.day, map.hour === 24 ? 0 : map.hour, map.minute, map.second)
  return Math.round((asUtc - date.getTime()) / 60000)
}

/** Convert a wall-clock time in `tz` to the corresponding UTC Date. */
function wallToUtc(y: number, mo: number, d: number, h: number, mi: number, tz: string): Date {
  const guess = Date.UTC(y, mo, d, h, mi)
  const off = tzOffsetMinutes(new Date(guess), tz)
  return new Date(guess - off * 60000)
}

/** Calendar Y/M/D of an instant as seen in `tz`. */
function partsInTz(date: Date, tz: string): { y: number; mo: number; d: number } {
  const dtf = new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' })
  const map: Record<string, number> = {}
  for (const p of dtf.formatToParts(date)) if (p.type !== 'literal') map[p.type] = Number(p.value)
  return { y: map.year, mo: map.month - 1, d: map.day }
}

/** Next run instant (UTC) for a plan strictly after `from`. */
export function computeNextRun(plan: Pick<ContentPlan, 'frequency' | 'days_of_week' | 'time_of_day' | 'timezone'>, from: Date): Date {
  const [hh, mm] = (plan.time_of_day || '09:00').split(':').map(Number)
  const H = isNaN(hh) ? 9 : hh
  const M = isNaN(mm) ? 0 : mm
  const weekly = plan.frequency === 'weekly' && plan.days_of_week?.length > 0
  const days = new Set(plan.days_of_week ?? [])
  const start = partsInTz(from, plan.timezone)

  for (let i = 0; i < 14; i++) {
    const base = new Date(Date.UTC(start.y, start.mo, start.d))
    base.setUTCDate(base.getUTCDate() + i)
    if (weekly && !days.has(base.getUTCDay())) continue
    const utc = wallToUtc(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate(), H, M, plan.timezone)
    if (utc.getTime() > from.getTime() + 1000) return utc
  }
  // Fallback: 24h out (shouldn't hit for valid plans).
  return new Date(from.getTime() + 24 * 3600 * 1000)
}

/**
 * Generate one post from a plan: pick a topic, write per-platform copy, design a
 * visual, and insert a content_posts row. Manual mode → pending_approval;
 * autopilot → scheduled at `scheduledAt` (defaults to now). Shared by the cron
 * and the "Generate now" action.
 */
export async function generateFromPlan(
  admin: Admin,
  plan: ContentPlan,
  opts: { scheduledAt?: Date } = {},
): Promise<{ postId?: string; brief?: string; error?: string }> {
  const brand = await getBrandProfile(admin, plan.workspace_id)

  const { data: recentRows } = await admin
    .from('content_posts')
    .select('brief')
    .eq('workspace_id', plan.workspace_id)
    .not('brief', 'is', null)
    .order('created_at', { ascending: false })
    .limit(10)
  const recent = (recentRows ?? []).map((r) => r.brief as string).filter(Boolean)

  const brief = (await suggestTopic({ brand, themes: plan.themes ?? undefined, recent }))
    || plan.themes
    || `A helpful post for ${brand.business_name}`

  const kbContext = await retrieveKbContext(admin, plan.workspace_id, brief, false)
  const gen = await generateContent({ brand, brief, platforms: plan.platforms, kbContext })
  if (!gen) return { error: 'Content generation failed.' }

  const image = await generatePostImage(admin, plan.workspace_id, { prompt: gen.image_prompt, headline: gen.title, brand })
  const igVariant = gen.variants.instagram ?? Object.values(gen.variants)[0]

  const autopilot = plan.mode === 'autopilot'
  const scheduledAt = opts.scheduledAt ?? new Date()

  const { data: row, error } = await admin
    .from('content_posts')
    .insert({
      workspace_id: plan.workspace_id,
      plan_id: plan.id,
      type: 'feed',
      brief,
      caption: igVariant?.caption ?? '',
      hashtags: igVariant?.hashtags ?? [],
      media_urls: image ? [image.url] : [],
      target_platforms: plan.platforms,
      platform_variants: gen.variants,
      image_prompt: gen.image_prompt,
      image_source: image?.source ?? null,
      status: autopilot ? 'scheduled' : 'pending_approval',
      scheduled_at: autopilot ? scheduledAt.toISOString() : null,
      requires_approval: !autopilot,
      approved_at: autopilot ? new Date().toISOString() : null,
      ai_generated: true,
      ai_prompt: brief,
      ai_model: process.env.AI_MODEL ?? null,
    })
    .select('id')
    .single()
  if (error || !row) return { error: 'Could not save the generated post.' }
  return { postId: row.id, brief }
}
