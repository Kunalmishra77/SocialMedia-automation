/**
 * Reel script → timed beat sheet. Estimates how long each line takes to say,
 * stacks them into timecodes, labels HOOK / MID / CTA, and flags a hook past
 * 3s, beats over 4s, runs of three abstract beats, loop-back and length vs target.
 *
 * Ported from instagram-agent-skill by Jake Schincariol (MIT) — https://github.com/Jakeschincariol/instagram-agent-skill
 * (skills/ig-reel/beats.py). Same constants, rounding and advice text.
 *
 * Timings are a words-per-minute estimate (default 165), good enough to plan an
 * edit, not a substitute for recording it. Pure TS — safe in the browser.
 */

import { hookWords as words, pyFixed, pyRegex, pyRound } from './hooks'

const SENT_RE = pyRegex(String.raw`[^.!?]+[.!?]*`, 'g')
const CONCRETE_RE = pyRegex(String.raw`\$\s?\d|\b\d[\d,.]*\b|(?<!^)\b[A-Z][a-z]{2,}\b`, 'gm')
const PRETTY_RE = pyRegex(String.raw`(\d)(?=(\d{3})+$)`, 'g')
const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'if', 'of', 'to', 'in', 'on', 'for',
  'with', 'that', 'this', 'it', 'is', 'are', 'was', 'were', 'be', 'been',
  'you', 'your', 'i', 'my', 'me', 'we', 'our', 'they', 'them', 'he', 'she',
  'so', 'just', 'not', 'no', 'do', 'did', 'does', 'have', 'has', 'had',
  'will', 'can', 'at', 'as', 'by', 'from', 'out', 'up', 'off', 'one', 'all',
])

/** Seconds. Past this, the thumb has already decided. */
export const HOOK_WINDOW = 3.0
/** Seconds on one idea with no change on screen. */
export const MAX_BEAT = 4.0
/** Beats in a row with nothing checkable in them. */
export const ABSTRACT_RUN = 3

export type BeatRole = 'HOOK' | 'MID' | 'CTA' | 'HOOK/CTA' | ''

export interface Beat {
  /** Seconds from 0, rounded to 2 dp. */
  start: number
  /** Seconds, rounded to 2 dp. */
  duration: number
  role: BeatRole
  text: string
  /** Per-beat flags ("hook runs 3.6s, past the 3s mark", "4.4s on one beat"), joined with "; ". */
  warn?: string
}

export interface BeatSheet {
  words: number
  seconds: number
  wpm: number
  target: number | null
  beats: Beat[]
  /** Advice lines, in the order beats.py prints them. */
  notes: string[]
  /** The last beat repeats a non-stopword from the hook. */
  loops: boolean
}

const pyStrip = (s: string) => s.replace(/^\s+|\s+$/g, '')
const pretty = (token: string) => token.replace(PRETTY_RE, '$1,')
/** Python str.splitlines() boundaries. */
const LINE_SPLIT_RE = new RegExp('\\r\\n|[\\n\\r\\v\\f\\x1c-\\x1e\\x85\\u2028\\u2029]')

/** m:ss.s, like beats.py's tc(). */
export function formatTimecode(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = sec - m * 60
  return `${m}:${pyFixed(s, 1).padStart(4, '0')}`
}

function splitBeats(raw: string, wps: number): string[] {
  const beats: string[] = []
  for (const line of raw.split(LINE_SPLIT_RE).map(pyStrip)) {
    if (!line) continue
    if (words(line).length / wps <= MAX_BEAT * 1.5) { beats.push(line); continue }
    // Long paragraph: break at sentence ends so the timings mean something.
    const parts = Array.from(line.matchAll(SENT_RE), (m) => pyStrip(m[0])).filter(Boolean)
    let buf = ''
    for (const part of parts) {
      const candidate = pyStrip(buf + ' ' + part)
      if (buf && words(candidate).length / wps > MAX_BEAT) { beats.push(buf); buf = part }
      else buf = candidate
    }
    if (buf) beats.push(buf)
  }
  return beats
}

/**
 * Time a script into beats (one non-empty line = one beat; overlong lines are
 * split at sentence ends). An empty script yields an empty sheet (no beats, no notes).
 */
export function beatSheet(script: string, opts: { targetSeconds?: number; wpm?: number } = {}): BeatSheet {
  const wpm = opts.wpm ?? 165
  const target = opts.targetSeconds ?? null
  const wps = wpm / 60
  const texts = splitBeats(script, wps)
  if (!texts.length) return { words: 0, seconds: 0, wpm, target, beats: [], notes: [], loops: false }

  type Row = { n: number; start: number; dur: number; words: number; text: string; concrete: number; label: BeatRole; flags: string[] }
  const rows: Row[] = []
  let clock = 0
  texts.forEach((text, i) => {
    const n = words(text).length
    const dur = n / wps
    rows.push({
      n: i + 1, start: pyRound(clock, 2), dur: pyRound(dur, 2), words: n, text,
      concrete: Array.from(text.matchAll(CONCRETE_RE)).length, label: '', flags: [],
    })
    clock += dur
  })
  const total = clock

  for (const r of rows) if (r.n === 1 || r.start + r.dur <= HOOK_WINDOW) r.label = 'HOOK'
  const last = rows[rows.length - 1]
  last.label = last.label !== 'HOOK' ? 'CTA' : 'HOOK/CTA'
  const half = total / 2
  for (const r of rows) if (!r.label && r.start <= half && half < r.start + r.dur) r.label = 'MID'

  const notes: string[] = []
  const first = rows[0]
  if (first.dur > HOOK_WINDOW) {
    first.flags.push(`hook runs ${pyFixed(first.dur, 1)}s, past the ${pyFixed(HOOK_WINDOW, 0)}s mark`)
    notes.push(`Beat 1 takes ${pyFixed(first.dur, 1)}s to say. Cut it to ` +
      `${Math.trunc(HOOK_WINDOW * wps)} words or fewer, or the hook lands after ` +
      'the decision has been made.')
  }
  if (first.concrete === 0) {
    notes.push('Beat 1 has no number and no name in it. Hooks without something ' +
      'checkable are the ones that get scrolled.')
  }

  for (const r of rows) if (r.dur > MAX_BEAT) r.flags.push(`${pyFixed(r.dur, 1)}s on one beat`)
  const longBeats = rows.filter((r) => r.dur > MAX_BEAT).map((r) => r.n)
  if (longBeats.length) {
    notes.push(`Beat(s) ${longBeats.join(', ')} run past ${pyFixed(MAX_BEAT, 0)}s. ` +
      'Either split the line or change what is on screen inside it. ' +
      'A static frame is where people leave.')
  }

  let run = 0
  let start: number | null = null
  for (const r of rows) {
    if (r.concrete === 0) {
      run++
      start = start ?? r.n
      if (run === ABSTRACT_RUN) {
        notes.push(`Beats ${start}-${r.n} have nothing concrete in them. ` +
          'Put a number, a name or a price in one of them.')
      }
    } else { run = 0; start = null }
  }

  const content = (t: string) => new Set(words(t).map((w) => w.toLowerCase()).filter((w) => !STOPWORDS.has(w)))
  const lastWords = content(last.text)
  const loop = [...content(first.text)].filter((w) => lastWords.has(w)).map(pretty).sort()
  if (loop.length) {
    notes.push(`Loops: the last beat repeats "${loop.slice(0, 3).join(', ')}" from the hook. ` +
      'Second watches are free reach.')
  } else {
    notes.push('No loop. The last beat shares no word with the hook, so the video ' +
      'ends flat. Echoing one word from beat 1 is the cheapest replay you get.')
  }

  if (target) {
    const delta = total - target
    if (Math.abs(delta) <= target * 0.1) {
      notes.push(`Length is on target (${pyFixed(total, 1)}s against ${target}s).`)
    } else if (delta > 0) {
      notes.push(`${pyFixed(delta, 1)}s over target. Cut about ${Math.trunc(delta * wps)} words.`)
    } else {
      notes.push(`${pyFixed(-delta, 1)}s under target. Either add ${Math.trunc(-delta * wps)} words ` +
        'or shoot it short. Short is usually right.')
    }
  }

  return {
    words: rows.reduce((a, r) => a + r.words, 0),
    seconds: pyRound(total, 2),
    wpm,
    target,
    beats: rows.map((r) => ({
      start: r.start, duration: r.dur, role: r.label, text: r.text,
      ...(r.flags.length ? { warn: r.flags.join('; ') } : {}),
    })),
    notes,
    loops: loop.length > 0,
  }
}
