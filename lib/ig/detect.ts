/**
 * Five-check panel scoring how machine-written a draft looks: sentence-length
 * variation, concreteness, stock vocabulary, typographic fingerprint, voice.
 * Local heuristics modelled on what public AI detectors measure — not a call to
 * any of them. Every check is a HUMAN score 0–100; higher is better. Pure.
 *
 * Ported from instagram-agent-skill by Jake Schincariol (MIT) — https://github.com/Jakeschincariol/instagram-agent-skill
 */

import {
  CF_RE, countMatches, countSub, fmt, lexiconRe, mean, pstdev, pyRe, pySplit, sentenceLengths, slop,
} from './_text-human'

export type DetectCheckKey = 'burstiness' | 'specificity' | 'slop' | 'fingerprint' | 'voice'

export interface DetectCheck {
  key: DetectCheckKey
  label: string
  /** 0–100, rounded to 1 decimal. */
  score: number
  detail: string
}

export interface DetectResult {
  checks: DetectCheck[]
  /** Overall HUMAN SCORE: mean × 0.6 + weakest × 0.4, rounded to 1 decimal. */
  score: number
  /** PASS: score ≥ 70 and every check ≥ 55. REVIEW: score ≥ 50. Else FLAGGED. */
  verdict: 'PASS' | 'REVIEW' | 'FLAGGED'
  /** Label of the lowest-scoring check (fix that first). */
  weakest: string
  /** Structural tell ids found by the voice check (incl. `uniform-bullets`). */
  tells: string[]
}

const WORD_RE = /[A-Za-z']+/g
const CONTRACTIONS = pyRe("\\b\\w+'(?:s|t|re|ve|ll|d|m)\\b", { i: true })
const PRONOUNS = pyRe('\\b(i|me|my|mine|we|us|our|you|your)\\b', { i: true })
const NUMBERS = pyRe('\\b\\d[\\d,.]*%?\\b|\\$\\d')
const PROPER = pyRe('(?<![.!?]\\s)(?<!^)\\b[A-Z][a-z]{2,}\\b', { m: true })
const BULLETS = pyRe('(?m)^\\s*[-*•]\\s+(.+)$')

const LEXICON = [...slop.words, ...slop.phrases].map((e) => ({ find: e.find, re: lexiconRe(e.find) }))
const STRUCTURES = slop.structures.flatMap((s) => {
  try {
    return [{ id: s.id, re: pyRe(s.regex, { m: true }) }]
  } catch {
    return []
  }
})

type Check = [number, string]

const clamp = (n: number) => Math.max(0, Math.min(100, n))

/** Map value onto 0–100 where `human` → 100 and `machine` → 0. */
function scale(value: number, human: number, machine: number): number {
  if (human === machine) return 50
  return clamp(((value - machine) / (human - machine)) * 100)
}

const words = (text: string) => text.match(WORD_RE) ?? []

/** Humans vary sentence length hard. Models write even. */
function checkBurstiness(text: string): Check {
  const lens = sentenceLengths(text)
  if (lens.length < 4) return [50, 'too short to judge']
  const mu = mean(lens)
  const cv = mu ? pstdev(lens) / mu : 0
  return [scale(cv, 0.7, 0.22), `variation ${fmt(cv, 2)} across ${lens.length} sentences (want 0.55+)`]
}

/** Numbers, names and concrete nouns. Slop is abstract. */
function checkSpecificity(text: string): Check {
  const w = words(text)
  if (w.length < 25) return [50, 'too short to judge']
  const proper = new Set(Array.from(text.matchAll(PROPER), (m) => m[0]))
  const hits = countMatches(NUMBERS, text) + proper.size
  const density = hits * (100 / w.length)
  return [scale(density, 6.0, 0.5), `${hits} concrete markers, ${fmt(density, 1)} per 100 words (want 4+)`]
}

/** Stock vocabulary density against the lexicon. */
function checkSlop(text: string): Check {
  const w = words(text)
  if (!w.length) return [50, 'empty']
  let hits = 0
  const found: string[] = []
  for (const e of LEXICON) {
    const n = countMatches(e.re, text)
    if (n) {
      hits += n
      found.push(e.find)
    }
  }
  const density = (hits * 100) / w.length
  let detail = `${hits} stock terms, ${fmt(density, 1)} per 100 words`
  if (found.length) detail += ' (' + found.sort().slice(0, 4).join(', ') + (found.length > 4 ? ', ...' : '') + ')'
  return [scale(density, 0.0, 4.0), detail]
}

/** Characters a phone keyboard does not produce. */
function checkFingerprint(text: string): Check {
  const invisible = countMatches(CF_RE, text)
  const em = countSub(text, '—')
  const curly = ['‘', '’', '“', '”'].reduce((a, c) => a + countSub(text, c), 0)
  const ellip = countSub(text, '…')
  const nbsp = [' ', ' ', ' '].reduce((a, c) => a + countSub(text, c), 0)
  const total = invisible * 4 + em * 2 + curly + ellip + nbsp
  const per1k = (total * 1000) / Math.max(Array.from(text).length, 1)
  return [
    scale(per1k, 0.0, 12.0),
    `${invisible} invisible, ${em} em dash, ${curly} curly quote, ${ellip} ellipsis, ${nbsp} hard space`,
  ]
}

/** Contractions, person, and the shapes models default to. */
function checkVoice(text: string, names: string[]): Check {
  const w = words(text)
  if (w.length < 25) return [50, 'too short to judge']
  const per100 = 100 / w.length
  const contractions = countMatches(CONTRACTIONS, text) * per100
  const person = countMatches(PRONOUNS, text) * per100
  let tells = 0
  for (const s of STRUCTURES) {
    const n = countMatches(s.re, text)
    if (n) {
      tells += n
      names.push(s.id)
    }
  }
  const bullets = Array.from(text.matchAll(BULLETS), (m) => pySplit(m[1]).length)
  const uniform = bullets.length >= 3 && pstdev(bullets) < 1.6
  let score =
    scale(contractions, 3.0, 0.0) * 0.35 + scale(person, 8.0, 1.0) * 0.35 + clamp(100 - tells * 22) * 0.3
  if (uniform) {
    score -= 12
    names.push('uniform-bullets')
  }
  let detail = `${fmt(contractions, 1)} contractions, ${fmt(person, 1)} personal pronouns per 100 words, ${tells} structural tell(s)`
  if (names.length) detail += ' [' + names.slice(0, 4).join(', ') + ']'
  return [clamp(score), detail]
}

const round1 = (n: number) => Math.round(n * 10) / 10

/** Score a draft on the five-check panel. */
export function detect(text: string): DetectResult {
  const tells: string[] = []
  const raw: Array<[DetectCheckKey, string, Check]> = [
    ['burstiness', 'BURSTINESS', checkBurstiness(text)],
    ['specificity', 'SPECIFICITY', checkSpecificity(text)],
    ['slop', 'SLOP DENSITY', checkSlop(text)],
    ['fingerprint', 'FINGERPRINT', checkFingerprint(text)],
    ['voice', 'VOICE', checkVoice(text, tells)],
  ]
  const scores = raw.map(([, , [s]]) => s)
  const lo = Math.min(...scores)
  // The weakest check drags the verdict: a detector only needs one signal.
  const overall = mean(scores) * 0.6 + lo * 0.4
  const verdict = overall >= 70 && lo >= 55 ? 'PASS' : overall >= 50 ? 'REVIEW' : 'FLAGGED'
  return {
    checks: raw.map(([key, label, [score, detail]]) => ({ key, label, score: round1(score), detail })),
    score: round1(overall),
    verdict,
    weakest: raw[scores.indexOf(lo)][1],
    tells,
  }
}
