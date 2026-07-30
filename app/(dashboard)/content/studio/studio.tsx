'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Wand2, Sparkles, Loader2, RefreshCw, ImageIcon, Check, X, CalendarClock } from 'lucide-react'
import {
  generateAiPostAction, regeneratePostAction, updatePostVariantAction,
  approvePostAction, rejectPostAction, type GeneratedPost,
} from '@/lib/actions/content'
import type { PlatformVariant } from '@/lib/ai/content-gen'
import { Button } from '@/components/ui/button'

const PLATFORMS = [
  { key: 'instagram', label: 'Instagram' },
  { key: 'facebook', label: 'Facebook' },
  { key: 'linkedin', label: 'LinkedIn' },
  { key: 'twitter', label: 'X / Twitter' },
]
const EXAMPLES = ['5 skincare tips for glowing skin', 'Benefits of daily sunscreen', 'Why our vitamin C serum works']
const area = 'w-full rounded-md border border-input bg-background px-3 py-2 text-sm'

export function Studio() {
  const [brief, setBrief] = useState('')
  const [sel, setSel] = useState<Set<string>>(new Set(['instagram']))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  // preview state
  const [post, setPost] = useState<GeneratedPost | null>(null)
  const [variants, setVariants] = useState<Record<string, PlatformVariant>>({})
  const [mediaUrl, setMediaUrl] = useState<string | null>(null)
  const [tab, setTab] = useState('instagram')
  const [regen, setRegen] = useState<'' | 'caption' | 'image' | 'all'>('')

  // schedule state
  const [when, setWhen] = useState('')
  const [publishTargets, setPublishTargets] = useState<Set<string>>(new Set())

  function toggle(set: Set<string>, k: string, setter: (s: Set<string>) => void) {
    const n = new Set(set)
    n.has(k) ? n.delete(k) : n.add(k)
    setter(n)
  }

  async function generate(text?: string) {
    const b = (text ?? brief).trim()
    if (!b || busy) return
    setBusy(true); setErr(null); setDone(null)
    const res = await generateAiPostAction(b, [...sel])
    setBusy(false)
    if (res.error || !res.post) { setErr(res.error ?? 'Generation failed.'); return }
    const p = res.post
    setPost(p)
    setVariants(p.variants)
    setMediaUrl(p.media_url)
    const first = p.variants.instagram ? 'instagram' : Object.keys(p.variants)[0]
    setTab(first)
    setPublishTargets(new Set(p.target_platforms))
    setWhen('')
  }

  async function doRegen(what: 'caption' | 'image' | 'all') {
    if (!post || regen) return
    setRegen(what); setErr(null)
    const res = await regeneratePostAction(post.id, what)
    setRegen('')
    if (res.error) { setErr(res.error); return }
    if (res.variants) setVariants(res.variants)
    if (res.media_url !== undefined && res.media_url !== null) setMediaUrl(res.media_url)
  }

  function editVariant(field: keyof PlatformVariant, value: string) {
    setVariants((v) => ({ ...v, [tab]: { ...v[tab], [field]: field === 'hashtags' ? value.split(/[\s,]+/).map((h) => h.replace(/^#/, '')).filter(Boolean) : value } }))
  }

  async function saveActive() {
    if (!post) return
    const v = variants[tab]
    await updatePostVariantAction(post.id, tab, { caption: v.caption, hashtags: v.hashtags.join(' '), cta: v.cta ?? '' })
  }

  async function approve(schedule: boolean) {
    if (!post || busy) return
    if (schedule && !when) { setErr('Pick a date & time to schedule.'); return }
    setBusy(true); setErr(null)
    await saveActive()
    const fd = new FormData()
    fd.set('id', post.id)
    if (schedule) fd.set('scheduled_at', new Date(when).toISOString())
    ;[...publishTargets].forEach((t) => fd.append('target_platforms', t))
    const res = await approvePostAction(fd)
    setBusy(false)
    if (res.error) { setErr(res.error); return }
    reset(schedule ? 'Approved & scheduled — it will auto-publish at the set time.' : 'Approved. Schedule it any time from Content.')
  }

  async function reject() {
    if (!post || busy) return
    const note = window.prompt('Reason for rejecting (optional):') ?? ''
    setBusy(true)
    const fd = new FormData()
    fd.set('id', post.id); fd.set('note', note)
    await rejectPostAction(fd)
    setBusy(false)
    reset('Post rejected and removed from the queue.')
  }

  function reset(msg: string) {
    setPost(null); setVariants({}); setMediaUrl(null); setBrief('')
    setDone(msg)
  }

  const v = variants[tab]
  const activePlatforms = Object.keys(variants)

  return (
    <div className="space-y-5">
      {/* ── Brief input ── */}
      {!post && (
        <div className="space-y-3 rounded-xl border border-border bg-card p-5">
          <label className="block text-sm font-medium">Topic or content idea</label>
          <textarea
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            rows={2}
            placeholder="e.g. 5 skincare tips for glowing skin"
            className={area}
          />
          <div className="flex flex-wrap gap-1.5">
            {EXAMPLES.map((ex) => (
              <button key={ex} onClick={() => setBrief(ex)} className="rounded-full border border-border px-2.5 py-0.5 text-xs text-muted-foreground hover:border-primary/40 hover:text-foreground">
                {ex}
              </button>
            ))}
          </div>

          <div>
            <p className="mb-1.5 text-sm font-medium">Generate for</p>
            <div className="flex flex-wrap gap-2">
              {PLATFORMS.map((p) => (
                <label key={p.key} className={`flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 text-xs ${sel.has(p.key) ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground'}`}>
                  <input type="checkbox" className="hidden" checked={sel.has(p.key)} onChange={() => toggle(sel, p.key, setSel)} />
                  {p.label}
                </label>
              ))}
            </div>
          </div>

          <Button onClick={() => generate()} disabled={busy || !brief.trim() || sel.size === 0} className="w-full">
            {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Generating post + visual…</> : <><Wand2 className="h-4 w-4" /> Generate with AI</>}
          </Button>
          {err && <p className="text-sm text-destructive">{err}</p>}
        </div>
      )}

      {done && !post && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {done} <Link href="/content" className="font-medium underline">View content →</Link>
        </div>
      )}

      {/* ── Preview & approve ── */}
      {post && v && (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,340px)_1fr]">
          {/* Visual */}
          <div className="space-y-3">
            <div className="relative overflow-hidden rounded-xl border border-border bg-muted">
              {mediaUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={mediaUrl} alt="" className="aspect-square w-full object-cover" />
              ) : (
                <div className="flex aspect-square w-full items-center justify-center text-muted-foreground"><ImageIcon className="h-8 w-8" /></div>
              )}
            </div>
            <Button variant="outline" size="sm" onClick={() => doRegen('image')} disabled={!!regen} className="w-full">
              {regen === 'image' ? <><Loader2 className="h-4 w-4 animate-spin" /> Redrawing…</> : <><RefreshCw className="h-4 w-4" /> Regenerate image</>}
            </Button>
            {post.image_source && <p className="text-center text-xs text-muted-foreground">Visual: {post.image_source === 'ai' ? 'AI-generated' : 'branded template'}</p>}
          </div>

          {/* Copy */}
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              {activePlatforms.map((p) => (
                <button key={p} onClick={() => setTab(p)} className={`rounded-full px-3 py-1 text-xs font-medium capitalize ${tab === p ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'}`}>
                  {PLATFORMS.find((x) => x.key === p)?.label ?? p}
                </button>
              ))}
              <div className="ml-auto flex gap-2">
                <Button variant="ghost" size="sm" onClick={() => doRegen('caption')} disabled={!!regen}>
                  {regen === 'caption' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Regenerate copy
                </Button>
              </div>
            </div>

            <div className="space-y-3 rounded-xl border border-border bg-card p-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Caption / body</label>
                <textarea value={v.caption} onChange={(e) => editVariant('caption', e.target.value)} rows={6} className={area} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Hashtags</label>
                <textarea value={v.hashtags.join(' ')} onChange={(e) => editVariant('hashtags', e.target.value)} rows={2} className={area} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Call-to-action</label>
                <input value={v.cta ?? ''} onChange={(e) => editVariant('cta', e.target.value)} className={`${area} h-10`} />
              </div>
            </div>

            {/* Schedule + approve */}
            <div className="space-y-3 rounded-xl border border-border bg-card p-4">
              <p className="text-sm font-semibold">Approve & schedule</p>
              <div>
                <p className="mb-1.5 text-xs font-medium text-muted-foreground">Publish to</p>
                <div className="flex flex-wrap gap-2">
                  {activePlatforms.map((p) => {
                    const live = p === 'instagram'
                    return (
                      <label key={p} className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs ${publishTargets.has(p) ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground'} ${live ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'}`}>
                        <input type="checkbox" className="hidden" disabled={!live} checked={publishTargets.has(p)} onChange={() => toggle(publishTargets, p, setPublishTargets)} />
                        {PLATFORMS.find((x) => x.key === p)?.label ?? p}{!live && ' (soon)'}
                      </label>
                    )
                  })}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">Auto-publish is live for Instagram. Other platforms save the copy for when their publishing is enabled.</p>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Date & time (your timezone)</label>
                <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className={`${area} h-10`} />
              </div>
              {err && <p className="text-sm text-destructive">{err}</p>}
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => approve(true)} disabled={busy}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarClock className="h-4 w-4" />} Approve & schedule
                </Button>
                <Button variant="outline" onClick={() => approve(false)} disabled={busy}><Check className="h-4 w-4" /> Approve only</Button>
                <Button variant="ghost" onClick={reject} disabled={busy} className="text-destructive"><X className="h-4 w-4" /> Reject</Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
