/**
 * Outlier ranking: rank posts by how far each beat its own account's
 * baseline (views / median views), name the hook formula, score the hook, and
 * say what separates the top third from the bottom third. Port of
 * `ig-viral/swipe.py` `analyse()`, plus sends/saves per reach from `ig-audit`.
 *
 * Ported from instagram-agent-skill by Jake Schincariol (MIT) — https://github.com/Jakeschincariol/instagram-agent-skill
 *
 * Pure TS, browser-safe.
 */

import { pyFixed, pyRound, scoreHook } from './hooks';

export interface OutlierRow {
  account: string;
  views: number;
  /** First line of the reel, spoken or on screen. Falls back to the caption's first line. */
  hook?: string;
  caption?: string;
  url?: string;
  /** Shares. */
  sends?: number;
  reach?: number;
  likes?: number;
  comments?: number;
  saves?: number;
  postedAt?: string;
  id?: string;
  /** Optional known baseline (swipe.py `median` column). Wins over the computed median. */
  median?: number;
  /** Optional follower count (swipe.py fallback baseline when no median). */
  followers?: number;
}

export type OutlierTier = 'top' | 'mid' | 'bottom';

export type RankedRow<T extends OutlierRow = OutlierRow> = T & {
  /** views / baseline, rounded to 2 decimals; 0 when there is no baseline. */
  multiple: number;
  baseline: number;
  /** hookscore 0-100 (1 decimal), null when there is no hook text. */
  hookScore: number | null;
  formula: { id: number | string; name: string } | null;
  tier: OutlierTier;
  /** Words in the hook (swipe.py WORD_RE). */
  words: number;
  /** sends / reach, present when reach > 0. */
  sendsPerReach?: number;
  /** saves / reach, present when reach > 0. */
  savesPerReach?: number;
};

export interface OutlierResult<T extends OutlierRow = OutlierRow> {
  ranked: Array<RankedRow<T>>;
  /** "What is working in this batch" lines (swipe.py render), top third vs bottom third. */
  summary: string[];
  /** swipe.py `baseline` label: 'account median' or 'follower count'. */
  baselineLabel: 'account median' | 'follower count';
}

const WORD_RE = /[A-Za-z0-9$%'’-]+/g;

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

/** Python statistics.median; `isInt` mirrors whether Python would return an int. */
function median(vals: number[]): { value: number; isInt: boolean } | null {
  if (!vals.length) return null;
  const s = [...vals].sort((a, b) => a - b);
  const n = s.length;
  if (n % 2 === 1) return { value: s[(n - 1) / 2], isInt: Number.isInteger(s[(n - 1) / 2]) };
  return { value: (s[n / 2 - 1] + s[n / 2]) / 2, isInt: false };
}

/** Python str() of round(median, 1): ints print bare, floats keep ".0". */
function pyNum(m: { value: number; isInt: boolean } | null): string {
  if (!m) return 'n/a';
  if (m.isInt) return String(m.value);
  const r = pyRound(m.value, 1);
  return Number.isInteger(r) ? `${r}.0` : String(r);
}

function hookText(row: OutlierRow): string {
  if (row.hook && row.hook.trim()) return row.hook;
  const first = (row.caption ?? '').split('\n').find((l) => l.trim());
  return first ? first.trim() : '';
}

/**
 * Rank rows by outlier multiple (views over the account's own median views),
 * highest first. Baseline per row: `median` if given, else `followers`, else
 * the median `views` of that account's rows in this batch.
 */
export function rankOutliers<T extends OutlierRow>(
  rows: T[],
  opts: { baseline?: 'median' } = {},
): OutlierResult<T> {
  void opts; // only 'median' is supported, as in swipe.py

  const byAccount = new Map<string, number[]>();
  for (const r of rows) {
    const k = r.account ?? '';
    if (!byAccount.has(k)) byAccount.set(k, []);
    byAccount.get(k)!.push(num(r.views));
  }
  const accountMedian = new Map<string, number>();
  for (const [k, v] of byAccount) accountMedian.set(k, median(v)?.value ?? 0);

  let usedMedian = false;
  const scored = rows.map((r) => {
    const views = num(r.views);
    let base: number;
    if (num(r.median)) {
      base = num(r.median);
      usedMedian = true;
    } else if (num(r.followers)) {
      base = num(r.followers);
    } else {
      base = accountMedian.get(r.account ?? '') ?? 0;
      if (base) usedMedian = true;
    }
    const hook = hookText(r);
    const hs = hook ? scoreHook(hook) : null;
    const reach = num(r.reach);
    const out: RankedRow<T> = {
      ...r,
      multiple: base ? pyRound(views / base, 2) : 0,
      baseline: base,
      hookScore: hs ? hs.score : null,
      formula: hs?.formula ?? null,
      tier: 'mid',
      words: hook.match(WORD_RE)?.length ?? 0,
    };
    if (reach > 0) {
      out.sendsPerReach = num(r.sends) / reach;
      out.savesPerReach = num(r.saves) / reach;
    }
    return out;
  });

  // Stable sort, as Python's sorted(key=-(outlier or 0)).
  const ranked = scored
    .map((r, i) => ({ r, i }))
    .sort((a, b) => b.r.multiple - a.r.multiple || a.i - b.i)
    .map((x) => x.r);

  const n = ranked.length;
  const baselineLabel = usedMedian ? 'account median' : 'follower count';
  if (!n) return { ranked, summary: [], baselineLabel };

  const third = Math.max(1, Math.floor(n / 3));
  const top = ranked.slice(0, third);
  const bottom = ranked.slice(n - third);
  ranked.forEach((r, i) => {
    r.tier = i < third ? 'top' : i >= n - third ? 'bottom' : 'mid';
  });

  const med = (items: Array<RankedRow<T>>, key: 'hookScore' | 'words') =>
    // Rows without hook text (hookScore null) are left out of both medians.
    median(items.filter((i) => i.hookScore !== null).map((i) => i[key] as number));

  const counts = new Map<string, number>();
  for (const r of top) {
    const name = r.formula?.name ?? 'unclassified';
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  const topFormulas = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const topScore = med(top, 'hookScore');
  const bottomScore = med(bottom, 'hookScore');
  const unclassified = ranked.filter((r) => !r.formula).length;

  const summary: string[] = [];
  if (topFormulas.length) {
    summary.push('top third by outlier:  ' + topFormulas.slice(0, 4).map(([name, c]) => `${name} x${c}`).join(', '));
  }
  if (topScore) {
    const fmt = (m: ReturnType<typeof med>) => (m ? pyFixed(pyRound(m.value, 1), 0) : 'n/a');
    summary.push(`median hook score:     top ${fmt(topScore)}  vs bottom ${fmt(bottomScore)}`);
  }
  summary.push(`median hook length:    top ${pyNum(med(top, 'words'))} words  vs bottom ${pyNum(med(bottom, 'words'))} words`);
  summary.push(
    `unclassified:          ${unclassified} of ${n}. Read those by hand, ` +
      'they are where a formula you do not have yet is hiding.',
  );

  return { ranked, summary, baselineLabel };
}
