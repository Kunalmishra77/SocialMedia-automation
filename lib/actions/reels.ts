'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { getUser, getActiveMembership } from '@/lib/authz'
import { callAI, aiConfigured } from '@/lib/ai/client'
import { getBrandProfile, buildBrandBlock } from '@/lib/ai/brand'
import { withinAiQuota } from '@/lib/quota'
import { logUsage } from '@/lib/usage'
import { captionRules, hookCatalogue, HOOK_LIBRARY, HOOK_RULES, NEVER_FABRICATE, PLAIN_LANGUAGE, REEL_RULES } from '@/lib/ig/playbook'
import { rankHooks, type HookScore } from '@/lib/ig/hooks'
import { beatSheet } from '@/lib/ig/beats'
import { polishCopy, polishTags } from '@/lib/ig/polish'
import { cleanHashtags } from '@/lib/ig/compose'

/** One hook option: what is said, what is on screen, which formula it came from. */
export interface HookOption {
  spoken: string
  onScreen: string
  formulaId: number | null
  formulaName: string | null
  score: HookScore
}

export interface ReelLine { spoken: string; onScreen: string }

export interface ReelDraft {
  lines: ReelLine[]
  caption: string
  hashtags: string[]
}

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

const clampLength = (s: number) => Math.min(90, Math.max(10, Math.round(s) || 30))

/**
 * Step 1: one idea → hook options from DIFFERENT formulas, each scored by the
 * local hook panel and ranked. The model writes; the scorer judges.
 */
export async function generateHooksAction(idea: string): Promise<{ hooks?: HookOption[]; error?: string }> {
  const { workspaceId } = await ctx()
  const err = await guard(workspaceId)
  if (err) return { error: err }
  const topic = idea.trim().slice(0, 600)
  if (!topic) return { error: 'Describe the Reel idea first.' }

  const admin = createAdminClient()
  const brand = await getBrandProfile(admin, workspaceId)
  const system = [
    'You write the first two seconds of Instagram Reels for this brand.',
    buildBrandBlock(brand),
    'HOOK RULES:', ...HOOK_RULES.map((r) => `- ${r}`),
    NEVER_FABRICATE,
    PLAIN_LANGUAGE,
    'HOOK FORMULAS (id, name, template, example, on-screen, trap):',
    hookCatalogue(),
  ].join('\n')
  const user = [
    `Reel idea: "${topic}"`,
    'Pick the 5 formulas that genuinely fit this idea (5 DIFFERENT formulas, not rewrites of one) and write one hook per formula.',
    'spoken = the first spoken sentence (under 16 words, concrete, no greeting). onScreen = the on-screen card (6 words or fewer, caps ok).',
    'Return ONLY a JSON array: [{"formula_id": 3, "spoken": "...", "onScreen": "..."}]',
  ].join('\n')

  const raw = await callAI([{ role: 'system', content: system }, { role: 'user', content: user }], { maxTokens: 700, temperature: 0.85 })
  if (!raw) return { error: 'Generation failed, try again.' }
  await logUsage(admin, workspaceId, 'ai_generate', 1, { kind: 'reel_hooks' })

  const arr = extractJson(raw)
  if (!Array.isArray(arr)) return { error: 'The AI returned an unreadable answer. Try again.' }
  const drafts = arr
    .map((h) => h as { formula_id?: unknown; spoken?: unknown; onScreen?: unknown })
    .map((h) => ({ spoken: polishCopy(String(h.spoken ?? '')), onScreen: String(h.onScreen ?? '').trim().slice(0, 60), formulaId: Number(h.formula_id) || null }))
    .filter((h) => h.spoken)
    .slice(0, 6)
  if (!drafts.length) return { error: 'No usable hooks came back. Try a more specific idea.' }

  const scored = rankHooks(drafts.map((d) => d.spoken))
  const hooks: HookOption[] = scored.map((score) => {
    const d = drafts.find((x) => x.spoken === score.hook) ?? drafts[0]
    const f = HOOK_LIBRARY.find((x) => x.id === d.formulaId)
    return { spoken: d.spoken, onScreen: d.onScreen, formulaId: f?.id ?? null, formulaName: f?.name ?? score.formula?.name ?? null, score }
  })
  return { hooks }
}

/**
 * Step 2: the chosen hook → a full script (spoken line + on-screen card per
 * beat) sized to the target length, plus a Job-A caption (the video carries the
 * hook, so the caption carries the ask and the search words).
 */
export async function writeReelScriptAction(input: {
  idea: string
  hook: { spoken: string; onScreen: string }
  seconds: number
}): Promise<{ draft?: ReelDraft; error?: string }> {
  const { workspaceId } = await ctx()
  const err = await guard(workspaceId)
  if (err) return { error: err }
  const seconds = clampLength(input.seconds)
  const admin = createAdminClient()
  const brand = await getBrandProfile(admin, workspaceId)
  const targetWords = Math.round((seconds / 60) * 165)

  const system = [
    'You write Instagram Reel scripts that people finish, in this brand\'s own spoken voice.',
    buildBrandBlock(brand),
    REEL_RULES,
    NEVER_FABRICATE,
    PLAIN_LANGUAGE,
    captionRules('A'),
  ].join('\n\n')
  const user = [
    `Idea: "${input.idea.trim().slice(0, 600)}"`,
    `Opening hook (keep it as line 1, word for word): "${input.hook.spoken}"  | on-screen: "${input.hook.onScreen}"`,
    `Target length: ${seconds} seconds ≈ ${targetWords} spoken words in total at 165 wpm.`,
    'Write 6 to 12 beats. Each beat: one short spoken line (a single idea, under 12 words) and an on-screen card (6 words or fewer, or "" when the line needs none).',
    'Line 2 is the stake. The last line delivers the payoff + ONE ask and repeats one word from the hook so the loop lands.',
    'Then a caption for this Reel and 3-5 hashtags.',
    'Return ONLY JSON: {"lines": [{"spoken": "...", "onScreen": "..."}], "caption": "...", "hashtags": ["..."]}',
  ].join('\n')

  const raw = await callAI([{ role: 'system', content: system }, { role: 'user', content: user }], { maxTokens: 1300, temperature: 0.7 })
  if (!raw) return { error: 'Generation failed, try again.' }
  await logUsage(admin, workspaceId, 'ai_generate', 1, { kind: 'reel_script' })

  const p = extractJson(raw) as { lines?: { spoken?: unknown; onScreen?: unknown }[]; caption?: unknown; hashtags?: unknown } | null
  if (!p || !Array.isArray(p.lines)) return { error: 'The AI returned an unreadable script. Try again.' }
  const lines = p.lines
    .map((l) => ({ spoken: polishCopy(String(l?.spoken ?? '')), onScreen: String(l?.onScreen ?? '').trim().slice(0, 60) }))
    .filter((l) => l.spoken)
    .slice(0, 20)
  if (!lines.length) return { error: 'The script came back empty. Try again.' }
  // The scored hook stays line 1 even if the model paraphrased it.
  lines[0] = { spoken: input.hook.spoken, onScreen: input.hook.onScreen || lines[0].onScreen }

  return {
    draft: {
      lines,
      caption: polishCopy(String(p.caption ?? '')),
      hashtags: polishTags(cleanHashtags(Array.isArray(p.hashtags) ? p.hashtags.map(String) : String(p.hashtags ?? ''))),
    },
  }
}

export interface ReelSaveInput {
  idea: string
  hook: { spoken: string; onScreen: string; formulaName: string | null; score: number }
  lines: ReelLine[]
  caption: string
  hashtags: string
  seconds: number
}

/**
 * Step 3: save the finished Reel (script kept with it). FormData carries the
 * JSON `payload`, an optional `media` video and an optional `scheduled_at` ISO;
 * with both a video and a time it goes straight onto the publishing schedule.
 */
export async function saveReelDraftAction(fd: FormData): Promise<{ ok?: boolean; scheduled?: boolean; error?: string }> {
  const { user, workspaceId } = await ctx()
  let input: ReelSaveInput
  try {
    input = JSON.parse(String(fd.get('payload') ?? '')) as ReelSaveInput
  } catch {
    return { error: 'Invalid request.' }
  }
  const lines = (input.lines ?? []).map((l) => ({ spoken: String(l.spoken ?? '').trim(), onScreen: String(l.onScreen ?? '').trim() })).filter((l) => l.spoken)
  if (!lines.length) return { error: 'The script is empty.' }
  const sheet = beatSheet(lines.map((l) => l.spoken).join('\n'), { targetSeconds: clampLength(input.seconds) })

  const admin = createAdminClient()
  const media_urls: string[] = []
  const file = fd.get('media') as File | null
  if (file && typeof file === 'object' && file.size > 0) {
    if (!file.type.startsWith('video/')) return { error: 'Upload the Reel as a video (MP4 or MOV).' }
    if (file.size > 100 * 1024 * 1024) return { error: 'Video must be under 100 MB.' }
    const ext = (file.name.split('.').pop() || 'mp4').toLowerCase()
    const path = `${workspaceId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
    const { error: upErr } = await admin.storage.from('content-media').upload(path, file, { contentType: file.type, upsert: false })
    if (upErr) return { error: `Upload failed: ${upErr.message}` }
    media_urls.push(admin.storage.from('content-media').getPublicUrl(path).data.publicUrl)
  }
  const when = String(fd.get('scheduled_at') ?? '').trim()
  const scheduledAt = when && !Number.isNaN(new Date(when).getTime()) ? new Date(when).toISOString() : null
  if (scheduledAt && !media_urls.length) return { error: 'Attach the video to schedule it, or save without a time as a draft.' }
  const scheduled = !!(scheduledAt && media_urls.length)

  const row = {
    workspace_id: workspaceId,
    type: 'reel',
    brief: String(input.idea ?? '').trim().slice(0, 600) || input.hook.spoken,
    caption: String(input.caption ?? '').trim(),
    hashtags: cleanHashtags(String(input.hashtags ?? '')),
    media_urls,
    target_platforms: ['instagram'],
    status: scheduled ? 'scheduled' : 'draft',
    scheduled_at: scheduled ? scheduledAt : null,
    ai_generated: true,
    created_by: user.id,
  }
  const script = {
    hook: input.hook,
    lines,
    seconds: Math.round(sheet.seconds * 10) / 10,
    target: clampLength(input.seconds),
    notes: sheet.notes,
  }
  let { error } = await admin.from('content_posts').insert({ ...row, script })
  // Migration 0025 not applied yet → keep the draft, put the script in the notes column.
  if (error && /script/i.test(error.message)) {
    ;({ error } = await admin.from('content_posts').insert({ ...row, notes: lines.map((l) => l.spoken).join('\n') }))
  }
  if (error) return { error: error.message }
  revalidatePath('/content')
  return { ok: true, scheduled }
}
