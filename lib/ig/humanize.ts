/**
 * Strip the machine fingerprint out of a draft. Three passes, in order:
 * invisible characters → typography (em dash, curly quotes, …) → slop lexicon.
 * Structural tells (rule-of-three, "not just X, it's Y", hashtag walls) are
 * flagged, never rewritten — reshaping a sentence needs judgement.
 * URLs and emails are protected from every pass. Pure; runs in the browser.
 *
 * Ported from instagram-agent-skill by Jake Schincariol (MIT) — https://github.com/Jakeschincariol/instagram-agent-skill
 */

import {
  CF_RE, countMatches, countSub, fmt, isUpper, lexiconRe, mean, pstdev, pyRe, pyStrip,
  sentenceLengths, slop, type SlopEntry,
} from './_text-human'

export interface HumanizeChange {
  pass: 'invisible' | 'typography' | 'lexicon'
  from: string
  to: string
  count: number
  category?: string
}

export interface HumanizeFlag {
  id: string
  label: string
  /** How to fix it by hand. */
  message: string
  /** First matching snippet, when the tell is a pattern match. */
  excerpt?: string
  count: number
}

export interface HumanizeResult {
  /** Cleaned text (trimmed). */
  text: string
  changes: HumanizeChange[]
  /** Structural tells flagged but not fixed. */
  flags: HumanizeFlag[]
}

const URL_RE = pyRe('https?://\\S+|www\\.\\S+|\\S+@\\S+\\.\\S+')
const PLACEHOLDER = (i: number) => `\x00URL${i}\x00`

/** Invisible-character patterns, compiled once. */
const INVISIBLE = slop.invisible.map((e) => {
  const cp = (s: string) => `\\u{${s.slice(2)}}`
  const [a, b] = e.cp.split('-')
  return { ...e, re: new RegExp(b ? `[${cp(a)}-${cp(b)}]` : cp(a), 'gu') }
})

/** Lexicon entries, longest first so phrases win (stable, like Python's sorted). */
const LEXICON: Array<SlopEntry & { re: RegExp }> = [...slop.phrases, ...slop.words]
  .map((e) => ({ ...e, re: lexiconRe(e.find) }))
  .sort((x, y) => Array.from(y.find).length - Array.from(x.find).length)

const STRUCTURES = slop.structures.flatMap((s) => {
  try {
    return [{ ...s, re: pyRe(s.regex, { m: true }) }]
  } catch {
    return []
  }
})

const R = {
  emDash: pyRe('\\s*—\\s*'),
  enDigit: pyRe('\\s*–\\s*(?=\\d)'),
  enSpaced: pyRe('\\s+–\\s+'),
  commaPunct: pyRe(',\\s*([,.;:!?])'),
  commaNl: pyRe(',\\s*\\n'),
  multiSpace: pyRe('[ \\t]{2,}'),
  leadPunct: pyRe('(?m)^[ \\t]*(?:[,.;:]+[ \\t]*)+'),
  leadSpace: pyRe('(?m)^[ \\t](?=\\S)'),
  spacePunct: pyRe('\\s+([,.;:!?])'),
  dots: pyRe('\\.\\s*\\.+'),
  bangDot: pyRe('([!?])\\s*\\.'),
  blankLine: pyRe('(?m)^[ \\t]+$'),
  manyNl: pyRe('\\n{3,}'),
  splice: pyRe(',\\s*(also|so|still|basically|in the end)\\s*,\\s*'),
  starts: pyRe('(?:^|[.!?]\\s+|\\n)\\s*([A-Za-z])'),
  lowerStart: pyRe('(?:^|(?<=[.!?] )|(?<=[.!?]\\n)|(?<=\\n))\\s*([a-z])'),
}

function protectUrls(text: string): [string, string[]] {
  const found: string[] = []
  const out = text.replace(URL_RE, (m) => {
    found.push(m)
    return PLACEHOLDER(found.length - 1)
  })
  return [out, found]
}

function restoreUrls(text: string, found: string[]): string {
  found.forEach((url, i) => {
    text = text.split(PLACEHOLDER(i)).join(url)
  })
  return text
}

function passInvisible(text: string, changes: HumanizeChange[]): string {
  for (const e of INVISIBLE) {
    const n = countMatches(e.re, text)
    if (!n) continue
    changes.push({ pass: 'invisible', from: `${e.cp} ${e.name}`, to: e.action === 'delete' ? '(deleted)' : '(space)', count: n, category: e.action })
    text = text.replace(e.re, e.action === 'delete' ? '' : ' ')
  }
  // Any remaining Cf (format) character is invisible by definition.
  const stray = countMatches(CF_RE, text)
  if (stray) {
    changes.push({ pass: 'invisible', from: 'other invisible format chars', to: '(deleted)', count: stray, category: 'delete' })
    text = text.replace(CF_RE, '')
  }
  return text
}

function passTypographic(text: string, changes: HumanizeChange[]): string {
  for (const e of slop.typographic) {
    const ch = e.from
    const n = countSub(text, ch)
    if (!n) continue
    changes.push({ pass: 'typography', from: ch, to: e.to.trim() || '(space)', count: n, category: e.name })
    if (ch === '—') {
      // " word — word " and "word—word" both collapse to a comma + space.
      text = text.replace(R.emDash, ', ')
    } else if (ch === '–') {
      text = text.replace(R.enDigit, '-') // 5–10 -> 5-10
      text = text.replace(R.enSpaced, ', ') // used as em dash
      text = text.split('–').join('-')
    } else {
      text = text.split(ch).join(e.to)
    }
  }
  // A comma inserted before existing punctuation reads wrong.
  text = text.replace(R.commaPunct, '$1')
  text = text.replace(R.commaNl, '\n')
  return text
}

function matchCase(src: string, repl: string): string {
  if (!repl) return repl
  if (isUpper(src) && Array.from(src).length > 1) return repl.toUpperCase()
  const [first] = Array.from(src)
  if (isUpper(first)) {
    const [r0, ...rest] = Array.from(repl)
    return r0.toUpperCase() + rest.join('')
  }
  return repl
}

function passLexical(text: string, changes: HumanizeChange[]): string {
  for (const e of LEXICON) {
    const n = countMatches(e.re, text)
    if (!n) continue
    changes.push({ pass: 'lexicon', from: e.find, to: e.replace || '(deleted)', count: n, category: e.family })
    text = text.replace(e.re, (m) => matchCase(m, e.replace))
  }
  // Clean up after deletions: orphaned punctuation reads worse than the slop did.
  text = text.replace(R.multiSpace, ' ')
  text = text.replace(R.leadPunct, '')
  text = text.replace(R.leadSpace, '') // one space left by a deletion; deeper indents are deliberate
  text = text.replace(R.spacePunct, '$1')
  text = text.replace(R.commaPunct, '$1') // an em dash became a comma, then the clause after it went
  text = text.split('...').join('\x00ELL\x00') // protect real ellipses
  text = text.replace(R.dots, '.')
  text = text.replace(R.bangDot, '$1')
  text = text.split('\x00ELL\x00').join('...')
  text = text.replace(R.blankLine, '')
  text = text.replace(R.manyNl, '\n\n')
  // "is important, also, it's proof" → promote the splice to a full stop.
  text = text.replace(R.splice, (_m, w: string) => '. ' + w[0].toUpperCase() + w.slice(1) + ', ')
  return text
}

/** Deleting an opener leaves the next word lower case — fix it only for writers who capitalise. */
function restoreCapitals(original: string, text: string): string {
  const starts = Array.from(original.matchAll(R.starts), (m) => m[1])
  if (!starts.length || starts.filter((c) => isUpper(c)).length * 2 < starts.length) return text
  return text.replace(R.lowerStart, (m0: string, c: string) => m0.slice(0, -1) + c.toUpperCase())
}

function excerptOf(m: string): string {
  const s = pyStrip(m).replace(/\s+/g, ' ')
  return s.length > 80 ? s.slice(0, 77) + '...' : s
}

function scanStructures(text: string): HumanizeFlag[] {
  const flags: HumanizeFlag[] = []
  for (const s of STRUCTURES) {
    const found = Array.from(text.matchAll(s.re), (m) => m[0])
    if (found.length) flags.push({ id: s.id, label: s.name, message: s.fix, excerpt: excerptOf(found[0]), count: found.length })
  }
  // Sentence-length uniformity is structural too.
  const lens = sentenceLengths(text)
  if (lens.length >= 4) {
    const mu = mean(lens)
    const cv = mu ? pstdev(lens) / mu : 0
    if (cv < 0.35) {
      flags.push({
        id: 'uniform-length',
        label: `Uniform sentence length (variation ${fmt(cv, 2)})`,
        message: 'Break one sentence in half. Let another run long. Machines write even.',
        count: lens.length,
      })
    }
  }
  return flags
}

/** Clean a draft and report what changed plus the structural tells left to fix by hand. */
export function humanize(input: string): HumanizeResult {
  const changes: HumanizeChange[] = []
  const [shielded, urls] = protectUrls(input)
  let text = passInvisible(shielded, changes)
  text = passTypographic(text, changes)
  text = passLexical(text, changes)
  text = restoreCapitals(input, text)
  text = restoreUrls(text, urls)
  return { text: pyStrip(text), changes, flags: scanStructures(text) }
}
