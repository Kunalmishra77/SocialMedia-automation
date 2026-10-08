'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { AtSign, Check, Copy, Gauge, Loader2, RefreshCw, Sparkles, TrendingDown, TrendingUp } from 'lucide-react'
import {
  loadProfileAction, scoreProfileAction,
  type AuditPoint, type ProfileFields, type ProfileRewrites, type ProfileScoreResult, type ScoredItem,
} from '@/lib/actions/profile-score'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

const area = 'w-full rounded-md border border-input bg-background px-3 py-2 text-sm'
const NAME_MAX = 30
const BIO_MAX = 150

const EMPTY_PROFILE: ProfileFields = { username: '', name: '', bio: '', website: '', avatarUrl: null, followers: null, mediaCount: null, grid: [] }

const compact = (n: number | null) => (n == null ? '—' : new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(n))
const tone = (pct: number) => (pct >= 70 ? 'bg-emerald-500' : pct >= 45 ? 'bg-amber-500' : 'bg-red-500')
const stroke = (pct: number) => (pct >= 70 ? 'stroke-emerald-500' : pct >= 45 ? 'stroke-amber-500' : 'stroke-red-500')

export function ProfileScore(props: {
  connected: boolean
  initial: ProfileFields | null
  loadError: string | null
  history: AuditPoint[]
  historyNote: string | null
}) {
  const [profile, setProfile] = useState<ProfileFields>(props.initial ?? EMPTY_PROFILE)
  const [loadErr, setLoadErr] = useState<string | null>(props.loadError)
  const [pinned, setPinned] = useState('')
  const [highlights, setHighlights] = useState('')
  const [linkDest, setLinkDest] = useState('')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState<'' | 'load' | 'score'>('')
  const [err, setErr] = useState<string | null>(null)
  const [result, setResult] = useState<ProfileScoreResult | null>(null)
  const [history, setHistory] = useState<AuditPoint[]>(props.history)
  const [historyNote, setHistoryNote] = useState<string | null>(props.historyNote)

  const set = <K extends keyof ProfileFields>(k: K, v: ProfileFields[K]) => setProfile((p) => ({ ...p, [k]: v }))

  async function refresh() {
    if (busy) return
    setBusy('load'); setLoadErr(null)
    try {
      const res = await loadProfileAction()
      if (res.connected) {
        setProfile(res.profile)
        setLoadErr(res.error ?? null)
      }
    } catch {
      setLoadErr('Couldn’t reach Instagram. Try again.')
    }
    setBusy('')
  }

  async function score() {
    if (busy) return
    setBusy('score'); setErr(null)
    try {
      const res = await scoreProfileAction({
        ...profile,
        connected: props.connected,
        pinned, highlights, linkDestination: linkDest, notes,
      })
      if (res.error || !res.result) { setErr(res.error ?? 'Scoring failed.'); return }
      const r = res.result
      setResult(r)
      if (r.historyNote) setHistoryNote(r.historyNote)
      else setHistory((h) => [...h, { id: r.createdAt, score: r.score, createdAt: r.createdAt }].slice(-10))
      requestAnimationFrame(() => document.getElementById('profile-result')?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
    } catch {
      setErr('Scoring failed, try again.')
    } finally {
      setBusy('')
    }
  }

  const canScore = !!(profile.name.trim() || profile.bio.trim() || profile.username.trim())

  return (
    <div className="space-y-5">
      {!props.connected && (
        <div className="flex flex-col gap-3 rounded-xl border border-dashed border-border bg-card/50 p-4 sm:flex-row sm:items-center">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <AtSign className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1 text-sm">
            <p className="font-medium">Instagram isn’t connected</p>
            <p className="text-muted-foreground">Connect it to pull your name, bio, link and first nine posts automatically. Or type them in below, scoring works either way.</p>
          </div>
          <Link href="/settings/channels" className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:brightness-110">
            Connect Instagram
          </Link>
        </div>
      )}
      {loadErr && <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{loadErr}</div>}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        {/* Preview */}
        <div className="space-y-4 rounded-xl border border-border bg-card p-4 sm:p-5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold">How it reads</p>
            {props.connected && (
              <Button variant="ghost" size="sm" onClick={refresh} disabled={!!busy}>
                {busy === 'load' ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Refresh
              </Button>
            )}
          </div>
          <ProfilePreview profile={profile} />
          <GridPreview profile={profile} />
        </div>

        {/* Inputs */}
        <div className="space-y-4 rounded-xl border border-border bg-card p-4 sm:p-5">
          <p className="text-sm font-semibold">{props.connected ? 'Profile fields (edit to test a change)' : 'Your profile'}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field id="pf-name" label="Name field" count={profile.name.length} max={NAME_MAX}>
              <input id="pf-name" value={profile.name} onChange={(e) => set('name', e.target.value)} className={cn(area, 'h-10')} placeholder="Dana Ruiz | Proposal templates" />
            </Field>
            <Field id="pf-user" label="Handle">
              <input id="pf-user" value={profile.username} onChange={(e) => set('username', e.target.value.replace(/^@/, ''))} className={cn(area, 'h-10')} placeholder="danaruiz" />
            </Field>
          </div>
          <Field id="pf-bio" label="Bio" count={profile.bio.length} max={BIO_MAX}>
            <textarea id="pf-bio" value={profile.bio} onChange={(e) => set('bio', e.target.value)} rows={3} className={area} placeholder="Who it’s for and what changes for them." />
          </Field>
          <Field id="pf-site" label="Link in bio">
            <input id="pf-site" value={profile.website} onChange={(e) => set('website', e.target.value)} className={cn(area, 'h-10')} placeholder="https://…" />
          </Field>

          <div className="space-y-3 border-t border-border pt-4">
            <p className="text-xs text-muted-foreground">Instagram’s API can’t see these, so tell us:</p>
            <Field id="pf-pinned" label="What’s pinned?" hint='Describe the 1-3 pinned posts, or "none".'>
              <input id="pf-pinned" value={pinned} onChange={(e) => setPinned(e.target.value)} className={cn(area, 'h-10')} placeholder="none" />
            </Field>
            <Field id="pf-hl" label="Highlight names" hint="Comma separated, in order.">
              <input id="pf-hl" value={highlights} onChange={(e) => setHighlights(e.target.value)} className={cn(area, 'h-10')} placeholder="Pricing, Results, How it works, About" />
            </Field>
            <Field id="pf-link" label="Where the link goes">
              <input id="pf-link" value={linkDest} onChange={(e) => setLinkDest(e.target.value)} className={cn(area, 'h-10')} placeholder="Linktree with 8 links / booking page / shop" />
            </Field>
            <Field id="pf-notes" label="Anything else (optional)" hint="Photo, story habit, contact buttons, covers.">
              <textarea id="pf-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={area} placeholder="Logo as photo, stories about twice a week, email button works." />
            </Field>
          </div>

          <Button onClick={score} disabled={!!busy || !canScore} className="w-full">
            {busy === 'score' ? <><Loader2 className="h-4 w-4 animate-spin" /> Scoring against 12 checks…</> : <><Sparkles className="h-4 w-4" /> {result ? 'Re-score my profile' : 'Score my profile'}</>}
          </Button>
          {err && <p className="text-sm text-destructive">{err}</p>}
        </div>
      </div>

      {result && <Result result={result} />}

      <History history={history} note={historyNote} />
    </div>
  )
}

function Field({ id, label, hint, count, max, children }: { id: string; label: string; hint?: string; count?: number; max?: number; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-sm font-medium">{label}</label>
        {max != null && count != null && <CharCount count={count} max={max} />}
      </div>
      {children}
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

function CharCount({ count, max }: { count: number; max: number }) {
  return <span className={cn('text-xs tabular-nums', count > max ? 'font-semibold text-destructive' : 'text-muted-foreground')}>{count}/{max}</span>
}

function ProfilePreview({ profile }: { profile: ProfileFields }) {
  const initial = (profile.name || profile.username || '?').trim().charAt(0).toUpperCase()
  return (
    <div className="rounded-lg border border-border bg-background p-4">
      <div className="flex items-center gap-4">
        {profile.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={profile.avatarUrl} alt="" className="h-16 w-16 shrink-0 rounded-full object-cover ring-2 ring-border" />
        ) : (
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-muted text-xl font-semibold text-muted-foreground">{initial}</div>
        )}
        <div className="grid flex-1 grid-cols-2 text-center text-sm">
          <div><p className="font-semibold tabular-nums">{compact(profile.mediaCount)}</p><p className="text-xs text-muted-foreground">posts</p></div>
          <div><p className="font-semibold tabular-nums">{compact(profile.followers)}</p><p className="text-xs text-muted-foreground">followers</p></div>
        </div>
      </div>
      <div className="mt-3 space-y-0.5 text-sm">
        <p className="font-semibold">{profile.name || <span className="text-muted-foreground">(name field empty)</span>}</p>
        {profile.username && <p className="text-xs text-muted-foreground">@{profile.username}</p>}
        <p className="whitespace-pre-line break-words">{profile.bio || <span className="text-muted-foreground">(no bio)</span>}</p>
        {profile.website && <p className="truncate font-medium text-sky-700 dark:text-sky-400">{profile.website.replace(/^https?:\/\//, '').replace(/\/$/, '')}</p>}
      </div>
    </div>
  )
}

function GridPreview({ profile }: { profile: ProfileFields }) {
  if (!profile.grid.length) {
    return <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">No grid to show. Connect Instagram to see your first nine posts.</p>
  }
  return (
    <div>
      <p className="mb-1.5 text-xs text-muted-foreground">First nine at thumbnail size. Can you tell what the account is about without tapping?</p>
      <div className="grid grid-cols-3 gap-0.5 overflow-hidden rounded-md">
        {profile.grid.slice(0, 9).map((g) => (
          <a key={g.id} href={g.permalink ?? undefined} target="_blank" rel="noreferrer" title={g.firstLine || undefined} className="relative block aspect-[4/5] bg-muted">
            {g.thumb ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={g.thumb} alt={g.firstLine || 'Post'} loading="lazy" className="h-full w-full object-cover" />
            ) : (
              <span className="flex h-full items-center justify-center p-1 text-center text-[10px] text-muted-foreground">{g.firstLine || g.mediaType}</span>
            )}
            {(g.productType === 'REELS' || g.mediaType === 'VIDEO') && (
              <span className="absolute right-1 top-1 rounded bg-black/60 px-1 text-[9px] font-semibold uppercase text-white">Reel</span>
            )}
          </a>
        ))}
      </div>
    </div>
  )
}

function ScoreRing({ score }: { score: number }) {
  const r = 52
  const c = 2 * Math.PI * r
  return (
    <div className="relative h-36 w-36 shrink-0">
      <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90" aria-hidden="true">
        <circle cx="60" cy="60" r={r} className="fill-none stroke-border" strokeWidth="10" />
        <circle cx="60" cy="60" r={r} className={cn('fill-none transition-all', stroke(score))} strokeWidth="10" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - Math.max(0, Math.min(100, score)) / 100)} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-4xl font-bold tabular-nums">{score}</span>
        <span className="text-xs text-muted-foreground">/ 100</span>
      </div>
    </div>
  )
}

type Section = { key: keyof ProfileRewrites; title: string; items: string[]; why: string }

/** Rewrites in fix-first order: the section whose rubric items lost the most points goes first. */
function fixFirst(rewrites: ProfileRewrites, items: ScoredItem[]): Section[] {
  const lost = (...ids: string[]) => items.filter((i) => ids.includes(i.id)).reduce((s, i) => s + (i.max - i.points), 0)
  const all: (Section & { lost: number })[] = [
    { key: 'name_field', title: 'Name field', items: rewrites.name_field, why: 'The bold line Instagram search matches. {Name} | {what you do, in searched words}.', lost: lost('name_field') },
    { key: 'bio', title: 'Bio', items: rewrites.bio, why: 'Line one: who it’s for and what changes. Then one proof or one plain offer.', lost: lost('bio_first_line', 'bio_body') },
    { key: 'pinned_plan', title: 'Pinned three', items: rewrites.pinned_plan, why: 'Three slots, three jobs. The highest-leverage fix on the profile, and it takes four taps.', lost: lost('pinned_three') },
    { key: 'highlights', title: 'Highlights', items: rewrites.highlights, why: 'Four to six, named for the questions a buyer asks. Delete the rest.', lost: lost('highlights') },
    { key: 'link', title: 'Link', items: rewrites.link ? [rewrites.link] : [], why: 'One destination that matches what the bio just promised.', lost: lost('link') },
    { key: 'grid_covers', title: 'Grid covers', items: rewrites.grid_covers, why: 'About four words on each cover makes the grid readable in one glance.', lost: lost('grid_legibility') },
  ]
  return all.filter((s) => s.items.length).map((s, i) => ({ s, i })).sort((a, b) => b.s.lost - a.s.lost || a.i - b.i).map(({ s }) => s)
}

function Result({ result }: { result: ProfileScoreResult }) {
  const sorted = useMemo(() => [...result.items].sort((a, b) => (b.max - b.points) - (a.max - a.points)), [result.items])
  const sections = useMemo(() => fixFirst(result.rewrites, result.items), [result.rewrites, result.items])
  const delta = result.previousScore != null ? result.score - result.previousScore : null

  return (
    <div id="profile-result" className="scroll-mt-4 space-y-5">
      <div className="flex flex-col items-center gap-5 rounded-xl border border-border bg-card p-5 sm:flex-row sm:items-center">
        <ScoreRing score={result.score} />
        <div className="space-y-2 text-center sm:text-left">
          <p className="text-lg font-semibold">Profile score {result.score}/100</p>
          {delta != null ? (
            <Badge tone={delta > 0 ? 'success' : delta < 0 ? 'error' : 'neutral'} className="normal-case">
              {delta > 0 ? <TrendingUp className="h-3 w-3" aria-hidden="true" /> : delta < 0 ? <TrendingDown className="h-3 w-3" aria-hidden="true" /> : null}
              {delta > 0 ? `+${delta}` : delta} since last audit ({result.previousScore})
            </Badge>
          ) : <Badge tone="neutral" className="normal-case">First audit</Badge>}
          <p className="max-w-md text-sm text-muted-foreground">
            {result.score < 50
              ? 'Most first passes land in the 30s and 40s. Fix the top of the list first, then re-score.'
              : result.score < 80
                ? 'Solid base. The remaining points are in the items at the top of the table.'
                : 'Strong. What’s left is usually a grid habit, a story habit or a pinned post that doesn’t exist yet.'}
          </p>
          {result.historyNote && <p className="text-xs text-amber-700">{result.historyNote}</p>}
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="border-b border-border px-4 py-3">
          <p className="text-sm font-semibold">12 checks, most points lost first</p>
        </div>
        <ul className="divide-y divide-border">
          {sorted.map((i) => {
            const pct = i.max ? (i.points / i.max) * 100 : 0
            return (
              <li key={i.id} className="grid gap-1.5 px-4 py-3 sm:grid-cols-[10rem_7rem_1fr] sm:items-center sm:gap-4">
                <div className="flex items-baseline justify-between gap-2 sm:block">
                  <p className="text-sm font-medium">{i.label}</p>
                  <p className="text-xs tabular-nums text-muted-foreground sm:hidden">{i.points}/{i.max}</p>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-border" aria-hidden="true">
                    <div className={cn('h-full rounded-full', tone(pct))} style={{ width: `${Math.max(3, pct)}%` }} />
                  </div>
                  <span className="hidden w-10 text-right text-xs tabular-nums text-muted-foreground sm:inline">{i.points}/{i.max}</span>
                </div>
                <p className="text-sm text-muted-foreground">{i.note}</p>
              </li>
            )
          })}
        </ul>
      </div>

      {sections.length > 0 && (
        <div className="space-y-3">
          <p className="text-sm font-semibold">Rewrites, in fix-first order <span className="font-normal text-muted-foreground">· change one, then re-score</span></p>
          {sections.map((s, n) => (
            <div key={s.key} className="space-y-3 rounded-xl border border-border bg-card p-4">
              <div>
                <p className="text-sm font-semibold"><span className="mr-1.5 text-primary">{n + 1}.</span>{s.title}</p>
                <p className="text-xs text-muted-foreground">{s.why}</p>
              </div>
              {s.key === 'highlights' ? (
                <div className="space-y-2">
                  <div className="flex flex-wrap gap-2">
                    {s.items.map((h) => <span key={h} className="rounded-full border border-border px-3 py-1 text-sm">{h}</span>)}
                  </div>
                  <CopyButton text={s.items.join(', ')} />
                </div>
              ) : (
                <ul className="space-y-2">
                  {s.items.map((t, i) => (
                    <CopyBlock key={`${s.key}-${i}`} text={t} label={s.key === 'pinned_plan' ? `Slot ${i + 1}` : s.key === 'grid_covers' ? `Post ${i + 1}` : undefined}
                      max={s.key === 'name_field' ? NAME_MAX : s.key === 'bio' ? BIO_MAX : undefined} />
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function CopyBlock({ text, label, max }: { text: string; label?: string; max?: number }) {
  return (
    <li className="flex items-start gap-3 rounded-lg border border-border bg-background p-3">
      <div className="min-w-0 flex-1">
        {label && <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>}
        <p className="whitespace-pre-line break-words text-sm">{text}</p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <CopyButton text={text} />
        {max != null && <CharCount count={text.length} max={max} />}
      </div>
    </li>
  )
}

function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false)
  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      setDone(true)
      setTimeout(() => setDone(false), 1500)
    } catch {
      /* clipboard blocked; the text is selectable */
    }
  }
  return (
    <Button size="sm" variant="outline" onClick={copy} aria-label="Copy">
      {done ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} {done ? 'Copied' : 'Copy'}
    </Button>
  )
}

function History({ history, note }: { history: AuditPoint[]; note: string | null }) {
  if (!history.length) {
    return note ? <p className="text-xs text-muted-foreground">{note}</p> : null
  }
  const w = 240
  const h = 48
  const pts = history.map((a, i) => {
    const x = history.length === 1 ? w / 2 : (i / (history.length - 1)) * w
    const y = h - (Math.max(0, Math.min(100, a.score)) / 100) * h
    return { x, y, a }
  })
  const fmt = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center gap-2">
        <Gauge className="h-4 w-4 text-primary" aria-hidden="true" />
        <p className="text-sm font-semibold">Score history</p>
        {note && <span className="text-xs text-muted-foreground">· {note}</span>}
      </div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <svg viewBox={`-4 -4 ${w + 8} ${h + 8}`} className="h-14 w-full max-w-xs" role="img" aria-label={`Scores: ${history.map((a) => a.score).join(', ')}`}>
          <polyline points={pts.map((p) => `${p.x},${p.y}`).join(' ')} className="fill-none stroke-primary" strokeWidth="2" strokeLinejoin="round" />
          {pts.map((p) => <circle key={p.a.id} cx={p.x} cy={p.y} r="3" className="fill-primary" />)}
        </svg>
        <ol className="flex flex-wrap gap-2 text-xs">
          {[...history].reverse().map((a) => (
            <li key={a.id} className="rounded-md border border-border px-2 py-1">
              <span className="font-semibold tabular-nums">{a.score}</span> <span className="text-muted-foreground">{fmt(a.createdAt)}</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  )
}
