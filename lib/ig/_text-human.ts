/**
 * Shared helpers for the humanize/detect ports: a Python `re` → JS RegExp
 * translator plus Python-compatible whitespace/split/strip, so both modules
 * keep the exact semantics (and scores) of the original scripts.
 *
 * Ported from instagram-agent-skill by Jake Schincariol (MIT) — https://github.com/Jakeschincariol/instagram-agent-skill
 */

import slopJson from './data/slop.json'

export interface SlopEntry { find: string; replace: string; family: string }
export interface SlopStructure { id: string; regex: string; name: string; fix: string }
export interface SlopLexicon {
  invisible: Array<{ cp: string; name: string; action: string }>
  typographic: Array<{ from: string; name: string; to: string }>
  words: SlopEntry[]
  phrases: SlopEntry[]
  structures: SlopStructure[]
}

export const slop = slopJson as unknown as SlopLexicon

/** Python `\w` (str patterns): letters, numbers, underscore. Class body, no brackets. */
const W = '\\p{L}\\p{N}_'
/** Python `\s` / `str.isspace()` for str patterns. Class body, no brackets. */
const S = '\\t\\n\\v\\f\\r\\x1c-\\x1f \\x85\\xa0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000'
const BOUNDARY = `(?:(?<=[${W}])(?![${W}])|(?<![${W}])(?=[${W}]))`
const NON_BOUNDARY = `(?:(?<=[${W}])(?=[${W}])|(?<![${W}])(?![${W}]))`
const JS_SYNTAX = new Set('^$\\.*+?()[]{}|/'.split(''))

/**
 * Compile a Python regex (incl. leading `(?im)` inline flags) to an equivalent
 * Unicode JS RegExp: `\b \w \s \d` get Python's Unicode meaning, `^`/`$` get
 * Python's MULTILINE semantics (newline only), `.` excludes only `\n`.
 */
export function pyRe(src: string, opts: { i?: boolean; m?: boolean; g?: boolean } = {}): RegExp {
  let i = !!opts.i
  let m = !!opts.m
  const lead = /^\(\?([aiLmsux]+)\)/.exec(src)
  if (lead) {
    if (lead[1].includes('i')) i = true
    if (lead[1].includes('m')) m = true
    src = src.slice(lead[0].length)
  }
  const cs = Array.from(src)
  let out = ''
  let inClass = false
  for (let k = 0; k < cs.length; k++) {
    const c = cs[k]
    if (c === '\\') {
      const n = cs[++k]
      if (n === undefined) throw new Error('trailing backslash')
      if (n === 'b' && !inClass) out += BOUNDARY
      else if (n === 'B' && !inClass) out += NON_BOUNDARY
      else if (n === 'w') out += inClass ? W : `[${W}]`
      else if (n === 's') out += inClass ? S : `[${S}]`
      else if (n === 'W' && !inClass) out += `[^${W}]`
      else if (n === 'S' && !inClass) out += `[^${S}]`
      else if (n === 'd') out += '\\p{Nd}'
      else if (n === 'D') out += '\\P{Nd}'
      else if (n === 'A') out += '^'
      else if (n === 'Z') out += '$'
      else if (n === 'U') { out += `\\u{${cs.slice(k + 1, k + 9).join('')}}`; k += 8 }
      else if (n === 'u') { out += `\\u{${cs.slice(k + 1, k + 5).join('')}}`; k += 4 }
      else if (n === 'x') { out += `\\x${cs.slice(k + 1, k + 3).join('')}`; k += 2 }
      else if ('nrtfv0'.includes(n) || JS_SYNTAX.has(n) || (n === '-' && inClass)) out += '\\' + n
      else if (/[\p{L}\p{N}]/u.test(n)) throw new Error(`unsupported escape \\${n}`)
      else out += n
      continue
    }
    if (inClass) {
      if (c === ']') inClass = false
      out += c
      continue
    }
    if (c === '[') {
      inClass = true
      out += '['
      if (cs[k + 1] === '^') { out += '^'; k++ }
      if (cs[k + 1] === ']') { out += '\\]'; k++ }
    } else if (c === '.') out += '[^\\n]'
    else if (c === '^') out += m ? '(?<![^\\n])' : '^'
    else if (c === '$') out += m ? '(?![^\\n])' : '(?=\\n?$)'
    else if (c === '{') {
      const q = /^\{\d*(?:,\d*)?\}/.exec(cs.slice(k).join(''))
      if (q && q[0] !== '{}' && q[0] !== '{,}') { out += q[0]; k += q[0].length - 1 } else out += '\\{'
    } else if (c === '}') out += '\\}'
    else out += c
  }
  return new RegExp(out, 'u' + (i ? 'i' : '') + (opts.g === false ? '' : 'g'))
}

/** Python `re.escape` for a literal, as Python-regex source. */
export function pyEscape(s: string): string {
  return s.replace(/[()[\]{}?*+\-|^$\\.&~# \t\n\r\v\f]/g, (c) => '\\' + c)
}

/** `\b<find>\b`, spaces widened to `\s+`, case-insensitive — the lexicon matcher. */
export function lexiconRe(find: string): RegExp {
  return pyRe('\\b' + pyEscape(find).split('\\ ').join('\\s+') + '\\b', { i: true })
}

/** Python `len(re.findall(...))`. */
export function countMatches(re: RegExp, text: string): number {
  let n = 0
  for (const _ of text.matchAll(re)) n++
  return n
}

const SPLIT_RE = new RegExp(`[${S}]+`, 'u')
const STRIP_RE = new RegExp(`^[${S}]+|[${S}]+$`, 'gu')

/** Python `str.split()` (no args). */
export function pySplit(s: string): string[] {
  return s.split(SPLIT_RE).filter((x) => x.length > 0)
}

/** Python `str.strip()` (no args). */
export function pyStrip(s: string): string {
  return s.replace(STRIP_RE, '')
}

/** Python `str.count(sub)`. */
export function countSub(s: string, sub: string): number {
  return s.split(sub).length - 1
}

/** Python `str.isupper()`. */
export function isUpper(s: string): boolean {
  return /\p{Lu}/u.test(s) && !/[\p{Ll}\p{Lt}]/u.test(s)
}

/** Python `SENT_RE = [^.!?\n]+[.!?]*`. */
export const SENT_RE = /[^.!?\n]+[.!?]*/gu

/** Sentence word counts for sentences longer than two words. */
export function sentenceLengths(text: string): number[] {
  return Array.from(text.matchAll(SENT_RE), (mm) => pySplit(mm[0]).length).filter((n) => n > 2)
}

/** Population mean / standard deviation (Python `statistics.mean` / `pstdev`). */
export function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length
}
export function pstdev(xs: number[]): number {
  const mu = mean(xs)
  return Math.sqrt(xs.reduce((a, x) => a + (x - mu) ** 2, 0) / xs.length)
}

/** Python `f"{x:.Nf}"`. */
export function fmt(x: number, digits: number): string {
  return x.toFixed(digits)
}

/** Unicode general category Cf (format / invisible characters). */
export const CF_RE = /\p{Cf}/gu
