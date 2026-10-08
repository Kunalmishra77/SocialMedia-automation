'use server'

import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { getUser, getActiveMembership } from '@/lib/authz'
import { callAI, aiConfigured } from '@/lib/ai/client'
import { withinAiQuota } from '@/lib/quota'
import { logUsage } from '@/lib/usage'
import { getConnectedIg } from '@/lib/ig/account'
import { fetchIgMedia, fetchIgMediaInsights, type IgMediaInsights, type IgMediaItem } from '@/lib/channels/instagram'
import { rankOutliers, type OutlierRow, type RankedRow } from '@/lib/ig/outlier'
import { scoreHook } from '@/lib/ig/hooks'
import { NEVER_FABRICATE, PLAIN_LANGUAGE } from '@/lib/ig/playbook'
import { polishCopy } from '@/lib/ig/polish'

/* ------------------------------------------------------------------ types */

export type AuditMetric = 'views' | 'reach' | 'engagement'
export type AuditFormat = 'Reel' | 'Carousel' | 'Image'

/** One post as fed to rankOutliers. `views` holds the chosen metric, not necessarily real views. */
export interface AuditRow extends OutlierRow {
  id: string
  format: AuditFormat
  /** First non-empty caption line (the hook proxy). */
  firstLine: string
  permalink: string | null
  thumbnail: string | null
  postedAt: string
  likes: number
  comments: number
  /** Real view count from insights, when available. */
  viewCount?: number
  /** Younger than 48h: shown, but kept out of the baseline and the tiers. */
  tooEarly: boolean
}

export type AuditPost = RankedRow<AuditRow>

export interface GroupStat { label: string; count: number; medianMultiple: number }

export interface ThirdStat {
  count: number
  medianHookScore: number | null
  medianHookWords: number | null
  formulas: { name: string; count: number }[]
  formats: { name: string; count: number }[]
  medianSendsPerReach: number | null
  medianSavesPerReach: number | null
}

export interface AuditBreakdown {
  /** Posts that count toward the baseline (older than 48h). */
  judged: number
  tooEarly: number
  baseline: number
  byFormat: GroupStat[]
  /** Only when judged >= 8. */
  byWeekday: GroupStat[] | null
  byHour: GroupStat[] | null
  top: ThirdStat
  bottom: ThirdStat
}

export interface AuditResult {
  connected: boolean
  metric?: AuditMetric
  insights?: boolean
  handle?: string | null
  /** Judged posts ranked by multiple, then too-early posts. */
  posts?: AuditPost[]
  summary?: string[]
  breakdown?: AuditBreakdown
  error?: string
}

export interface AuditExplanation {
  verdict: string
  do_more: string[]
  stop: string[]
  next_posts: { idea: string; format: string; hook: string }[]
}

export interface ExplainInput {
  metric: AuditMetric
  insights: boolean
  summary: string[]
  breakdown: AuditBreakdown
  top: { line: string; format: string; multiple: number; formula: string | null }[]
  bottom: { line: string; format: string; multiple: number; formula: string | null }[]
}

/* ---------------------------------------------------------------- helpers */

async function ctx() {
  const user = await getUser()
  if (!user) redirect('/login')
  const { active } = await getActiveMembership(user.id)
  if (!active) redirect('/workspace/new')
  if (active.role === 'agent') throw new Error('Forbidden')
  return { user, workspaceId: active.workspaceId }
}

/** Extract the first JSON value (object or array) from a model response. */
function extractJson(raw: string): unknown | null {
  const start = raw.search(/[[{]/)
  const end = Math.max(raw.lastIndexOf('}'), raw.lastIndexOf(']'))
  if (start === -1 || end < start) return null
  try {
    return JSON.parse(raw.slice(start, end + 1))
  } catch {
    return null
  }
}

async function guard(workspaceId: string): Promise<string | null> {
  if (!aiConfigured()) return 'Add an OpenAI/OpenRouter key to enable AI generation.'
  if (!(await withinAiQuota(createAdminClient(), workspaceId))) return 'You’ve reached this month’s AI limit — upgrade your plan to keep generating.'
  return null
}

const EARLY_MS = 48 * 60 * 60 * 1000

function median(vals: number[]): number | null {
  const s = vals.filter((v) => Number.isFinite(v)).sort((a, b) => a - b)
  if (!s.length) return null
  const n = s.length
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2
}

const r2 = (v: number | null) => (v === null ? null : Math.round(v * 100) / 100)

function formatOf(m: IgMediaItem): AuditFormat {
  if (m.media_product_type === 'REELS' || m.media_type === 'VIDEO') return 'Reel'
  if (m.media_type === 'CAROUSEL_ALBUM') return 'Carousel'
  return 'Image'
}

function firstLine(caption: string): string {
  const line = caption.split('\n').map((l) => l.trim()).find(Boolean) ?? ''
  return line.slice(0, 220)
}

/** Run `fn` over `items` with at most `limit` in flight. */
async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let i = 0
  const worker = async () => {
    while (i < items.length) {
      const idx = i++
      out[idx] = await fn(items[idx])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return out
}

function countBy(items: string[]): { name: string; count: number }[] {
  const m = new Map<string, number>()
  for (const k of items) m.set(k, (m.get(k) ?? 0) + 1)
  return [...m.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count)
}

function groupStats(posts: AuditPost[], key: (p: AuditPost) => string, order?: string[]): GroupStat[] {
  const m = new Map<string, number[]>()
  for (const p of posts) {
    const k = key(p)
    if (!m.has(k)) m.set(k, [])
    m.get(k)!.push(p.multiple)
  }
  const rows = [...m.entries()].map(([label, v]) => ({ label, count: v.length, medianMultiple: r2(median(v)) ?? 0 }))
  if (order) return rows.sort((a, b) => order.indexOf(a.label) - order.indexOf(b.label))
  return rows.sort((a, b) => b.medianMultiple - a.medianMultiple)
}

function thirdStat(posts: AuditPost[]): ThirdStat {
  const hooked = posts.filter((p) => p.hookScore !== null)
  const withReach = posts.filter((p) => p.sendsPerReach !== undefined)
  return {
    count: posts.length,
    medianHookScore: r2(median(hooked.map((p) => p.hookScore as number))),
    medianHookWords: r2(median(hooked.map((p) => p.words))),
    formulas: countBy(posts.map((p) => p.formula?.name ?? 'unclassified')).slice(0, 4),
    formats: countBy(posts.map((p) => p.format)),
    medianSendsPerReach: withReach.length ? median(withReach.map((p) => p.sendsPerReach as number)) : null,
    medianSavesPerReach: withReach.length ? median(withReach.map((p) => p.savesPerReach as number)) : null,
  }
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const HOUR_BUCKETS: { label: string; from: number; to: number }[] = [
  { label: 'Night (0-6)', from: 0, to: 6 },
  { label: 'Morning (6-11)', from: 6, to: 11 },
  { label: 'Midday (11-14)', from: 11, to: 14 },
  { label: 'Afternoon (14-18)', from: 14, to: 18 },
  { label: 'Evening (18-22)', from: 18, to: 22 },
  { label: 'Late (22-24)', from: 22, to: 24 },
]

/** Weekday + hour in the viewer's timezone (falls back to UTC on a bad zone). */
function localParts(iso: string, timeZone: string): { weekday: string; hour: number } | null {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  let fmt: Intl.DateTimeFormat
  try {
    fmt = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short', hour: 'numeric', hourCycle: 'h23' })
  } catch {
    fmt = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'short', hour: 'numeric', hourCycle: 'h23' })
  }
  const parts = fmt.formatToParts(d)
  const weekday = parts.find((p) => p.type === 'weekday')?.value ?? ''
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? NaN) % 24
  if (!WEEKDAYS.includes(weekday) || !Number.isFinite(hour)) return null
  return { weekday, hour }
}

/* ---------------------------------------------------------------- actions */

/**
 * Pull the connected account's recent posts, rank them by outlier multiple
 * (metric ÷ the account's own median) and break down what separates the top
 * third from the bottom third. Read-only: no DB writes.
 */
export async function runAuditAction(opts: { limit?: 25 | 50; timeZone?: string } = {}): Promise<AuditResult> {
  const { workspaceId } = await ctx()
  const conn = await getConnectedIg(createAdminClient(), workspaceId)
  if (!conn) return { connected: false }

  const limit = opts.limit === 50 ? 50 : 25
  const timeZone = String(opts.timeZone || 'UTC').slice(0, 64)

  let media: IgMediaItem[]
  try {
    media = (await fetchIgMedia(conn.token, limit)).filter((m) => m.media_product_type !== 'STORY')
  } catch {
    media = []
  }
  if (!media.length) {
    return {
      connected: true,
      handle: conn.handle,
      error: 'No posts came back from Instagram. If you have posts, reconnect the account under Settings → Channels and try again.',
    }
  }

  // Insights: probe once; if the token lacks the permission, skip the rest.
  const insights = new Map<string, IgMediaInsights>()
  const probe = await fetchIgMediaInsights(conn.token, media[0].id)
  const hasInsights = !!probe && Object.keys(probe).length > 0
  if (hasInsights) {
    insights.set(media[0].id, probe!)
    const rest = await mapLimit(media.slice(1), 5, async (m) => ({ id: m.id, d: await fetchIgMediaInsights(conn.token, m.id) }))
    for (const { id, d } of rest) if (d) insights.set(id, d)
  }

  const now = Date.now()
  const base = media.map((m) => {
    const ins = insights.get(m.id)
    const t = new Date(m.timestamp).getTime()
    return {
      m,
      ins,
      tooEarly: Number.isFinite(t) ? now - t < EARLY_MS : false,
      engagement: (m.like_count || 0) + (m.comments_count || 0) * 2,
    }
  })
  const judgedBase = base.filter((b) => !b.tooEarly)
  const pool = judgedBase.length ? judgedBase : base
  const has = (k: 'views' | 'reach') => hasInsights && pool.length > 0 && pool.every((b) => typeof b.ins?.[k] === 'number')
  const metric: AuditMetric = has('views') && pool.some((b) => (b.ins?.views ?? 0) > 0)
    ? 'views'
    : has('reach') && pool.some((b) => (b.ins?.reach ?? 0) > 0)
      ? 'reach'
      : 'engagement'

  const account = conn.handle || 'me'
  const rows: AuditRow[] = base.map(({ m, ins, tooEarly, engagement }) => {
    const line = firstLine(m.caption)
    const value = metric === 'views' ? ins?.views ?? 0 : metric === 'reach' ? ins?.reach ?? 0 : engagement
    const row: AuditRow = {
      account,
      id: m.id,
      views: value,
      hook: line,
      caption: m.caption.slice(0, 600),
      url: m.permalink ?? undefined,
      likes: m.like_count || 0,
      comments: m.comments_count || 0,
      postedAt: m.timestamp,
      format: formatOf(m),
      firstLine: line,
      permalink: m.permalink,
      thumbnail: m.thumbnail_url || m.media_url,
      tooEarly,
    }
    if (ins) {
      if (typeof ins.reach === 'number') row.reach = ins.reach
      if (typeof ins.saved === 'number') row.saves = ins.saved
      if (typeof ins.shares === 'number') row.sends = ins.shares
      if (typeof ins.views === 'number') row.viewCount = ins.views
    }
    return row
  })

  const judgedRows = rows.filter((r) => !r.tooEarly)
  const earlyRows = rows.filter((r) => r.tooEarly)
  const { ranked, summary } = rankOutliers(judgedRows)
  const baseline = ranked[0]?.baseline ?? 0

  // Too-early posts: score against the judged baseline, but never tier them.
  const early: AuditPost[] = earlyRows.map((r) => {
    const hs = r.hook ? scoreHook(r.hook) : null
    const reach = r.reach ?? 0
    const post: AuditPost = {
      ...r,
      multiple: baseline ? Math.round((r.views / baseline) * 100) / 100 : 0,
      baseline,
      hookScore: hs ? hs.score : null,
      formula: hs?.formula ?? null,
      tier: 'mid',
      words: r.hook ? r.hook.split(/\s+/).filter(Boolean).length : 0,
    }
    if (reach > 0) {
      post.sendsPerReach = (r.sends ?? 0) / reach
      post.savesPerReach = (r.saves ?? 0) / reach
    }
    return post
  })

  const n = ranked.length
  const enough = n >= 8
  const byWeekday = enough
    ? groupStats(ranked.filter((p) => localParts(p.postedAt, timeZone)), (p) => localParts(p.postedAt, timeZone)!.weekday, WEEKDAYS)
    : null
  const byHour = enough
    ? groupStats(
        ranked.filter((p) => localParts(p.postedAt, timeZone)),
        (p) => {
          const h = localParts(p.postedAt, timeZone)!.hour
          return HOUR_BUCKETS.find((b) => h >= b.from && h < b.to)?.label ?? HOUR_BUCKETS[0].label
        },
        HOUR_BUCKETS.map((b) => b.label),
      )
    : null

  const breakdown: AuditBreakdown = {
    judged: n,
    tooEarly: early.length,
    baseline,
    byFormat: groupStats(ranked, (p) => p.format),
    byWeekday,
    byHour,
    top: thirdStat(ranked.filter((p) => p.tier === 'top')),
    bottom: thirdStat(ranked.filter((p) => p.tier === 'bottom')),
  }

  return {
    connected: true,
    metric,
    insights: hasInsights,
    handle: conn.handle,
    posts: [...ranked, ...early],
    summary: n >= 3 ? summary : [],
    breakdown,
  }
}

const clip = (v: unknown, max: number) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
const fmtNum = (v: number | null) => (v === null ? 'n/a' : String(Math.round(v * 100) / 100))
const fmtPct = (v: number | null) => (v === null ? 'n/a' : `${(v * 100).toFixed(2)}%`)

/**
 * Optional AI read of a computed audit: a verdict, what to do more of, what to
 * stop, and three next posts. Grounded strictly in the numbers passed in.
 */
export async function explainAuditAction(input: ExplainInput): Promise<{ explanation?: AuditExplanation; error?: string }> {
  const { workspaceId } = await ctx()
  const err = await guard(workspaceId)
  if (err) return { error: err }
  const b = input?.breakdown
  if (!b || !Array.isArray(input.top) || !Array.isArray(input.bottom) || b.judged < 3) {
    return { error: 'Run the audit on at least 3 posts older than 48 hours first.' }
  }

  const metricName = input.metric === 'views' ? 'views' : input.metric === 'reach' ? 'reach' : 'engagement (likes + 2x comments)'
  const postLine = (p: ExplainInput['top'][number]) =>
    `- ${Number(p.multiple) || 0}x · ${clip(p.format, 12)} · formula: ${clip(p.formula, 40) || 'unclassified'} · "${clip(p.line, 160)}"`
  const third = (label: string, t: ThirdStat) =>
    `${label} (${t.count} posts): median hook score ${fmtNum(t.medianHookScore)}, median hook words ${fmtNum(t.medianHookWords)}, ` +
    `formulas ${t.formulas.map((f) => `${clip(f.name, 40)} x${f.count}`).join(', ') || 'n/a'}, formats ${t.formats.map((f) => `${f.name} x${f.count}`).join(', ') || 'n/a'}` +
    (input.insights ? `, sends/reach ${fmtPct(t.medianSendsPerReach)}, saves/reach ${fmtPct(t.medianSavesPerReach)}` : '')
  const groups = (g: GroupStat[] | null) => (g && g.length ? g.map((x) => `${clip(x.label, 24)} ${x.medianMultiple}x (n=${x.count})`).join(', ') : 'not enough posts')

  const system = [
    'You are an Instagram content analyst writing a post-mortem on one account\'s own recent posts.',
    'Posts are ranked by OUTLIER MULTIPLE: the post\'s metric divided by the account\'s own median. Above 3x is a real signal; under 1.5x is a normal day.',
    'Ground every claim strictly in the numbers given. Do not invent metrics, retention data, audiences or results. If the sample is small (under 10 posts) or a difference is small, say the evidence is thin.',
    'Day and time are almost never the cause. Only mention them if the other evidence shows nothing.',
    NEVER_FABRICATE,
    PLAIN_LANGUAGE,
  ].join('\n')
  const user = [
    `Metric used: ${metricName}. Baseline (median) = ${fmtNum(Number(b.baseline) || 0)}. Judged posts: ${b.judged}.`,
    `By format (median multiple): ${groups(b.byFormat)}`,
    `By weekday: ${groups(b.byWeekday)}`,
    `By time of day: ${groups(b.byHour)}`,
    third('TOP THIRD', b.top),
    third('BOTTOM THIRD', b.bottom),
    ...(Array.isArray(input.summary) ? input.summary.slice(0, 6).map((s) => `Note: ${clip(s, 200)}`) : []),
    'TOP 5 (first caption line):', ...input.top.slice(0, 5).map(postLine),
    'BOTTOM 5 (first caption line):', ...input.bottom.slice(0, 5).map(postLine),
    '',
    'Return ONLY JSON:',
    '{"verdict": "two sentences on what separates the winners from the rest, citing numbers above", "do_more": ["3 specific things to make more of"], "stop": ["2 specific things to stop"], "next_posts": [{"idea": "one concrete post idea based on a winner", "format": "Reel|Carousel|Image", "hook": "the first line, under 16 words"}]}',
    'Exactly 3 do_more, 2 stop, 3 next_posts.',
  ].join('\n')

  const raw = await callAI([{ role: 'system', content: system }, { role: 'user', content: user }], { maxTokens: 900, temperature: 0.4 })
  if (!raw) return { error: 'The AI did not respond, try again.' }
  await logUsage(createAdminClient(), workspaceId, 'ai_generate', 1, { kind: 'post_audit' })

  const p = extractJson(raw) as Partial<Record<keyof AuditExplanation, unknown>> | null
  if (!p || typeof p !== 'object' || Array.isArray(p)) return { error: 'The AI returned an unreadable answer. Try again.' }
  const list = (v: unknown, n: number) =>
    (Array.isArray(v) ? v : []).map((s) => polishCopy(clip(s, 300))).filter(Boolean).slice(0, n)
  const explanation: AuditExplanation = {
    verdict: polishCopy(clip(p.verdict, 600)),
    do_more: list(p.do_more, 3),
    stop: list(p.stop, 2),
    next_posts: (Array.isArray(p.next_posts) ? p.next_posts : [])
      .map((x) => x as { idea?: unknown; format?: unknown; hook?: unknown })
      .map((x) => ({
        idea: polishCopy(clip(x?.idea, 300)),
        format: ['Reel', 'Carousel', 'Image'].find((f) => f.toLowerCase() === clip(x?.format, 20).toLowerCase()) ?? 'Reel',
        hook: polishCopy(clip(x?.hook, 160)),
      }))
      .filter((x) => x.idea)
      .slice(0, 3),
  }
  if (!explanation.verdict && !explanation.do_more.length && !explanation.next_posts.length) {
    return { error: 'The AI came back empty. Try again.' }
  }
  return { explanation }
}
