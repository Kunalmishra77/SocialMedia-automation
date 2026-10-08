'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { BarChart3, Clapperboard, ExternalLink, Info, Loader2, Sparkles, ThumbsDown, ThumbsUp, Camera } from 'lucide-react'
import {
  runAuditAction, explainAuditAction,
  type AuditResult, type AuditPost, type AuditExplanation, type GroupStat, type ThirdStat, type AuditMetric,
} from '@/lib/actions/post-audit'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { cn } from '@/lib/utils'

type Filter = 'all' | 'Reel' | 'Carousel' | 'Image'
const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'Reel', label: 'Reels' },
  { id: 'Carousel', label: 'Carousels' },
  { id: 'Image', label: 'Images' },
]
const TIER_TONE = { top: 'success', mid: 'neutral', bottom: 'error' } as const
const METRIC_LABEL: Record<AuditMetric, string> = { views: 'views', reach: 'reach', engagement: 'likes + comments' }

const fmtX = (m: number) => `${m.toFixed(m >= 10 ? 0 : 1)}×`
const fmtInt = (n: number | undefined) => (typeof n === 'number' ? n.toLocaleString() : '–')
const fmtPct = (v: number | null | undefined) => (typeof v === 'number' ? `${(v * 100).toFixed(1)}%` : '–')
const multTone = (m: number) => (m >= 3 ? 'text-emerald-600' : m >= 1.5 ? 'text-foreground' : 'text-muted-foreground')

function fmtDate(iso: string) {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: '2-digit' })
}

export function PostAudit({ handle, aiReady }: { handle: string | null; aiReady: boolean }) {
  const [limit, setLimit] = useState<25 | 50>(25)
  const [busy, setBusy] = useState<'' | 'audit' | 'explain'>('')
  const [err, setErr] = useState<string | null>(null)
  const [result, setResult] = useState<AuditResult | null>(null)
  const [filter, setFilter] = useState<Filter>('all')
  const [explain, setExplain] = useState<AuditExplanation | null>(null)
  const [explainErr, setExplainErr] = useState<string | null>(null)

  async function run() {
    if (busy) return
    setBusy('audit'); setErr(null); setExplain(null); setExplainErr(null)
    try {
      let timeZone = 'UTC'
      try { timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC' } catch { /* keep UTC */ }
      const res = await runAuditAction({ limit, timeZone })
      setResult(res)
      if (res.error) setErr(res.error)
    } catch {
      setErr('The audit failed. Try again in a minute.')
    } finally {
      setBusy('')
    }
  }

  const posts = useMemo(() => result?.posts ?? [], [result])
  const judged = useMemo(() => posts.filter((p) => !p.tooEarly), [posts])
  const shown = useMemo(() => (filter === 'all' ? posts : posts.filter((p) => p.format === filter)), [posts, filter])

  async function runExplain() {
    if (busy || !result?.breakdown || !result.metric) return
    setBusy('explain'); setExplainErr(null)
    const pick = (p: AuditPost) => ({ line: p.firstLine, format: p.format, multiple: p.multiple, formula: p.formula?.name ?? null })
    try {
      const res = await explainAuditAction({
        metric: result.metric,
        insights: !!result.insights,
        summary: result.summary ?? [],
        breakdown: result.breakdown,
        top: judged.slice(0, 5).map(pick),
        bottom: judged.slice(-5).reverse().map(pick),
      })
      if (res.error || !res.explanation) setExplainErr(res.error ?? 'Failed.')
      else setExplain(res.explanation)
    } catch {
      setExplainErr('The AI step failed. Try again.')
    } finally {
      setBusy('')
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1 text-sm">
          <p className="font-medium">Audit {handle ? `@${handle}` : 'your account'}</p>
          <p className="text-xs text-muted-foreground">Ranks posts by multiple of your own median. Above 3× is a real signal, under 1.5× is a normal day.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-md border border-border p-0.5" role="group" aria-label="How many posts">
            {([25, 50] as const).map((n) => (
              <button key={n} type="button" onClick={() => setLimit(n)} aria-pressed={limit === n}
                className={cn('rounded px-2.5 py-1 text-xs font-medium', limit === n ? 'bg-primary/10 text-primary' : 'text-muted-foreground')}>
                Last {n}
              </button>
            ))}
          </div>
          <Button onClick={run} disabled={!!busy}>
            {busy === 'audit' ? <><Loader2 className="h-4 w-4 animate-spin" /> Reading posts…</> : <><BarChart3 className="h-4 w-4" /> {result ? 'Re-run audit' : 'Run audit'}</>}
          </Button>
        </div>
      </div>

      {err && <p className="text-sm text-destructive">{err}</p>}

      {result && !result.connected && (
        <EmptyState icon={Camera} title="Instagram isn’t connected" description="Connect your Instagram account to audit your posts."
          primary={{ label: 'Connect Instagram', href: '/settings/channels' }} />
      )}

      {result?.connected && result.metric && result.breakdown && (
        <>
          <MetricBanner metric={result.metric} insights={!!result.insights} baseline={result.breakdown.baseline} judged={result.breakdown.judged} early={result.breakdown.tooEarly} />

          {judged.length < 3 ? (
            <p className="rounded-lg border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
              Only {judged.length} post{judged.length === 1 ? '' : 's'} older than 48 hours. That isn’t enough to compare against your own normal yet, so treat the list below as a reading, not a verdict.
            </p>
          ) : (
            <Insights result={result} />
          )}

          {judged.length >= 3 && (
            <AiPanel aiReady={aiReady} busy={busy === 'explain'} disabled={!!busy} onRun={runExplain} explanation={explain} error={explainErr} />
          )}

          <section className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="mr-auto text-sm font-semibold">Ranked posts</h2>
              {FILTERS.map((f) => {
                const count = f.id === 'all' ? posts.length : posts.filter((p) => p.format === f.id).length
                return (
                  <button key={f.id} type="button" onClick={() => setFilter(f.id)} aria-pressed={filter === f.id}
                    className={cn('rounded-full border px-3 py-1 text-xs font-medium', filter === f.id ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground')}>
                    {f.label} <span className="tabular-nums opacity-70">{count}</span>
                  </button>
                )
              })}
            </div>
            <p className="text-xs text-muted-foreground">Hook = the caption’s first line. For Reels that is a proxy for the spoken hook, which Instagram doesn’t expose.</p>
            {shown.length ? (
              <ul className="space-y-2">
                {shown.map((p) => <PostRow key={p.id} post={p} metric={result.metric!} />)}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No posts in this format.</p>
            )}
          </section>
        </>
      )}
    </div>
  )
}

function MetricBanner({ metric, insights, baseline, judged, early }: { metric: AuditMetric; insights: boolean; baseline: number; judged: number; early: number }) {
  return (
    <div className={cn('flex gap-2 rounded-lg border px-4 py-3 text-sm', insights ? 'border-sky-200 bg-sky-50 text-sky-800' : 'border-amber-200 bg-amber-50 text-amber-800')}>
      <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <div className="space-y-1">
        <p>
          Multiples use <strong>{METRIC_LABEL[metric]}</strong>
          {metric === 'engagement' && ' (likes + 2× comments)'} against your median of{' '}
          <strong className="tabular-nums">{Math.round(baseline).toLocaleString()}</strong> across {judged} post{judged === 1 ? '' : 's'}.
          {early > 0 && ` ${early} post${early === 1 ? ' is' : 's are'} under 48 hours old, shown but left out of the baseline.`}
        </p>
        {!insights && (
          <p className="text-xs">
            Using likes + comments. To rank on reach, saves and shares, reconnect Instagram in{' '}
            <Link href="/settings/channels" className="font-medium underline">Settings → Channels</Link> and allow insights access.
          </p>
        )}
        {insights && metric === 'engagement' && (
          <p className="text-xs">Insights are on, but views and reach were missing for some posts, so likes + comments are used to keep the comparison fair.</p>
        )}
      </div>
    </div>
  )
}

function Bars({ rows, empty }: { rows: GroupStat[] | null; empty: string }) {
  if (!rows || !rows.length) return <p className="text-xs text-muted-foreground">{empty}</p>
  const max = Math.max(1, ...rows.map((r) => r.medianMultiple))
  const best = rows.reduce((a, b) => (b.count >= 2 && b.medianMultiple > a.medianMultiple ? b : a), rows.find((r) => r.count >= 2) ?? rows[0])
  return (
    <ul className="space-y-1.5">
      {rows.map((r) => (
        <li key={r.label} className="grid grid-cols-[6.5rem_1fr_3.5rem] items-center gap-2 text-xs">
          <span className={cn('truncate', r === best && r.count >= 2 ? 'font-semibold' : 'text-muted-foreground')}>{r.label}</span>
          <div className="h-2 overflow-hidden rounded-full bg-border" aria-hidden="true">
            <div className={cn('h-full rounded-full', r.medianMultiple >= 3 ? 'bg-emerald-500' : r.medianMultiple >= 1 ? 'bg-primary' : 'bg-zinc-400')}
              style={{ width: `${Math.max(3, (r.medianMultiple / max) * 100)}%` }} />
          </div>
          <span className="text-right tabular-nums">{fmtX(r.medianMultiple)} <span className="text-muted-foreground">n{r.count}</span></span>
        </li>
      ))}
    </ul>
  )
}

function Card({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('space-y-3 rounded-xl border border-border bg-card p-4', className)}>
      <h3 className="text-sm font-semibold">{title}</h3>
      {children}
    </div>
  )
}

function Insights({ result }: { result: AuditResult }) {
  const b = result.breakdown!
  const insights = !!result.insights
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card title="Format (median multiple)">
        <Bars rows={b.byFormat} empty="No formats to compare." />
      </Card>
      <Card title="Top third vs bottom third">
        <ThirdCompare top={b.top} bottom={b.bottom} insights={insights} />
      </Card>
      <Card title="When you posted">
        {b.byWeekday && b.byHour ? (
          <div className="space-y-3">
            <Bars rows={b.byWeekday} empty="" />
            <Bars rows={b.byHour} empty="" />
            <p className="text-xs text-muted-foreground">Check this last. Timing is rarely the cause; a 1-2 post day is noise.</p>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Needs at least 8 posts older than 48 hours. Timing is rarely the cause anyway.</p>
        )}
      </Card>
      <Card title="What is working in this batch">
        {result.summary?.length ? (
          <ul className="space-y-1.5 text-xs">
            {result.summary.map((s) => <li key={s} className="text-muted-foreground">{s.replace(/\s{2,}/g, ' ')}</li>)}
          </ul>
        ) : (
          <p className="text-xs text-muted-foreground">Not enough posts for a summary yet.</p>
        )}
      </Card>
    </div>
  )
}

function ThirdCompare({ top, bottom, insights }: { top: ThirdStat; bottom: ThirdStat; insights: boolean }) {
  const rows: { label: string; top: string; bottom: string }[] = [
    { label: 'Posts', top: String(top.count), bottom: String(bottom.count) },
    { label: 'Hook score', top: top.medianHookScore === null ? '–' : String(Math.round(top.medianHookScore)), bottom: bottom.medianHookScore === null ? '–' : String(Math.round(bottom.medianHookScore)) },
    { label: 'Hook words', top: top.medianHookWords === null ? '–' : String(top.medianHookWords), bottom: bottom.medianHookWords === null ? '–' : String(bottom.medianHookWords) },
    { label: 'Formats', top: top.formats.map((f) => `${f.name} ×${f.count}`).join(', ') || '–', bottom: bottom.formats.map((f) => `${f.name} ×${f.count}`).join(', ') || '–' },
    { label: 'Formulas', top: top.formulas.map((f) => `${f.name} ×${f.count}`).join(', ') || '–', bottom: bottom.formulas.map((f) => `${f.name} ×${f.count}`).join(', ') || '–' },
  ]
  if (insights && (top.medianSendsPerReach !== null || bottom.medianSendsPerReach !== null)) {
    rows.push({ label: 'Sends / reach', top: fmtPct(top.medianSendsPerReach), bottom: fmtPct(bottom.medianSendsPerReach) })
    rows.push({ label: 'Saves / reach', top: fmtPct(top.medianSavesPerReach), bottom: fmtPct(bottom.medianSavesPerReach) })
  }
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="text-left text-muted-foreground">
          <th className="pb-1 font-medium" scope="col"><span className="sr-only">Measure</span></th>
          <th className="pb-1 font-medium text-emerald-700" scope="col">Top</th>
          <th className="pb-1 font-medium" scope="col">Bottom</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.label} className="border-t border-border align-top">
            <th scope="row" className="py-1.5 pr-2 text-left font-normal text-muted-foreground">{r.label}</th>
            <td className="py-1.5 pr-2">{r.top}</td>
            <td className="py-1.5">{r.bottom}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function PostRow({ post: p, metric }: { post: AuditPost; metric: AuditMetric }) {
  const stats: string[] = [`${fmtInt(p.likes)} likes`, `${fmtInt(p.comments)} comments`]
  if (typeof p.viewCount === 'number') stats.push(`${fmtInt(p.viewCount)} views`)
  if (typeof p.reach === 'number') stats.push(`${fmtInt(p.reach)} reach`)
  if (typeof p.saves === 'number') stats.push(`${fmtInt(p.saves)} saves`)
  if (typeof p.sendsPerReach === 'number') stats.push(`${fmtPct(p.sendsPerReach)} sends/reach`)
  return (
    <li className="flex gap-3 rounded-xl border border-border bg-card p-3">
      <div className="h-16 w-16 shrink-0 overflow-hidden rounded-md bg-muted">
        {p.thumbnail && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.thumbnail} alt="" className="h-full w-full object-cover" loading="lazy" referrerPolicy="no-referrer" />
        )}
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone="brand">{p.format}</Badge>
          {p.tooEarly ? <Badge tone="info">too early</Badge> : <Badge tone={TIER_TONE[p.tier]}>{p.tier} third</Badge>}
          {p.formula && <span className="text-xs text-muted-foreground">#{p.formula.id} {p.formula.name}</span>}
        </div>
        <p className="truncate text-sm font-medium" title={p.firstLine}>{p.firstLine || <span className="text-muted-foreground">No caption</span>}</p>
        <p className="text-xs text-muted-foreground">
          {p.hookScore !== null && <>hook {Math.round(p.hookScore)} · </>}
          {stats.join(' · ')}
          {p.postedAt && <> · {fmtDate(p.postedAt)}</>}
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end justify-between">
        <p className={cn('text-xl font-bold tabular-nums', p.tooEarly ? 'text-muted-foreground' : multTone(p.multiple))}
          title={`${p.views.toLocaleString()} ${METRIC_LABEL[metric]} ÷ median ${Math.round(p.baseline).toLocaleString()}`}>
          {p.baseline ? fmtX(p.multiple) : '–'}
        </p>
        {p.permalink && (
          <a href={p.permalink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
            Open <ExternalLink className="h-3 w-3" aria-hidden="true" />
          </a>
        )}
      </div>
    </li>
  )
}

function AiPanel({ aiReady, busy, disabled, onRun, explanation, error }: {
  aiReady: boolean; busy: boolean; disabled: boolean; onRun: () => void; explanation: AuditExplanation | null; error: string | null
}) {
  return (
    <section className="space-y-4 rounded-xl border border-primary/30 bg-card p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold">What to do with this</h2>
          <p className="text-xs text-muted-foreground">An AI read of the numbers above: a verdict, what to make more of, what to stop, and three next posts.</p>
        </div>
        <Button onClick={onRun} disabled={disabled || !aiReady} variant={explanation ? 'outline' : 'default'}>
          {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Reading the numbers…</> : <><Sparkles className="h-4 w-4" /> {explanation ? 'Explain again' : 'Explain with AI'}</>}
        </Button>
      </div>
      {!aiReady && <p className="text-xs text-muted-foreground">Add an OpenAI or OpenRouter key to enable this step.</p>}
      {error && <p className="text-sm text-destructive">{error}</p>}
      {explanation && (
        <div className="space-y-4">
          {explanation.verdict && <p className="text-sm">{explanation.verdict}</p>}
          <div className="grid gap-3 sm:grid-cols-2">
            {explanation.do_more.length > 0 && (
              <div>
                <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-emerald-700"><ThumbsUp className="h-3.5 w-3.5" aria-hidden="true" /> Do more</p>
                <ul className="list-disc space-y-1 pl-5 text-sm">{explanation.do_more.map((s) => <li key={s}>{s}</li>)}</ul>
              </div>
            )}
            {explanation.stop.length > 0 && (
              <div>
                <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-red-700"><ThumbsDown className="h-3.5 w-3.5" aria-hidden="true" /> Stop</p>
                <ul className="list-disc space-y-1 pl-5 text-sm">{explanation.stop.map((s) => <li key={s}>{s}</li>)}</ul>
              </div>
            )}
          </div>
          {explanation.next_posts.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Next posts</p>
              <div className="grid gap-2 md:grid-cols-3">
                {explanation.next_posts.map((n, i) => (
                  <div key={`${n.idea}-${i}`} className="flex flex-col gap-2 rounded-lg border border-border p-3">
                    <Badge tone="brand" className="self-start">{n.format}</Badge>
                    <p className="text-sm font-medium">{n.idea}</p>
                    {n.hook && <p className="text-xs text-muted-foreground">Hook: “{n.hook}”</p>}
                    <Link href={`/content/reels?idea=${encodeURIComponent(n.idea)}`} className="mt-auto inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                      <Clapperboard className="h-3.5 w-3.5" aria-hidden="true" /> Script this in Reel Studio
                    </Link>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
