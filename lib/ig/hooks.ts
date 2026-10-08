/**
 * Reel hook scoring: five local text heuristics (length, specificity, stakes,
 * front-loading, address) plus formula classification against hooks.json.
 *
 * Ported from instagram-agent-skill by Jake Schincariol (MIT) — https://github.com/Jakeschincariol/instagram-agent-skill
 * (skills/ig-reel/hookscore.py). Same weights, thresholds and messages.
 *
 * Calibration (from the original): separates real hooks from deliberately bad
 * ones well (AUC 0.83) but barely separates a creator's hits from their misses
 * (AUC 0.56). It catches greetings, preambles and vague or overlong hooks; it is
 * not a view predictor.
 *
 * Pure TS, no Node APIs — safe in the browser.
 */

import hooksData from './data/hooks.json'

// ---------------------------------------------------------------------------
// Python `re` compatibility
// ---------------------------------------------------------------------------

const W = '\\p{L}\\p{N}_' // Python 3 str-pattern \w: Unicode alphanumerics + '_'
const B = `(?:(?<=[${W}])(?![${W}])|(?<![${W}])(?=[${W}]))` // Unicode \b
const NB = `(?:(?<=[${W}])(?=[${W}])|(?<![${W}])(?![${W}]))` // Unicode \B

/**
 * Translate a Python `re` pattern to a JS `u`-mode pattern with the same
 * semantics: leading (?i)/(?m)/(?s) become flags, (?P<n>…) → (?<n>…),
 * (?P=n) → \k<n>, \w \d \b \B become Unicode-aware like Python's, \A \Z,
 * \UXXXXXXXX → \u{…}, and lone `{`/`}` are escaped (literal in Python).
 */
export function pyRegex(src: string, flags = ''): RegExp {
  let f = flags
  let s = src
  const inline = /^\(\?([aiLmsux]+)\)/.exec(s)
  if (inline) {
    for (const c of inline[1]) if ('ims'.includes(c) && !f.includes(c)) f += c
    s = s.slice(inline[0].length)
  }
  let out = ''
  let inClass = false
  let classStart = -1 // index of the first char inside the class (after `[` / `[^`)
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (c === '\\') {
      const n = s[i + 1]
      i++
      if (n === undefined) { out += '\\\\'; break }
      if (n === 'w') out += inClass ? W : `[${W}]`
      else if (n === 'W') out += inClass ? '\\W' : `[^${W}]`
      else if (n === 'd') out += '\\p{Nd}'
      else if (n === 'D') out += inClass ? '\\D' : '\\P{Nd}'
      else if (n === 'b') out += inClass ? '\\b' : B
      else if (n === 'B') out += inClass ? '\\B' : NB
      else if (n === 'A') out += '^'
      else if (n === 'Z') out += '$(?![\\s\\S])'
      else if (n === 'U') { out += `\\u{${s.slice(i + 1, i + 9)}}`; i += 8 }
      else if (/[A-Za-z0-9]/.test(n) || '^$\\.*+?()[]{}|/-'.includes(n)) out += '\\' + n
      else out += n // Python identity escapes like \' \" \# are invalid in u-mode
      continue
    }
    if (inClass) {
      if (c === ']' && i !== classStart) inClass = false
      else if (c === ']' || c === '[') { out += '\\' + c; continue }
      out += c
      continue
    }
    if (c === '[') {
      inClass = true
      classStart = s[i + 1] === '^' ? i + 2 : i + 1
      out += c
      continue
    }
    if (c === '(' && s.startsWith('(?P<', i)) { out += '(?<'; i += 3; continue }
    if (c === '(' && s.startsWith('(?P=', i)) {
      const end = s.indexOf(')', i)
      out += `\\k<${s.slice(i + 4, end)}>`
      i = end
      continue
    }
    if (c === '{' && !/^\{\d+(?:,\d*)?\}/.test(s.slice(i))) { out += '\\{'; continue }
    if (c === '}') {
      const open = out.lastIndexOf('{')
      if (open < 0 || out[open - 1] === '\\' || !/^\{\d+(?:,\d*)?$/.test(out.slice(open))) { out += '\\}'; continue }
    }
    out += c
  }
  return new RegExp(out, f.includes('u') ? f : f + 'u')
}

/** Python's round(x, nd): exact-value rounding, ties to even. */
export function pyRound(x: number, nd = 0): number {
  if (!Number.isFinite(x)) return x
  const exact = Math.abs(x).toFixed(Math.min(100, nd + 25))
  const tail = exact.slice(exact.indexOf('.') + 1 + nd)
  if (/^50*$/.test(tail)) {
    const m = Math.floor(Math.abs(x) * 10 ** nd)
    const r = (m % 2 === 0 ? m : m + 1) / 10 ** nd
    return x < 0 ? -r : r
  }
  return Number(x.toFixed(nd))
}

/** Python's f"{x:.{nd}f}". */
export function pyFixed(x: number, nd: number): string {
  return pyRound(x, nd).toFixed(nd)
}

const g = (re: RegExp) => new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g')
const findall = (re: RegExp, text: string) => Array.from(text.matchAll(g(re)), (m) => m[0])
const anchored = (re: RegExp) => new RegExp(`^(?:${re.source})`, re.flags.replace('g', ''))
const stripQ = (w: string) => w.replace(/^['’]+|['’]+$/g, '')
const pyStrip = (s: string) => s.replace(/^\s+|\s+$/g, '')
const cpLen = (s: string) => Array.from(s).length

// ---------------------------------------------------------------------------
// Patterns and vocabularies (verbatim from hookscore.py)
// ---------------------------------------------------------------------------

const WORD_RE = pyRegex(String.raw`[A-Za-z0-9$%'’-]+`)
const DIGIT_COMMA_RE = pyRegex(String.raw`(?<=\d),(?=\d)`, 'g')
const NUMBER_RE = pyRegex(
  String.raw`\$\s?\d[\d,]*(?:\.\d+)?` +
    String.raw`|\b\d[\d,]*(?:\.\d+)?\s?` +
    String.raw`(?:%|k\b|x\b|hrs?\b|hours?\b|mins?\b|minutes?\b` +
    String.raw`|days?\b|weeks?\b|months?\b|years?\b)?`,
  'i',
)
const NUMBER_MATCH_RE = anchored(NUMBER_RE)
const PROPER_RE = pyRegex(String.raw`(?<!^)\b[A-Z][a-z]{2,}\b`)
// Python's PROPER_RE.match(word) can never succeed: (?<!^) fails at position 0.
// Kept as-is so frontload scores match the original exactly.
const PROPER_MATCH_RE = anchored(PROPER_RE)
const HASHTAG_RE = pyRegex(String.raw`(?:^|\s)#\w+`)
const EMOJI_RE = pyRegex(String.raw`[\U0001F300-\U0001FAFF☀-➿]`)
const PRICE_RE = pyRegex(String.raw`\$\s?\d`)
const YOU_RE = pyRegex(String.raw`\b(you|your|you're|youre|yourself)\b`)
const FIRST_PERSON_RE = pyRegex(String.raw`\b(i|my|me|we|our)\b`)

const SPOKEN_NUMBERS = new Set([
  'zero', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine',
  'ten', 'eleven', 'twelve', 'fifteen', 'twenty', 'thirty', 'forty', 'fifty',
  'sixty', 'seventy', 'eighty', 'ninety', 'hundred', 'thousand', 'million',
  'billion', 'dozen', 'half', 'twice', 'triple',
])
const MONEY_WORDS = new Set([
  'dollars', 'dollar', 'bucks', 'grand', 'percent', 'cents',
  'millionaire', 'billionaire', 'revenue', 'profit', 'salary', 'rent',
])
const STAKES = new Set([
  'stop', 'never', 'wrong', 'mistake', 'mistakes', 'lost', 'lose', 'losing',
  'cost', 'costs', 'broke', 'broken', 'failed', 'failure', 'fail', 'nobody',
  'no', 'not', "don't", 'dont', "doesn't", "didn't", "can't", "won't",
  'quit', 'quitting', 'fired', 'deleted', 'delete', 'killed', 'kills', 'kill',
  'replaced', 'replaces', 'cut', 'beat', 'free', 'paid', 'charged', 'hired',
  'saved', 'first',
  'banned', 'illegal', 'worst', 'hate', 'hated', 'wasted', 'waste', 'scam',
  'lie', 'lied', 'lying', 'truth', 'secret', 'hidden', 'stole', 'stolen',
  'before', 'until', 'instead', 'but', 'except', 'unless', 'problem',
  'risk', 'danger', 'warning', 'regret', 'wish', 'should', "shouldn't",
  'still', 'already', 'only', 'without', 'versus', 'vs', 'actually',
])
const WEAK_OPENERS = [
  'so', 'ok', 'okay', 'hey', 'hi', 'hello', 'guys', 'yo', 'alright',
  'welcome', 'today', 'basically', 'honestly', 'look', 'listen', 'um',
  'just', 'let', 'lets', "let's", 'i wanted', 'i want', 'one of',
  'have you', 'did you', 'do you', 'are you', 'in this', 'in today',
  'the thing', 'a lot', 'there is', 'there are', 'this is', 'it is',
  'as a', 'when it', "if you've", 'you know',
]
const IMPERATIVES = new Set([
  'stop', 'steal', 'copy', 'delete', 'try', 'watch', 'read', 'save',
  'use', 'build', 'make', 'write', 'send', 'take', 'start', 'quit',
  'never', 'always', "don't", 'dont', 'do', 'put', 'run', 'check',
])

const DEALBREAKERS: Array<[RegExp, string]> = [
  [pyRegex(String.raw`(?i)^\s*(?:stop scrolling|don'?t scroll)`),
    'Opens with "stop scrolling". Asking for attention proves you have not earned it.'],
  [pyRegex(String.raw`(?i)\b(?:in (?:this|today'?s) (?:video|reel)|i'?m going to show you|i'?ll show you how)\b`),
    'Video preamble. Delete it and open on the payoff.'],
  [pyRegex(String.raw`(?i)^\s*(?:hey |hi |what'?s up |welcome )`),
    'Greeting. Nobody came to the feed to be greeted.'],
  [HASHTAG_RE,
    'Hashtag in the hook. Hashtags belong at the bottom of the caption, if anywhere.'],
  [EMOJI_RE,
    'Emoji in the hook. On-screen text at hook size has room for words or for an emoji, not both.'],
]

// ---------------------------------------------------------------------------
// Formulas (hooks.json)
// ---------------------------------------------------------------------------

export interface HookFormula {
  id: number
  name: string
  template: string
  example: string
  on_screen: string
  best_for: string
  trap: string
  /** Python-syntax regex, case-insensitive. */
  match: string
}

/** The 26 hook formulas from hooks.json. */
export const HOOK_FORMULAS: HookFormula[] = hooksData.hooks as HookFormula[]
/** Formula ids, most specific first — the order classifyHook walks. */
export const HOOK_CLASSIFY_ORDER: number[] = hooksData.classify_order
/** General hook-writing rules from hooks.json. */
export const HOOK_RULES: string[] = hooksData.rules

const FORMULA_MATCHERS: Array<{ formula: HookFormula; re: RegExp }> = []
for (const id of HOOK_CLASSIFY_ORDER) {
  const formula = HOOK_FORMULAS.find((h) => h.id === id)
  if (!formula?.match) continue
  try {
    FORMULA_MATCHERS.push({ formula, re: pyRegex(formula.match, 'i') })
  } catch {
    // one bad pattern must not take the module down; that formula just never matches
  }
}

/** First formula (in classify_order, case-insensitive) whose `match` regex hits `text`, else null. */
export function classifyHook(text: string): HookFormula | null {
  for (const { formula, re } of FORMULA_MATCHERS) if (re.test(text)) return formula
  return null
}

// ---------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------

const clamp = (n: number) => Math.max(0, Math.min(100, n))

/** Spoken-word tokens; "$18,000" counts as one word. */
export function hookWords(text: string): string[] {
  return findall(WORD_RE, text.replace(DIGIT_COMMA_RE, ''))
}

type Check = [score: number, detail: string]

function checkLength(text: string): Check {
  const n = hookWords(text).length
  const secs = n / 2.75
  const chars = cpLen(pyStrip(text))
  let score: number
  if (n >= 5 && n <= 12) score = 100
  else if (n < 5) score = clamp(100 - (5 - n) * 20)
  else score = clamp(100 - (n - 12) * 11)
  if (chars > 60) score -= 12
  return [clamp(score), `${n} words, ${chars} chars, ~${pyFixed(secs, 1)}s spoken (want 5-12 words)`]
}

function checkSpecificity(text: string): Check {
  const nums = findall(NUMBER_RE, text).map(pyStrip).filter(Boolean)
  const propers = new Set(findall(PROPER_RE, text))
  const low = hookWords(text).map((w) => stripQ(w.toLowerCase()))
  const spoken = low.filter((w) => SPOKEN_NUMBERS.has(w) || MONEY_WORDS.has(w))
  const hits = nums.length + propers.size + spoken.length
  const score = hits === 0 ? 15 : clamp(45 + hits * 30)
  const found = [...nums.slice(0, 2), ...[...propers].sort().slice(0, 2), ...spoken.slice(0, 2)].join(', ')
  return [score, `${hits} concrete marker(s)` + (found ? `: ${found}` : ' - no number, no name, nothing checkable')]
}

function checkStakes(text: string): Check {
  const w = hookWords(text).map((x) => stripQ(x.toLowerCase()))
  const markers = [...new Set(w.filter((x) => STAKES.has(x)))].sort()
  if (PRICE_RE.test(text)) markers.push('a price')
  const n = markers.length
  const score = n === 0 ? 20 : n === 1 ? 70 : 100
  const detail = `${n} tension marker(s)` +
    (markers.length ? `: ${markers.slice(0, 4).join(', ')}` : ' - nothing is at stake in this line')
  return [clamp(score), detail]
}

function checkFrontload(text: string): Check {
  const w = hookWords(text)
  if (!w.length) return [0, 'empty']
  const low = w.map((x) => stripQ(x.toLowerCase()))
  const opener = low.slice(0, 2).join(' ')
  let penalty = 0
  let hitOpener: string | null = null
  for (const weak of WEAK_OPENERS) {
    if (opener.startsWith(weak) || low[0] === weak) { penalty = 30; hitOpener = weak; break }
  }
  let payload: number | null = null
  for (let i = 0; i < low.length; i++) {
    const t = low[i]
    if (STAKES.has(t) || SPOKEN_NUMBERS.has(t) || MONEY_WORDS.has(t) ||
        NUMBER_MATCH_RE.test(w[i]) || (i > 0 && PROPER_MATCH_RE.test(w[i]))) { payload = i; break }
  }
  let base: number
  let where: string
  if (payload === null) { base = 30; where = 'no payload word anywhere in the line' }
  else if (payload <= 3) { base = 100; where = `payload at word ${payload + 1}` }
  else if (payload <= 6) { base = 70; where = `payload at word ${payload + 1}, could move forward` }
  else { base = 40; where = `payload at word ${payload + 1}, too late` }
  return [clamp(base - penalty), where + (hitOpener ? `; weak opener "${hitOpener}"` : '')]
}

function checkAddress(text: string): Check {
  const low = text.toLowerCase()
  const w = hookWords(text).map((x) => stripQ(x.toLowerCase()))
  if (YOU_RE.test(low)) return [100, 'speaks to the viewer']
  if (w.length && IMPERATIVES.has(w[0])) return [90, `imperative opener ("${w[0]}")`]
  if (FIRST_PERSON_RE.test(low)) return [70, 'first person, no viewer named']
  return [35, 'third person, nobody in the room']
}

const CHECKS = [
  { key: 'LENGTH', label: 'Length', fn: checkLength },
  { key: 'SPECIFICITY', label: 'Specificity', fn: checkSpecificity },
  { key: 'STAKES', label: 'Stakes', fn: checkStakes },
  { key: 'FRONTLOAD', label: 'Front-load', fn: checkFrontload },
  { key: 'ADDRESS', label: 'Address', fn: checkAddress },
] as const

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export type HookBand = 'STRONG' | 'OK' | 'WEAK'

export interface HookScore {
  hook: string
  /** 0-100, rounded to 1 decimal. */
  score: number
  band: HookBand
  checks: Array<{ key: string; label: string; score: number; note?: string }>
  weakest: { key: string; score: number }
  dealbreakers: string[]
  formula: { id: number | string; name: string } | null
}

/**
 * Score one hook: 0.6 × mean + 0.4 × min of the five checks, −15 per
 * dealbreaker. STRONG needs ≥70 overall, every check ≥55 and no dealbreakers;
 * OK is ≥50.
 */
export function scoreHook(hook: string): HookScore {
  const results = CHECKS.map((c) => ({ c, r: c.fn(hook) }))
  const dealbreakers = DEALBREAKERS.filter(([re]) => re.test(hook)).map(([, msg]) => msg)
  const scores = results.map((x) => x.r[0])
  const min = Math.min(...scores)
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length
  const overall = clamp(mean * 0.6 + min * 0.4 - dealbreakers.length * 15)
  const band: HookBand = overall >= 70 && min >= 55 && !dealbreakers.length ? 'STRONG' : overall >= 50 ? 'OK' : 'WEAK'
  const weak = results[scores.indexOf(min)]
  const formula = classifyHook(hook)
  return {
    hook,
    score: pyRound(overall, 1),
    band,
    checks: results.map(({ c, r }) => ({ key: c.key, label: c.label, score: pyRound(r[0], 1), note: r[1] })),
    weakest: { key: weak.c.key, score: pyRound(weak.r[0], 1) },
    dealbreakers,
    formula: formula ? { id: formula.id, name: formula.name } : null,
  }
}

/** Score each non-empty (trimmed) hook and sort by score, highest first (stable). */
export function rankHooks(hooks: string[]): HookScore[] {
  return hooks
    .map(pyStrip)
    .filter(Boolean)
    .map(scoreHook)
    .sort((a, b) => b.score - a.score)
}
