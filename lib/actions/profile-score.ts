'use server'

import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { getUser, getActiveMembership } from '@/lib/authz'
import { callAI, aiConfigured } from '@/lib/ai/client'
import { getBrandProfile, buildBrandBlock } from '@/lib/ai/brand'
import { withinAiQuota } from '@/lib/quota'
import { logUsage } from '@/lib/usage'
import { NEVER_FABRICATE, PLAIN_LANGUAGE } from '@/lib/ig/playbook'
import { polishCopy } from '@/lib/ig/polish'
import { getConnectedIg } from '@/lib/ig/account'
import { fetchIgOwnProfile, fetchIgMedia } from '@/lib/channels/instagram'
import rubricData from '@/lib/ig/data/rubric.json'

// ── Types ────────────────────────────────────────────────────────────────────

export interface GridPost {
  id: string
  thumb: string | null
  firstLine: string
  mediaType: string        // IMAGE | VIDEO | CAROUSEL_ALBUM
  productType: string      // FEED | REELS
  timestamp: string
  comments: number
  permalink: string | null
}

export interface ProfileFields {
  username: string
  name: string
  bio: string
  website: string
  avatarUrl: string | null
  followers: number | null
  mediaCount: number | null
  grid: GridPost[]
}

export interface ProfileInput extends ProfileFields {
  connected: boolean
  pinned: string            // what is pinned, free text or "none"
  highlights: string        // comma list of highlight names
  linkDestination: string   // where the link goes
  notes: string             // anything else (photo, stories, contact buttons…)
}

export interface ScoredItem {
  id: string
  label: string
  points: number
  max: number
  note: string
}

export interface ProfileRewrites {
  name_field: string[]
  bio: string[]
  pinned_plan: string[]
  highlights: string[]
  link: string
  grid_covers: string[]
}

export interface ProfileScoreResult {
  score: number
  items: ScoredItem[]
  rewrites: ProfileRewrites
  previousScore: number | null
  createdAt: string
  /** Set when the audit could not be saved to history (e.g. migration 0025 missing). */
  historyNote?: string
}

export interface AuditPoint { id: string; score: number; createdAt: string }

// ── Rubric ───────────────────────────────────────────────────────────────────

interface RubricItem { id: string; points: number; full_marks: string; common_fail: string }
const RUBRIC: RubricItem[] = (rubricData as { items: RubricItem[] }).items

const LABELS: Record<string, string> = {
  name_field: 'Name field',
  bio_first_line: 'Bio first line',
  bio_body: 'Bio body',
  pinned_three: 'Pinned three',
  link: 'Link',
  highlights: 'Highlights',
  grid_legibility: 'Grid legibility',
  photo: 'Profile photo',
  handle: 'Handle',
  category_contact: 'Category & contact',
  recent_activity: 'Recent activity',
  story_presence: 'Story presence',
}

const NAME_MAX = 30
const BIO_MAX = 150

// ── Shared helpers (same pattern as reels.ts) ────────────────────────────────

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

const str = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max)
const isMissingTable = (msg: string) => /profile_audits|does not exist|schema cache|relation/i.test(msg)

/** Cut to `max` characters at a word boundary, dropping a dangling separator. */
function fitTo(text: string, max: number): string {
  const t = text.trim()
  if (t.length <= max) return t
  const cut = t.slice(0, max + 1)
  const sp = cut.lastIndexOf(' ')
  return (sp > max * 0.5 ? cut.slice(0, sp) : t.slice(0, max)).replace(/[\s|•·,:;\-–—]+$/, '').trim()
}

// ── Load ─────────────────────────────────────────────────────────────────────

/** Pull the connected account's public profile + first nine grid posts. */
export async function loadProfileAction(): Promise<{ connected: false } | { connected: true; profile: ProfileFields; error?: string }> {
  const { workspaceId } = await ctx()
  const admin = createAdminClient()
  const ig = await getConnectedIg(admin, workspaceId)
  if (!ig) return { connected: false }

  const [me, media] = await Promise.all([fetchIgOwnProfile(ig.token), fetchIgMedia(ig.token, 9)])
  const profile: ProfileFields = {
    username: me?.username ?? ig.handle?.replace(/^@/, '') ?? '',
    name: me?.name ?? '',
    bio: me?.biography ?? '',
    website: me?.website ?? '',
    avatarUrl: me?.profile_picture_url ?? null,
    followers: me?.followers_count ?? null,
    mediaCount: me?.media_count ?? null,
    grid: media.slice(0, 9).map((m) => ({
      id: m.id,
      thumb: m.thumbnail_url || m.media_url || null,
      firstLine: (m.caption.split('\n').find((l) => l.trim()) ?? '').trim().slice(0, 140),
      mediaType: m.media_type,
      productType: m.media_product_type,
      timestamp: m.timestamp,
      comments: m.comments_count,
      permalink: m.permalink,
    })),
  }
  return me
    ? { connected: true, profile }
    : { connected: true, profile, error: 'Instagram didn’t return the profile (the token may have expired). Fill the fields in by hand or reconnect.' }
}

// ── Deterministic signals ────────────────────────────────────────────────────

const GENERIC_HIGHLIGHT = /^(random|life|faves?|favou?rites?|misc|me|stuff|mine|new|old|highlights?|story|stories|daily|vibes?|mood|pics?|photos?|insta|fun|\d{2,4}|[^\p{L}\p{N}]+)$/iu
const EMOJI = /\p{Extended_Pictographic}/gu
const NONE = /^(none|no|nothing|n\/a|na|-|nil|0)?$/i

interface Signals {
  facts: string[]
  /** Hard ceilings the model can't exceed (point caps by item id). */
  caps: Record<string, number>
}

function computeSignals(p: ProfileInput): Signals {
  const facts: string[] = []
  const caps: Record<string, number> = {}

  // Name field
  const name = p.name.trim()
  const user = p.username.toLowerCase().replace(/[^a-z0-9]/g, '')
  const nameWords = name.split(/[\s|•·,:\-–—/]+/).filter(Boolean)
  const extraWords = nameWords.filter((w) => {
    const n = w.toLowerCase().replace(/[^a-z0-9]/g, '')
    return n.length > 2 && !user.includes(n)
  })
  const hasSep = /[|•·:\-–—/]/.test(name)
  if (!name) {
    facts.push('Name field: EMPTY.')
    caps.name_field = 0
  } else {
    facts.push(`Name field: "${name}" (${name.length}/${NAME_MAX} chars). Separator present: ${hasSep ? 'yes' : 'no'}. Words beyond the handle: ${extraWords.length ? extraWords.join(', ') : 'none'}.`)
    if (!hasSep && nameWords.length <= 2) {
      facts.push('Name field looks like a name only, with no searched words.')
      caps.name_field = 4
    }
  }

  // Bio
  const bio = p.bio.trim()
  const bioLines = bio.split('\n').map((l) => l.trim()).filter(Boolean)
  const first = bioLines[0] ?? ''
  const pipes = (first.match(/[|•·]/g) ?? []).length
  const emoji = (bio.match(EMOJI) ?? []).length
  if (!bio) {
    facts.push('Bio: EMPTY.')
    caps.bio_first_line = 0
    caps.bio_body = 0
  } else {
    facts.push(`Bio: ${bio.length}/${BIO_MAX} chars, ${bioLines.length} line(s), ${emoji} emoji. First line: "${first}".`)
    if (pipes >= 2) {
      facts.push(`Bio first line is pipe-soup (${pipes} separators: a list of labels, not a sentence).`)
      caps.bio_first_line = 4
    }
    if (bioLines.length <= 1 && bio.length < 50) facts.push('Bio body is nearly empty (no proof or offer beyond line one).')
  }

  // Link
  const site = p.website.trim()
  const dest = p.linkDestination.trim()
  if (!site && NONE.test(dest)) {
    facts.push('Link: NONE.')
    caps.link = 0
  } else {
    const menu = /linktr|beacons|lnk\.bio|taplink|bio\.link|stan\.store|komi|menu|several|multiple|links/i.test(`${site} ${dest}`)
    facts.push(`Link: ${site || '(not visible via API)'}; goes to: ${dest || '(not described)'}${menu ? '. Looks like a link menu, not one destination.' : '.'}`)
    if (menu) caps.link = 4
  }

  // Highlights
  const hl = NONE.test(p.highlights.trim()) ? [] : p.highlights.split(/[,\n]/).map((h) => h.trim()).filter(Boolean)
  if (!hl.length) {
    facts.push('Highlights: NONE.')
    caps.highlights = 0
  } else {
    const generic = hl.filter((h) => GENERIC_HIGHLIGHT.test(h))
    facts.push(`Highlights (${hl.length}): ${hl.join(', ')}. In the 4-6 range: ${hl.length >= 4 && hl.length <= 6 ? 'yes' : 'no'}. Generic names: ${generic.length ? generic.join(', ') : 'none'}.`)
    if (generic.length >= Math.ceil(hl.length / 2)) caps.highlights = 3
  }

  // Pinned
  if (NONE.test(p.pinned.trim())) {
    facts.push('Pinned posts: NONE.')
    caps.pinned_three = 0
  } else {
    facts.push(`Pinned posts (user description): ${p.pinned.trim()}`)
  }

  // Handle
  const handle = p.username.trim()
  if (handle) {
    const unders = (handle.match(/[_.]/g) ?? []).length
    const digits = (handle.match(/\d/g) ?? []).length
    facts.push(`Handle: @${handle} (${handle.length} chars, ${unders} underscores/dots, ${digits} digits).`)
  }

  // Grid + recency
  if (p.grid.length) {
    const reels = p.grid.filter((g) => g.productType === 'REELS' || g.mediaType === 'VIDEO').length
    const noText = p.grid.filter((g) => !g.firstLine).length
    facts.push(`Grid: ${p.grid.length} recent posts (${reels} reels). Captions' first lines: ${p.grid.map((g, i) => `${i + 1}) "${g.firstLine.slice(0, 80)}"`).join(' ')}${noText ? `. ${noText} have no caption.` : ''}`)
    facts.push('The cover images themselves were NOT seen; judge grid legibility from captions and the user notes only, and say so in the note.')
    const latest = p.grid.map((g) => Date.parse(g.timestamp)).filter((t) => !Number.isNaN(t)).sort((a, b) => b - a)[0]
    if (latest) {
      const days = Math.floor((Date.now() - latest) / 86_400_000)
      facts.push(`Last post: ${days} day(s) ago. Comments on the latest post: ${p.grid[0]?.comments ?? 0}.`)
      if (days > 30) caps.recent_activity = 2
      else if (days > 14) caps.recent_activity = 5
    }
  } else {
    facts.push('Grid: not provided; score grid_legibility and recent_activity from the notes, conservatively.')
  }

  if (p.connected) facts.push('Account is connected through the Instagram API, so it IS a professional (business/creator) account; category and contact buttons were not visible.')
  if (p.followers != null) facts.push(`Followers: ${p.followers}. Posts: ${p.mediaCount ?? 'unknown'}.`)
  facts.push('Profile photo and story ring were NOT seen; score them from the notes, or give about half marks and say what to check.')

  return { facts, caps }
}

// ── Score ────────────────────────────────────────────────────────────────────

function sanitizeInput(raw: ProfileInput): ProfileInput {
  const grid = Array.isArray(raw?.grid) ? raw.grid.slice(0, 9) : []
  return {
    connected: !!raw?.connected,
    username: str(raw?.username, 40).replace(/^@/, ''),
    name: str(raw?.name, 64),
    bio: String(raw?.bio ?? '').trim().slice(0, 400),
    website: str(raw?.website, 300),
    avatarUrl: raw?.avatarUrl ? str(raw.avatarUrl, 1000) : null,
    followers: Number.isFinite(Number(raw?.followers)) && raw?.followers != null ? Number(raw.followers) : null,
    mediaCount: Number.isFinite(Number(raw?.mediaCount)) && raw?.mediaCount != null ? Number(raw.mediaCount) : null,
    grid: grid.map((g) => ({
      id: str(g?.id, 64),
      thumb: g?.thumb ? str(g.thumb, 1000) : null,
      firstLine: str(g?.firstLine, 140),
      mediaType: str(g?.mediaType, 20),
      productType: str(g?.productType, 20),
      timestamp: str(g?.timestamp, 40),
      comments: Number(g?.comments) || 0,
      permalink: g?.permalink ? str(g.permalink, 500) : null,
    })),
    pinned: str(raw?.pinned, 500),
    highlights: str(raw?.highlights, 500),
    linkDestination: str(raw?.linkDestination, 300),
    notes: str(raw?.notes, 800),
  }
}

const strList = (v: unknown, n: number) => (Array.isArray(v) ? v.map((x) => String(x ?? '').trim()).filter(Boolean).slice(0, n) : [])

/**
 * Score the profile against the 12-item rubric. Hybrid: hard facts and point
 * ceilings are computed here; the model judges and rewrites; the total is
 * always summed here, never taken from the model.
 */
export async function scoreProfileAction(rawInput: ProfileInput): Promise<{ result?: ProfileScoreResult; error?: string }> {
  const { user, workspaceId } = await ctx()
  const err = await guard(workspaceId)
  if (err) return { error: err }
  const input = sanitizeInput(rawInput)
  if (!input.name && !input.bio && !input.username) return { error: 'Add at least the name field, handle or bio to score.' }

  const admin = createAdminClient()
  const brand = await getBrandProfile(admin, workspaceId)
  const { facts, caps } = computeSignals(input)

  const system = [
    'You audit Instagram profiles. The profile is a decision screen a stranger reaches from one reel; it gets three seconds to answer "is there more of that here, and is it for me".',
    'Score honestly. A generous score helps nobody. Most first-pass profiles land in the 30s and 40s.',
    buildBrandBlock(brand),
    'RUBRIC (id, max points, full marks, common fail):',
    ...RUBRIC.map((r) => `- ${r.id} (${r.points}): ${r.full_marks} | fails: ${r.common_fail}`),
    NEVER_FABRICATE,
    'Proof in rewrites may ONLY come from the brand\'s real proof points above. If there are none, use {{your proof}}.',
    PLAIN_LANGUAGE,
  ].join('\n')

  const userMsg = [
    'MEASURED FACTS (computed, treat as true):',
    ...facts.map((f) => `- ${f}`),
    Object.keys(caps).length ? `HARD CEILINGS (never score above): ${Object.entries(caps).map(([k, v]) => `${k} ≤ ${v}`).join(', ')}` : '',
    input.bio ? `Full bio as written:\n"""${input.bio}"""` : '',
    input.notes ? `User notes: ${input.notes}` : '',
    '',
    'Return ONLY JSON:',
    '{"items": [{"id": "name_field", "points": 3, "note": "one sentence: why points were lost (or what earns full marks)"}, ... all 12 ids],',
    ' "rewrites": {',
    `   "name_field": [3 options, each ≤ ${NAME_MAX} characters, format "{Name} | {words people search}"],`,
    `   "bio": [3 options, each ≤ ${BIO_MAX} characters; line one = who it is for and what changes; then one proof or one plain offer; sentences, no pipe lists; use \\n for line breaks],`,
    '   "pinned_plan": [3 strings: slot 1 best proof, slot 2 clearest explanation of the offer, slot 3 best introduction; say which post or what to make],',
    '   "highlights": [4 to 6 highlight names, named for buyer questions, 1-2 words each],',
    '   "link": "one destination that matches the bio, and what to drop",',
    '   "grid_covers": [up to 9 cover texts of about 4 words, one per recent post in order]',
    ' }}',
  ].filter(Boolean).join('\n')

  const raw = await callAI([{ role: 'system', content: system }, { role: 'user', content: userMsg }], { maxTokens: 1800, temperature: 0.3 })
  if (!raw) return { error: 'Scoring failed, try again.' }
  await logUsage(admin, workspaceId, 'ai_generate', 1, { kind: 'profile_score' })

  const parsed = extractJson(raw) as { items?: unknown; rewrites?: Record<string, unknown> } | null
  if (!parsed || !Array.isArray(parsed.items)) return { error: 'The AI returned an unreadable score. Try again.' }

  const byId = new Map<string, { points: number; note: string }>()
  for (const it of parsed.items as { id?: unknown; points?: unknown; note?: unknown }[]) {
    const id = String(it?.id ?? '').trim()
    if (!RUBRIC.some((r) => r.id === id) || byId.has(id)) continue
    const pts = Number(it?.points)
    byId.set(id, { points: Number.isFinite(pts) ? pts : NaN, note: polishCopy(str(it?.note, 300)) })
  }
  if (byId.size < 6) return { error: 'The AI skipped most of the rubric. Try again.' }

  const items: ScoredItem[] = RUBRIC.map((r) => {
    const got = byId.get(r.id)
    const ceiling = Math.min(r.points, caps[r.id] ?? r.points)
    if (!got || Number.isNaN(got.points)) {
      return { id: r.id, label: LABELS[r.id] ?? r.id, max: r.points, points: Math.min(ceiling, Math.round(r.points / 2)), note: 'Not scored by the AI; half marks as a placeholder. Re-score to check.' }
    }
    const points = Math.max(0, Math.min(ceiling, Math.round(got.points)))
    return { id: r.id, label: LABELS[r.id] ?? r.id, max: r.points, points, note: got.note || (points === r.points ? 'Full marks.' : r.common_fail) }
  })
  const score = items.reduce((s, i) => s + i.points, 0)

  const rw = parsed.rewrites ?? {}
  const rewrites: ProfileRewrites = {
    name_field: strList(rw.name_field, 3).map((s) => fitTo(polishCopy(s).replace(/\s*\n\s*/g, ' '), NAME_MAX)).filter(Boolean),
    bio: strList(rw.bio, 3).map((s) => fitTo(polishCopy(s.replace(/\\n/g, '\n')), BIO_MAX)).filter(Boolean),
    pinned_plan: strList(rw.pinned_plan, 3).map((s) => polishCopy(s.slice(0, 300))),
    highlights: strList(rw.highlights, 6).map((s) => s.slice(0, 15)),
    link: polishCopy(str(rw.link, 300)),
    grid_covers: strList(rw.grid_covers, 9).map((s) => s.split(/\s+/).slice(0, 6).join(' ')),
  }

  // History: previous score first, then save this one.
  let previousScore: number | null = null
  let historyNote: string | undefined
  const prev = await admin
    .from('profile_audits')
    .select('score')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!prev.error && prev.data) previousScore = Number(prev.data.score)

  const createdAt = new Date().toISOString()
  const { grid, ...rest } = input
  const { error: insErr } = await admin.from('profile_audits').insert({
    workspace_id: workspaceId,
    username: input.username || null,
    input: { ...rest, grid: grid.map((g) => ({ firstLine: g.firstLine, mediaType: g.mediaType, timestamp: g.timestamp })) },
    score,
    items,
    rewrites,
    created_by: user.id,
    created_at: createdAt,
  })
  if (insErr) historyNote = isMissingTable(insErr.message) ? 'History needs migration 0025.' : `Not saved to history: ${insErr.message}`

  return { result: { score, items, rewrites, previousScore, createdAt, historyNote } }
}

// ── History ──────────────────────────────────────────────────────────────────

/** Last 10 audit scores, oldest first (for a trend line). */
export async function listAuditsAction(): Promise<{ audits: AuditPoint[]; historyNote?: string }> {
  const { workspaceId } = await ctx()
  const { data, error } = await createAdminClient()
    .from('profile_audits')
    .select('id, score, created_at')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })
    .limit(10)
  if (error) return { audits: [], historyNote: isMissingTable(error.message) ? 'History needs migration 0025.' : undefined }
  return {
    audits: (data ?? []).map((r) => ({ id: String(r.id), score: Number(r.score), createdAt: String(r.created_at) })).reverse(),
  }
}
