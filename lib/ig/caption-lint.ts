/**
 * Instagram caption linter: shows what the feed shows before "... more" and
 * runs the same checks as `ig-caption/caption.py`.
 *
 * Ported from instagram-agent-skill by Jake Schincariol (MIT) — https://github.com/Jakeschincariol/instagram-agent-skill
 *
 * Pure TS, browser-safe. Lengths and slicing count Unicode code points (like
 * Python `len`), not UTF-16 units, and the regexes emulate Python's Unicode
 * `\s`, `\d`, `\w` and `\b` so results match the Python tool.
 */

/** Instagram's hard caption limit. */
export const IG_CAPTION_LIMIT = 2200;
/** Roughly where the feed cuts to "... more". */
export const IG_FEED_TRUNCATE = 125;
/** Instagram's hashtag cap per post or reel since 18 Dec 2025 (down from 30). */
export const IG_HASHTAG_CAP = 5;

/** Width of the feed preview box in caption.py. */
const BOX_WIDTH = 52;
/** caption.py prints at most this many preview lines. */
const BOX_MAX_LINES = 8;

export type LintStatus = 'PASS' | 'WARN' | 'FAIL';

export interface CaptionCheck {
  key: string;
  label: string;
  status: LintStatus;
  message: string;
}

export interface CaptionLint {
  /** Characters (code points) after trimming. */
  length: number;
  maxLength: 2200;
  /** `#`-prefixed tags found in the caption plus `opts.hashtags`, deduped case-insensitively. */
  hashtags: string[];
  /** What the feed shows before "... more" (cut mid-word, like Instagram). */
  visible: string;
  truncated: boolean;
  /** `visible` wrapped at 52 columns (Python textwrap), max 8 lines, for a preview box. */
  visibleLines: string[];
  checks: CaptionCheck[];
  /** Names of the calls to action detected. */
  asks: string[];
  mentions: string[];
  links: string[];
  emoji: number;
  firstLineLength: number;
  verdict: 'READY' | 'REVIEW' | 'FIX';
}

export interface LintOptions {
  /** Search terms the caption should contain. */
  keywords?: string[];
  /** Extra hashtags that will be posted with the caption (with or without `#`). */
  hashtags?: string[];
  /** Override the feed cut (default 125). */
  truncate?: number;
}

// ---------------------------------------------------------------------------
// Python-compat primitives
// ---------------------------------------------------------------------------

/** Python `str.isspace()` / re `\s` set. */
const PY_WS =
  '\\t\\n\\x0b\\x0c\\r\\x1c-\\x1f \\x85\\xa0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000';
const S = `[${PY_WS}]`;
const NS = `[^${PY_WS}]`;
/** Python re `\d` (Unicode Nd). */
const D = '\\p{Nd}';
/** Python re `\w` class body. */
const W = '\\p{L}\\p{N}_';
/** Python re `\b` (Unicode word boundary). */
const B = `(?:(?<=[${W}])(?![${W}])|(?<![${W}])(?=[${W}]))`;

// Built with RegExp() so the TS target (ES2017) does not reject lookbehind.
const re = (src: string, flags = '') => new RegExp(src, flags);

const LEAD_WS = re(`^${S}+`, 'u');
const TRAIL_WS = re(`${S}+$`, 'u');

/** Python `str.strip()`. */
function pyStrip(s: string): string {
  return s.replace(LEAD_WS, '').replace(TRAIL_WS, '');
}

/** Python `len()` — code points. */
function cpLen(s: string): number {
  let n = 0;
  for (const _ of s) n++;
  return n;
}

/** Python `s[:n]` by code points. */
function cpSlice(s: string, start: number, end?: number): string {
  return Array.from(s).slice(start, end).join('');
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&'); // u-mode safe (no `\-`)
}

/** Python `f"{x:.{d}f}"` (round-half-even on exact binary ties). */
function pyFixed(x: number, d: number): string {
  const scaled = x * 2 ** (d + 1);
  if (Number.isInteger(scaled) && Math.abs(scaled) % 2 === 1) {
    // Exact tie: Python rounds half to even, JS toFixed rounds half up.
    const p = 10 ** d;
    let n = Math.floor(x * p);
    if (n % 2 !== 0) n += 1;
    return (n / p).toFixed(d);
  }
  return x.toFixed(d);
}

function findAll(pattern: RegExp, text: string, group = 0): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(pattern)) out.push(m[group]);
  return out;
}

// ---------------------------------------------------------------------------
// Patterns (caption.py)
// ---------------------------------------------------------------------------

const HASHTAG_RE = re(`(?:^|${S})(#[A-Za-z0-9_]+)`, 'gu');
const MENTION_RE = re(`(?:^|${S})(@[A-Za-z0-9_.]+)`, 'gu');
const LINK_RE = re(
  `https?://${NS}+|${B}www\\.${NS}+|${B}[a-z0-9-]+\\.(?:com|co|io|net|org|ai|app)/${NS}*`,
  'giu',
);
const EMOJI_RE = re('[\\u{1F300}-\\u{1FAFF}\\u2600-\\u27BF\\u2190-\\u21FF\\uFE0F]', 'gu');
// Python: re.MULTILINE, so (?<!^) means "not at the start of a line" (after \n only).
const CONCRETE_RE = re(
  `\\$${S}?${D}|${B}${D}[${D},.]*${B}|(?<!^)(?<!\\n)${B}[A-Z][a-z]{2,}${B}`,
  'gu',
);

const ASKS: Array<[RegExp, string]> = [
  [re(`${B}comment (?:the word |")?[A-Z0-9]{2,}${B}`, 'iu'), 'comment a keyword'],
  [re(`${B}(?:dm|message) me${B}`, 'iu'), 'DM me'],
  [re(`${B}save (?:this|it)${B}`, 'iu'), 'save this'],
  [re(`${B}share (?:this|it)${B}`, 'iu'), 'share this'],
  [re(`${B}follow (?:me|for)${B}`, 'iu'), 'follow'],
  [re(`${B}link in (?:my )?bio${B}`, 'iu'), 'link in bio'],
  [re(`${B}(?:swipe|tap) (?:through|left|right|for|to)${B}`, 'iu'), 'swipe or tap'],
  [re(`${B}tell me${B}|${B}what would you${B}|${B}which one${B}`, 'iu'), 'answer a question'],
];

/** Tags that describe nothing; the linter warns on them and polishTags drops them. */
export const FILLER_TAGS = new Set([
  '#viral', '#fyp', '#explore', '#explorepage', '#foryou', '#foryoupage',
  '#trending', '#instagood', '#love', '#follow', '#like4like', '#reels',
  '#reelsinstagram', '#viralreels', '#instadaily',
]);

// ---------------------------------------------------------------------------
// textwrap.wrap(text, width) port (default options)
// ---------------------------------------------------------------------------

const TW_WS = '[\\t\\n\\x0b\\x0c\\r ]';
const TW_NWS = '[^\\t\\n\\x0b\\x0c\\r ]';
const TW_WP = `[${W}!"'&.,?]`;
const TW_LT = '[\\p{L}\\p{Nl}\\p{No}_]'; // Python [^\d\W]
const WORDSEP_RE = re(
  `(${TW_WS}+` +
    `|(?<=${TW_WP})-{2,}(?=[${W}])` +
    `|${TW_NWS}+?(?:` +
    `-(?:(?<=${TW_LT}{2}-)|(?<=${TW_LT}-${TW_LT}-))(?=${TW_LT}-?${TW_LT})` +
    `|(?=${TW_WS}|$)` +
    `|(?<=${TW_WP})(?=-{2,}[${W}])` +
    `))`,
  'u',
);

function expandTabs(text: string, tabsize = 8): string {
  let out = '';
  let col = 0;
  for (const ch of text) {
    if (ch === '\t') {
      const n = tabsize - (col % tabsize);
      out += ' '.repeat(n);
      col += n;
    } else if (ch === '\n' || ch === '\r') {
      out += ch;
      col = 0;
    } else {
      out += ch;
      col++;
    }
  }
  return out;
}

/** Python `textwrap.wrap(text, width)` with default options. */
function textwrapWrap(text: string, width: number): string[] {
  const munged = expandTabs(text).replace(/[\t\n\x0b\x0c\r]/g, ' ');
  const chunks = munged.split(WORDSEP_RE).filter((c) => c);
  chunks.reverse();
  const lines: string[] = [];
  const isBlank = (s: string) => pyStrip(s) === '';

  while (chunks.length) {
    const cur: string[] = [];
    let curLen = 0;
    if (isBlank(chunks[chunks.length - 1]) && lines.length) chunks.pop();
    while (chunks.length) {
      const l = cpLen(chunks[chunks.length - 1]);
      if (curLen + l <= width) {
        cur.push(chunks.pop() as string);
        curLen += l;
      } else break;
    }
    if (chunks.length && cpLen(chunks[chunks.length - 1]) > width) {
      // _handle_long_word
      const spaceLeft = width < 1 ? 1 : width - curLen;
      if (spaceLeft > 0) {
        const chunk = Array.from(chunks[chunks.length - 1]);
        let end = spaceLeft;
        if (chunk.length > spaceLeft) {
          const hyphen = chunk.slice(0, spaceLeft).lastIndexOf('-');
          if (hyphen > 0 && chunk.slice(0, hyphen).some((c) => c !== '-')) end = hyphen + 1;
        }
        cur.push(chunk.slice(0, end).join(''));
        chunks[chunks.length - 1] = chunk.slice(end).join('');
      } else if (!cur.length) {
        cur.push(chunks.pop() as string);
      }
      curLen = cur.reduce((n, c) => n + cpLen(c), 0);
    }
    if (cur.length && isBlank(cur[cur.length - 1])) {
      curLen -= cpLen(cur[cur.length - 1]);
      cur.pop();
    }
    if (cur.length) lines.push(cur.join(''));
  }
  return lines;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Strip `#`, trim, drop empties, dedupe case-insensitively (first spelling wins). Strings split on whitespace/commas. */
export function normalizeHashtags(input: string | string[]): string[] {
  const parts = typeof input === 'string' ? input.split(/[\s,]+/) : input.flatMap((t) => t.split(/[\s,]+/));
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of parts) {
    const tag = p.trim().replace(/^#+/, '').trim();
    if (!tag) continue;
    const k = tag.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(tag);
  }
  return out;
}

/** Normalize, then keep the first `cap` tags (Instagram ignores the rest). */
export function capHashtags(tags: string | string[], cap: number = IG_HASHTAG_CAP): string[] {
  return normalizeHashtags(tags).slice(0, Math.max(0, cap));
}

/** What the feed shows. Instagram cuts mid-word, so this does too. */
function visibleWindow(text: string, cut: number): string {
  const flat = pyStrip(text);
  return cpLen(flat) <= cut ? flat : cpSlice(flat, 0, cut);
}

/** Lines of the "WHAT THE FEED SHOWS" box (caption.py render_box). */
function boxLines(window: string): string[] {
  const lines: string[] = [];
  for (const raw of window.split('\n')) {
    const wrapped = textwrapWrap(raw, BOX_WIDTH);
    lines.push(...(wrapped.length ? wrapped : ['']));
  }
  return lines.slice(0, BOX_MAX_LINES);
}

/**
 * Lint a caption. Same checks and wording as caption.py `analyse()`.
 * `opts.hashtags` (tags posted alongside the caption) count toward the
 * HASHTAGS check in addition to tags found in the text.
 */
export function lintCaption(caption: string, opts: LintOptions = {}): CaptionLint {
  const cut = opts.truncate ?? IG_FEED_TRUNCATE;
  // caption.py reads files in text mode (universal newlines): CRLF and CR become LF.
  const stripped = pyStrip(caption.replace(/\r\n?/g, '\n'));
  const chars = cpLen(stripped);
  const lines = stripped.split('\n');
  const firstLine = lines.length ? pyStrip(lines[0]) : '';
  const firstLen = cpLen(firstLine);
  const captionTags = findAll(HASHTAG_RE, stripped, 1);
  const mentions = findAll(MENTION_RE, stripped, 1);
  const links = findAll(LINK_RE, stripped);
  const emoji = findAll(EMOJI_RE, stripped);
  const window = visibleWindow(stripped, cut);
  const truncated = chars > cut;
  const asks = ASKS.filter(([p]) => p.test(stripped)).map(([, name]) => name);
  const keywords = (opts.keywords ?? []).map((k) => pyStrip(k)).filter((k) => k);

  // Extra tags not already in the caption (case-insensitive) are appended.
  const lowerInCaption = new Set(captionTags.map((t) => t.toLowerCase()));
  const extraTags = normalizeHashtags(opts.hashtags ?? [])
    .map((t) => `#${t}`)
    .filter((t) => !lowerInCaption.has(t.toLowerCase()));
  const tags = [...captionTags, ...extraTags];
  const filler = tags.filter((t) => FILLER_TAGS.has(t.toLowerCase()));

  const checks: CaptionCheck[] = [];
  const add = (key: string, label: string, status: LintStatus, message: string) =>
    checks.push({ key, label, status, message });

  add(
    'length',
    'LENGTH',
    chars > IG_CAPTION_LIMIT ? 'FAIL' : 'PASS',
    `${chars} / ${IG_CAPTION_LIMIT} characters` +
      (chars > IG_CAPTION_LIMIT ? `, ${chars - IG_CAPTION_LIMIT} over the limit` : ''),
  );

  if (!firstLine) {
    add('first_line', 'FIRST LINE', 'FAIL', 'the caption opens on a blank line');
  } else if (firstLine.startsWith('#') || firstLine.startsWith('@')) {
    add('first_line', 'FIRST LINE', 'FAIL',
      'opens on a hashtag or a mention, which is the one position worth a sentence');
  } else if (firstLen > cut) {
    add('first_line', 'FIRST LINE', 'WARN',
      `${firstLen} characters, so it gets cut at ${cut} mid-thought. ` +
        'Fine if the cut is a cliffhanger, bad if it is a subordinate clause');
  } else {
    add('first_line', 'FIRST LINE', 'PASS', `${firstLen} characters, lands whole`);
  }

  const concrete = findAll(CONCRETE_RE, window).length;
  add('hook_concrete', 'HOOK IS CONCRETE', concrete ? 'PASS' : 'WARN',
    `${concrete} number(s) or name(s) in the visible window` +
      (concrete ? '' : ' - nothing checkable before the tap'));

  if (tags.length > IG_HASHTAG_CAP) {
    add('hashtags', 'HASHTAGS', 'FAIL',
      `${tags.length} tags, over Instagram's cap of ${IG_HASHTAG_CAP}. ` +
        'Tags past the fifth do not count and the block reads as old');
  } else if (tags.length === IG_HASHTAG_CAP && filler.length) {
    add('hashtags', 'HASHTAGS', 'WARN',
      `${tags.length} tags, at the cap, and ${filler.length} of them generic. Spend the five on topics`);
  } else if (filler.length) {
    add('hashtags', 'HASHTAGS', 'WARN',
      `${tags.length} tags, ${filler.length} of them generic (${filler.slice(0, 3).join(', ')}). Those describe nothing`);
  } else {
    add('hashtags', 'HASHTAGS', 'PASS', `${tags.length} tag(s)` + (tags.length ? `: ${tags.join(' ')}` : ''));
  }

  if (!captionTags.length) {
    add('tag_placement', 'TAG PLACEMENT', 'PASS', 'no tags to place');
  } else if (captionTags.some((t) => re(`(?:^|${S})${escapeRe(t)}${B}`, 'u').test(window))) {
    add('tag_placement', 'TAG PLACEMENT', 'WARN',
      'a hashtag is inside the visible window, spending feed space on a label');
  } else {
    add('tag_placement', 'TAG PLACEMENT', 'PASS', 'tags are below the fold');
  }

  add('links', 'LINKS', links.length ? 'WARN' : 'PASS',
    links.length
      ? `${links.length} link(s) in the caption, and captions are not clickable. Move it to the bio or the DM`
      : 'no dead links in the body');

  if (asks.length === 1) {
    add('one_ask', 'ONE ASK', 'PASS', `one call to action: ${asks[0]}`);
  } else if (!asks.length) {
    add('one_ask', 'ONE ASK', 'WARN', 'no call to action. Decide what this post is for');
  } else {
    add('one_ask', 'ONE ASK', 'WARN', `${asks.length} asks (${asks.join(', ')}). Two asks is the same as none`);
  }

  const density = (emoji.length * 100) / Math.max(chars, 1);
  add('emoji', 'EMOJI', density > 4 ? 'WARN' : 'PASS',
    `${emoji.length} emoji, ${pyFixed(density, 1)} per 100 characters` +
      (density > 4 ? ' - reads as decoration' : ''));

  if (keywords.length) {
    const low = stripped.toLowerCase();
    const lowWindow = window.toLowerCase();
    const found = keywords.filter((k) => low.includes(k.toLowerCase()));
    const missing = keywords.filter((k) => !low.includes(k.toLowerCase()));
    const inWindow = found.filter((k) => lowWindow.includes(k.toLowerCase()));
    const status: LintStatus = !missing.length ? 'PASS' : found.length ? 'WARN' : 'FAIL';
    add('search_terms', 'SEARCH TERMS', status,
      `${found.length}/${keywords.length} present` +
        (found.length ? `, ${inWindow.length} in the visible window` : '') +
        (missing.length ? `. Missing: ${missing.join(', ')}` : ''));
  }

  const fails = checks.filter((c) => c.status === 'FAIL').length;
  const warns = checks.filter((c) => c.status === 'WARN').length;

  const seen = new Set<string>();
  const hashtags = tags.filter((t) => {
    const k = t.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  return {
    length: chars,
    maxLength: IG_CAPTION_LIMIT,
    hashtags,
    visible: window,
    truncated,
    visibleLines: boxLines(window),
    checks,
    asks,
    mentions,
    links,
    emoji: emoji.length,
    firstLineLength: firstLen,
    verdict: fails ? 'FIX' : warns ? 'REVIEW' : 'READY',
  };
}
