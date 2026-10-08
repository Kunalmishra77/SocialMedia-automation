'use client'

import { useDeferredValue, useMemo, useState } from 'react'
import Link from 'next/link'
import { Clapperboard, Loader2, Sparkles, ArrowLeft, Save, Plus, Trash2, AlertTriangle, Repeat } from 'lucide-react'
import {
  generateHooksAction, writeReelScriptAction, saveReelDraftAction,
  type HookOption, type ReelLine,
} from '@/lib/actions/reels'
import { scoreHook } from '@/lib/ig/hooks'
import { beatSheet, formatTimecode } from '@/lib/ig/beats'
import { detect } from '@/lib/ig/detect'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { CaptionCoach } from '@/components/content/caption-coach'
import { cn } from '@/lib/utils'

const area = 'w-full rounded-md border border-input bg-background px-3 py-2 text-sm'
const LENGTHS = [15, 30, 45, 60]
const EXAMPLES = [
  'We cut delivery time from 5 days to 48 hours by changing one supplier',
  'The skincare step most people do in the wrong order',
  'Why our cheapest product is our best seller',
]
const BAND_TONE = { STRONG: 'success', OK: 'warning', WEAK: 'error' } as const

function ScoreBar({ score }: { score: number }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-border" aria-hidden="true">
      <div
        className={cn('h-full rounded-full', score >= 70 ? 'bg-emerald-500' : score >= 50 ? 'bg-amber-500' : 'bg-red-500')}
        style={{ width: `${Math.max(3, Math.min(100, score))}%` }}
      />
    </div>
  )
}

export function ReelStudio({ initialIdea = '' }: { initialIdea?: string }) {
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [idea, setIdea] = useState(initialIdea)
  const [seconds, setSeconds] = useState(30)
  const [busy, setBusy] = useState<'' | 'hooks' | 'script' | 'save'>('')
  const [err, setErr] = useState<string | null>(null)
  const [saved, setSaved] = useState<'' | 'draft' | 'scheduled'>('')

  const [hooks, setHooks] = useState<HookOption[]>([])
  const [custom, setCustom] = useState('')
  const [chosen, setChosen] = useState<{ spoken: string; onScreen: string; formulaName: string | null } | null>(null)

  const [lines, setLines] = useState<ReelLine[]>([])
  const [caption, setCaption] = useState('')
  const [hashtags, setHashtags] = useState('')

  const customScore = useMemo(() => (custom.trim() ? scoreHook(custom.trim()) : null), [custom])

  async function getHooks() {
    if (!idea.trim() || busy) return
    setBusy('hooks'); setErr(null); setSaved('')
    const res = await generateHooksAction(idea)
    setBusy('')
    if (res.error || !res.hooks) { setErr(res.error ?? 'Failed.'); return }
    setHooks(res.hooks)
    setStep(2)
  }

  async function pick(h: { spoken: string; onScreen: string; formulaName: string | null }) {
    if (busy) return
    setChosen(h); setBusy('script'); setErr(null)
    const res = await writeReelScriptAction({ idea, hook: { spoken: h.spoken, onScreen: h.onScreen }, seconds })
    setBusy('')
    if (res.error || !res.draft) { setErr(res.error ?? 'Failed.'); return }
    setLines(res.draft.lines)
    setCaption(res.draft.caption)
    setHashtags(res.draft.hashtags.map((t) => `#${t}`).join(' '))
    setStep(3)
  }

  async function save(media: File | null, when: string) {
    if (!chosen || busy) return
    setBusy('save'); setErr(null)
    const fd = new FormData()
    fd.set('payload', JSON.stringify({
      idea,
      hook: { ...chosen, score: Math.round(scoreHook(lines[0]?.spoken || chosen.spoken).score) },
      lines, caption, hashtags, seconds,
    }))
    if (media) fd.set('media', media)
    // datetime-local is the user's wall-clock; convert in the browser so the timezone is right.
    if (when) fd.set('scheduled_at', new Date(when).toISOString())
    const res = await saveReelDraftAction(fd)
    setBusy('')
    if (res.error) { setErr(res.error); return }
    setSaved(res.scheduled ? 'scheduled' : 'draft')
  }

  function editLine(i: number, field: keyof ReelLine, value: string) {
    setLines((ls) => ls.map((l, j) => (j === i ? { ...l, [field]: value } : l)))
  }

  return (
    <div className="space-y-5">
      <Stepper step={step} />

      {step === 1 && (
        <div className="space-y-4 rounded-xl border border-border bg-card p-5">
          <div>
            <label htmlFor="reel-idea" className="mb-1.5 block text-sm font-medium">What is the Reel about?</label>
            <textarea id="reel-idea" value={idea} onChange={(e) => setIdea(e.target.value)} rows={3} className={area}
              placeholder="One specific, true thing: what happened, to whom, and what it cost or returned." />
            <div className="mt-2 flex flex-wrap gap-1.5">
              {EXAMPLES.map((ex) => (
                <button key={ex} type="button" onClick={() => setIdea(ex)} className="rounded-full border border-border px-2.5 py-0.5 text-xs text-muted-foreground hover:border-primary/40 hover:text-foreground">{ex}</button>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-1.5 text-sm font-medium">Target length</p>
            <div className="flex gap-2">
              {LENGTHS.map((l) => (
                <button key={l} type="button" onClick={() => setSeconds(l)}
                  className={cn('rounded-full border px-3 py-1 text-xs font-medium', seconds === l ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground')}>
                  {l}s
                </button>
              ))}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">15 to 45 seconds is the working range for most Reels.</p>
          </div>
          <Button onClick={getHooks} disabled={!!busy || !idea.trim()} className="w-full">
            {busy === 'hooks' ? <><Loader2 className="h-4 w-4 animate-spin" /> Writing & scoring hooks…</> : <><Sparkles className="h-4 w-4" /> Write 5 hooks</>}
          </Button>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setStep(1)}><ArrowLeft className="h-4 w-4" /> Idea</Button>
            <p className="text-sm text-muted-foreground">Ranked by the hook panel. If the top one is under 50, none of these is the hook yet.</p>
          </div>
          <div className="space-y-3">
            {hooks.map((h, i) => (
              <HookCard key={`${h.spoken}-${i}`} hook={h} best={i === 0} busy={busy === 'script' && chosen?.spoken === h.spoken} disabled={!!busy} onPick={() => pick(h)} />
            ))}
          </div>
          <div className="space-y-2 rounded-xl border border-dashed border-border bg-card p-4">
            <label htmlFor="own-hook" className="text-sm font-medium">Or write your own hook (scored as you type)</label>
            <input id="own-hook" value={custom} onChange={(e) => setCustom(e.target.value)} className={`${area} h-10`} placeholder="I lost ₹2 lakh because of one missing clause." />
            {customScore && (
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <Badge tone={BAND_TONE[customScore.band]}>{Math.round(customScore.score)} {customScore.band}</Badge>
                {customScore.formula && <span className="text-muted-foreground">#{customScore.formula.id} {customScore.formula.name}</span>}
                {customScore.dealbreakers.map((d) => <span key={d} className="text-destructive">{d}</span>)}
                <Button size="sm" className="ml-auto" disabled={!!busy} onClick={() => pick({ spoken: custom.trim(), onScreen: '', formulaName: customScore.formula?.name ?? null })}>
                  {busy === 'script' && chosen?.spoken === custom.trim() ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Use this hook'}
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      {step === 3 && chosen && (
        <ScriptEditor
          lines={lines} seconds={seconds} caption={caption} hashtags={hashtags}
          onBack={() => setStep(2)} onLine={editLine}
          onAdd={(i) => setLines((ls) => [...ls.slice(0, i + 1), { spoken: '', onScreen: '' }, ...ls.slice(i + 1)])}
          onRemove={(i) => setLines((ls) => ls.filter((_, j) => j !== i))}
          onCaption={setCaption} onHashtags={setHashtags}
          onSave={save} saving={busy === 'save'} saved={saved}
        />
      )}

      {err && <p className="text-sm text-destructive">{err}</p>}
    </div>
  )
}

function Stepper({ step }: { step: number }) {
  const steps = ['Idea', 'Hooks', 'Script']
  return (
    <ol className="flex items-center gap-2 text-xs">
      {steps.map((s, i) => (
        <li key={s} className="flex items-center gap-2">
          <span className={cn('flex h-6 w-6 items-center justify-center rounded-full font-semibold', step > i ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground')}>{i + 1}</span>
          <span className={cn(step === i + 1 ? 'font-medium text-foreground' : 'text-muted-foreground')}>{s}</span>
          {i < steps.length - 1 && <span className="h-px w-8 bg-border" aria-hidden="true" />}
        </li>
      ))}
    </ol>
  )
}

function HookCard({ hook, best, busy, disabled, onPick }: { hook: HookOption; best: boolean; busy: boolean; disabled: boolean; onPick: () => void }) {
  const s = hook.score
  return (
    <div className={cn('rounded-xl border bg-card p-4', best ? 'border-primary/50 shadow-[var(--shadow-card)]' : 'border-border')}>
      <div className="flex flex-wrap items-start gap-3">
        <div className="w-16 shrink-0 text-center">
          <p className="text-2xl font-bold tabular-nums">{Math.round(s.score)}</p>
          <Badge tone={BAND_TONE[s.band]} className="mt-1">{s.band}</Badge>
        </div>
        <div className="min-w-0 flex-1 space-y-1.5">
          <p className="font-medium">“{hook.spoken}”</p>
          {hook.onScreen && <p className="inline-block rounded bg-foreground px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-background">{hook.onScreen}</p>}
          <p className="text-xs text-muted-foreground">
            {hook.formulaName ? `${hook.formulaId ? `#${hook.formulaId} ` : ''}${hook.formulaName}` : 'No formula matched'}
            {' · '}weakest: {s.weakest.key} ({Math.round(s.weakest.score)})
          </p>
          {s.dealbreakers.map((d) => (
            <p key={d} className="flex items-start gap-1 text-xs text-destructive"><AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />{d}</p>
          ))}
          <div className="grid grid-cols-5 gap-2 pt-1">
            {s.checks.map((c) => (
              <div key={c.key} title={c.note}>
                <p className="truncate text-[10px] uppercase tracking-wide text-muted-foreground">{c.label}</p>
                <ScoreBar score={c.score} />
              </div>
            ))}
          </div>
        </div>
        <Button size="sm" variant={best ? 'default' : 'outline'} onClick={onPick} disabled={disabled}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Clapperboard className="h-4 w-4" />} Script this
        </Button>
      </div>
    </div>
  )
}

function ScriptEditor(props: {
  lines: ReelLine[]; seconds: number; caption: string; hashtags: string
  onBack: () => void; onLine: (i: number, f: keyof ReelLine, v: string) => void
  onAdd: (i: number) => void; onRemove: (i: number) => void
  onCaption: (v: string) => void; onHashtags: (v: string) => void
  onSave: (media: File | null, when: string) => void; saving: boolean; saved: '' | 'draft' | 'scheduled'
}) {
  const { lines, seconds } = props
  const [media, setMedia] = useState<File | null>(null)
  const [when, setWhen] = useState('')
  const deferred = useDeferredValue(lines)
  const sheet = useMemo(() => {
    const text = deferred.map((l) => l.spoken.trim()).filter(Boolean).join('\n')
    return text ? beatSheet(text, { targetSeconds: seconds }) : null
  }, [deferred, seconds])
  const human = useMemo(() => {
    const text = deferred.map((l) => l.spoken).join(' ').trim()
    try { return text ? detect(text) : null } catch { return null }
  }, [deferred])
  const hookScore = useMemo(() => (lines[0]?.spoken.trim() ? scoreHook(lines[0].spoken.trim()) : null), [lines])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" onClick={props.onBack}><ArrowLeft className="h-4 w-4" /> Hooks</Button>
        {hookScore && <Badge tone={BAND_TONE[hookScore.band]}>Hook {Math.round(hookScore.score)} {hookScore.band}</Badge>}
        {sheet && <Badge tone={Math.abs(sheet.seconds - seconds) <= seconds * 0.2 ? 'success' : 'warning'}>~{sheet.seconds.toFixed(1)}s of {seconds}s</Badge>}
        {sheet && <Badge tone="neutral">{sheet.words} words · {sheet.beats.length} beats</Badge>}
        {sheet?.loops && <Badge tone="brand"><Repeat className="h-3 w-3" aria-hidden="true" /> Loops</Badge>}
        {human && <Badge tone={human.verdict === 'PASS' ? 'success' : 'warning'}>Human {Math.round(human.score)}</Badge>}
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_minmax(0,320px)]">
        {/* Script */}
        <div className="space-y-2 rounded-xl border border-border bg-card p-4">
          <div className="grid grid-cols-[3.5rem_1fr_11rem_2rem] gap-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            <span>Time</span><span>Spoken</span><span>On screen (≤6 words)</span><span />
          </div>
          {lines.map((l, i) => {
            const beat = sheet?.beats[i]
            const words = l.onScreen.trim() ? l.onScreen.trim().split(/\s+/).length : 0
            return (
              <div key={i} className="group grid grid-cols-[3.5rem_1fr_11rem_2rem] items-start gap-2">
                <div className="pt-2 text-xs tabular-nums text-muted-foreground">
                  {beat ? formatTimecode(beat.start) : '—'}
                  {beat?.role && <p className="text-[10px] font-semibold text-primary">{beat.role}</p>}
                </div>
                <div>
                  <textarea value={l.spoken} onChange={(e) => props.onLine(i, 'spoken', e.target.value)} rows={2} className={cn(area, beat?.warn && 'border-amber-400')} aria-label={`Spoken line ${i + 1}`} />
                  {beat?.warn && <p className="text-[11px] text-amber-700">{beat.warn}</p>}
                </div>
                <div>
                  <input value={l.onScreen} onChange={(e) => props.onLine(i, 'onScreen', e.target.value)} className={cn(area, 'h-10 font-semibold uppercase', words > 6 && 'border-amber-400')} aria-label={`On-screen text ${i + 1}`} />
                  {words > 6 && <p className="text-[11px] text-amber-700">{words} words, keep it to 6</p>}
                </div>
                <div className="flex flex-col gap-1 pt-1 opacity-60 group-hover:opacity-100">
                  <button type="button" onClick={() => props.onAdd(i)} className="text-muted-foreground hover:text-foreground" aria-label="Add a line below"><Plus className="h-4 w-4" /></button>
                  {lines.length > 1 && <button type="button" onClick={() => props.onRemove(i)} className="text-muted-foreground hover:text-destructive" aria-label="Remove line"><Trash2 className="h-4 w-4" /></button>}
                </div>
              </div>
            )
          })}
        </div>

        {/* Edit notes */}
        <div className="space-y-3">
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="mb-2 text-sm font-semibold">Edit notes</p>
            {sheet?.notes.length ? (
              <ul className="space-y-2 text-xs text-muted-foreground">
                {sheet.notes.map((n) => <li key={n} className="leading-snug">• {n}</li>)}
              </ul>
            ) : <p className="text-xs text-muted-foreground">Clean. Every beat is short, concrete and the loop lands.</p>}
          </div>
          <div className="rounded-xl border border-border bg-card p-4 text-xs text-muted-foreground">
            <p className="mb-1 text-sm font-semibold text-foreground">Shooting rules</p>
            <ul className="space-y-1">
              <li>• Hook card up at frame 1, with motion, not a static face.</li>
              <li>• Change the frame every beat.</li>
              <li>• Keep text inside the safe zone: on 1080×1920, between y=230 and y=1440, and clear of the right 230px.</li>
              <li>• Burn in captions; most people watch muted first.</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Caption */}
      <div className="space-y-2 rounded-xl border border-border bg-card p-4">
        <p className="text-sm font-semibold">Caption <span className="font-normal text-muted-foreground">· the video carries the hook, so this carries the ask and the search words</span></p>
        <textarea value={props.caption} onChange={(e) => props.onCaption(e.target.value)} rows={5} className={area} />
        <input value={props.hashtags} onChange={(e) => props.onHashtags(e.target.value)} className={`${area} h-10`} placeholder="Up to 5 #hashtags" />
        <CaptionCoach caption={props.caption} hashtags={props.hashtags} onApply={props.onCaption} defaultOpen />
      </div>

      <div className="space-y-3 rounded-xl border border-border bg-card p-4">
        <p className="text-sm font-semibold">Shot it already? <span className="font-normal text-muted-foreground">· attach the video and pick a time to auto-publish, or save the script as a draft</span></p>
        <div className="grid gap-3 sm:grid-cols-2">
          <input type="file" accept="video/mp4,video/quicktime" onChange={(e) => setMedia(e.target.files?.[0] ?? null)} aria-label="Reel video"
            className="block w-full text-sm text-foreground file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-primary-foreground hover:file:brightness-110" />
          <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className={`${area} h-10`} aria-label="Publish time" disabled={!media} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => props.onSave(media, media ? when : '')} disabled={props.saving || !!props.saved}>
            {props.saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {props.saved === 'scheduled' ? 'Scheduled' : props.saved === 'draft' ? 'Saved as draft' : media && when ? 'Save & schedule Reel' : 'Save as Reel draft'}
          </Button>
          {props.saved && <Link href="/content" className="text-sm font-medium text-primary underline">View in Content →</Link>}
        </div>
      </div>
    </div>
  )
}
