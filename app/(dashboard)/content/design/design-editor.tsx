'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Wand2, Loader2, Type, Trash2, Upload, CalendarClock, Check, ImageIcon, Undo2, Copy, ArrowUpToLine, ArrowDownToLine, AlignLeft, AlignCenter, AlignRight } from 'lucide-react'
import { generateDesignAction, regenerateHeroAction, saveDesignAction, generatePosterAction, regeneratePosterAction, uploadReferenceAction, type DesignPayload } from '@/lib/actions/content'
import { Button } from '@/components/ui/button'

const POSTER_DIMS: Record<string, { w: number; h: number }> = {
  portrait: { w: 456, h: 684 }, square: { w: 540, h: 540 }, landscape: { w: 640, h: 427 },
}

/* eslint-disable @typescript-eslint/no-explicit-any */

const W = 540, H = 675, NAVY = '#16233a', ACCENT = '#ea6a24', GRAY = '#5b6472'
const EXAMPLES = ['Manual work isn’t free', '5 skincare tips for glowing skin', 'Why daily sunscreen matters']
const SWATCHES = [NAVY, ACCENT, '#ffffff', GRAY, '#000000', '#10b981']
const TEMPLATES = [
  { key: 'hero', label: 'Hero + photo' },
  { key: 'bullets', label: 'Bullets + CTA' },
  { key: 'split', label: 'Split' },
  { key: 'cards', label: 'Icon cards' },
  { key: 'receipt', label: 'Statement' },
] as const
type TemplateKey = (typeof TEMPLATES)[number]['key']
const area = 'w-full rounded-md border border-input bg-background px-3 py-2 text-sm'

const isHex = (v?: string) => !!v && /^#[0-9a-f]{3,8}$/i.test(v)
type Colors = { accent: string; accent2: string }
const colorsOf = (p: DesignPayload): Colors => ({
  accent: isHex(p.brand.colors[0]) ? p.brand.colors[0] : ACCENT,
  accent2: isHex(p.brand.colors[1]) ? p.brand.colors[1] : NAVY,
})

export function DesignEditor() {
  const elRef = useRef<HTMLCanvasElement | null>(null)
  const fabRef = useRef<any>(null)
  const canvasRef = useRef<any>(null)
  const payloadRef = useRef<DesignPayload | null>(null)

  const [ready, setReady] = useState(false)
  const [brief, setBrief] = useState('')
  const [busy, setBusy] = useState(false)
  const [regen, setRegen] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [hasDesign, setHasDesign] = useState(false)
  const [template, setTemplate] = useState<TemplateKey>('hero')
  const [sel, setSel] = useState<{ kind: 'text' | 'other' | null; fontSize?: number; opacity?: number }>({ kind: null })

  const [caption, setCaption] = useState('')
  const [hashtags, setHashtags] = useState('')
  const [when, setWhen] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState<string | null>(null)

  // AI Poster mode (full gpt-image-1 poster)
  const [mode, setMode] = useState<'poster' | 'template'>('poster')
  const [shape, setShape] = useState<'portrait' | 'square' | 'landscape'>('portrait')
  const [posterBusy, setPosterBusy] = useState(false)
  const [refName, setRefName] = useState('')
  const posterPromptRef = useRef<string>('')
  const posterBgRef = useRef<any>(null)
  const refUrlRef = useRef<string>('')

  useEffect(() => {
    let cancelled = false
    let canvas: any = null
    ;(async () => {
      const fabric = await import('fabric')
      if (cancelled || !elRef.current) return
      const style = document.createElement('style')
      style.textContent = `@font-face{font-family:'AntonEd';src:url('/fonts/Anton-Regular.ttf') format('truetype');}@font-face{font-family:'InterEd';src:url('/fonts/Inter-var.ttf') format('truetype');font-weight:100 900;}`
      document.head.appendChild(style)
      try { await Promise.all([(document as any).fonts.load('40px AntonEd'), (document as any).fonts.load('600 18px InterEd')]) } catch { /* ignore */ }
      if (cancelled || !elRef.current) return
      canvas = new fabric.Canvas(elRef.current, { width: W, height: H, backgroundColor: '#ffffff', preserveObjectStacking: true })
      fabRef.current = fabric; canvasRef.current = canvas
      const onSel = () => {
        const o: any = canvas.getActiveObject()
        if (!o) return setSel({ kind: null })
        const isText = String(o.type).includes('text')
        setSel({ kind: isText ? 'text' : 'other', fontSize: isText ? Math.round(o.fontSize) : undefined, opacity: o.opacity ?? 1 })
      }
      canvas.on('selection:created', onSel)
      canvas.on('selection:updated', onSel)
      canvas.on('selection:cleared', () => setSel({ kind: null }))
      canvas.on('object:modified', () => snapshot())
      canvas.on('object:added', () => snapshot())
      canvas.on('object:removed', () => snapshot())
      setReady(true)
    })()
    return () => {
      cancelled = true
      if (canvas) { canvasRef.current = null; try { canvas.dispose() } catch { /* ignore */ } }
    }
  }, [])

  /** The canvas is only usable while its 2D context exists (not disposed). */
  const liveCanvas = () => {
    const c = canvasRef.current
    return c && (c as any).contextContainer ? c : null
  }

  async function render(tpl: TemplateKey) {
    const fabric = fabRef.current, canvas = liveCanvas(), p = payloadRef.current
    if (!fabric || !canvas || !p) return
    suspendRef.current = true
    try {
      canvas.setDimensions({ width: W, height: H })
      canvas.clear(); canvas.backgroundColor = '#ffffff'
      const c = colorsOf(p)
      if (tpl === 'hero') await buildHero(fabric, canvas, p, c)
      else if (tpl === 'bullets') await buildBullets(fabric, canvas, p, c)
      else if (tpl === 'split') await buildSplit(fabric, canvas, p, c)
      else if (tpl === 'cards') await buildCards(fabric, canvas, p, c)
      else await buildReceipt(fabric, canvas, p, c)
      if (liveCanvas()) canvas.renderAll()
    } catch (e) { console.warn('design render skipped', e) } finally { suspendRef.current = false }
    snapshot()
  }

  const historyRef = useRef<string[]>([])
  const suspendRef = useRef(false)
  function snapshot() {
    const c = liveCanvas(); if (!c || suspendRef.current) return
    try { historyRef.current.push(JSON.stringify(c.toJSON())); if (historyRef.current.length > 40) historyRef.current.shift() } catch { /* ignore */ }
  }
  async function undo() {
    const c = liveCanvas(); if (!c || historyRef.current.length < 2) return
    historyRef.current.pop()
    const prev = historyRef.current[historyRef.current.length - 1]
    suspendRef.current = true
    try { await c.loadFromJSON(JSON.parse(prev)); c.renderAll() } catch { /* ignore */ } finally { suspendRef.current = false }
    setSel({ kind: null })
  }
  async function duplicate() {
    const c = liveCanvas(), o = c?.getActiveObject(); if (!c || !o) return
    try { const cl = await o.clone(); cl.set({ left: (o.left ?? 0) + 18, top: (o.top ?? 0) + 18 }); c.add(cl); c.setActiveObject(cl); c.renderAll() } catch { /* ignore */ }
  }
  const layer = (dir: 'front' | 'back') => { const c = liveCanvas(), o = c?.getActiveObject(); if (!c || !o) return; dir === 'front' ? c.bringObjectToFront(o) : c.sendObjectToBack(o); c.renderAll() }
  const alignX = (mode: 'l' | 'c' | 'r') => apply((o) => { const w = o.getScaledWidth?.() ?? o.width ?? 0; o.set('left', mode === 'l' ? 24 : mode === 'c' ? (W - w) / 2 : W - w - 24) })
  const setOpacity = (v: number) => { apply((o) => o.set('opacity', v)); setSel((s) => ({ ...s, opacity: v })) }

  async function generate(text?: string) {
    const b = (text ?? brief).trim()
    if (!b || busy || !ready) return
    setBusy(true); setErr(null); setSaved(null)
    const res = await generateDesignAction(b)
    setBusy(false)
    if (res.error || !res.payload) { setErr(res.error ?? 'Failed'); return }
    const pay = res.payload
    payloadRef.current = pay
    setCaption(`${pay.design.headline}\n\n${pay.design.subtext}`)
    setHashtags((pay.design.hashtags ?? []).map((h) => `#${h}`).join(' '))
    historyRef.current = []
    // AI Art Director picks the best layout for this content.
    const picked = (TEMPLATES.find((t) => t.key === pay.design.layout)?.key ?? 'hero') as TemplateKey
    setTemplate(picked)
    await render(picked)
    setHasDesign(true)
  }

  async function switchTemplate(tpl: TemplateKey) {
    setTemplate(tpl); setSel({ kind: null })
    await render(tpl)
  }

  // Load the AI poster into the canvas as a background + auto-overlay the brand logo.
  async function loadPosterIntoCanvas(url: string, logo: string) {
    const fabric = fabRef.current, canvas = liveCanvas(); if (!fabric || !canvas) return
    const d = POSTER_DIMS[shape] ?? POSTER_DIMS.portrait
    canvas.setDimensions({ width: d.w, height: d.h })
    suspendRef.current = true
    try {
      canvas.clear(); canvas.backgroundColor = '#ffffff'
      const bg = await fabric.FabricImage.fromURL(url, { crossOrigin: 'anonymous' })
      const sc = Math.max(d.w / bg.width, d.h / bg.height)
      bg.set({ left: (d.w - bg.width * sc) / 2, top: (d.h - bg.height * sc) / 2, scaleX: sc, scaleY: sc, selectable: false, evented: false })
      canvas.add(bg); posterBgRef.current = bg
      if (logo) {
        try {
          const lg = await fabric.FabricImage.fromURL(logo, { crossOrigin: 'anonymous' })
          const ls = Math.min(58 / lg.height, 150 / lg.width)
          lg.set({ left: d.w - lg.width * ls - 20, top: 20, scaleX: ls, scaleY: ls })
          canvas.add(lg)
        } catch { /* skip logo */ }
      }
      canvas.renderAll()
    } catch (e) { console.warn('poster load failed', e) } finally { suspendRef.current = false }
    historyRef.current = []; snapshot()
  }

  async function genPoster(text?: string) {
    const b = (text ?? brief).trim()
    if (!b || posterBusy) return
    setPosterBusy(true); setErr(null); setSaved(null)
    const res = await generatePosterAction(b, shape, refUrlRef.current || undefined)
    setPosterBusy(false)
    if (res.error || !res.poster) { setErr(res.error ?? 'Failed'); return }
    posterPromptRef.current = res.poster.imagePrompt
    setCaption(res.poster.caption)
    setHashtags(res.poster.hashtags.map((h) => `#${h}`).join(' '))
    await loadPosterIntoCanvas(res.poster.url, res.poster.logo)
    setHasDesign(true)
  }
  async function regenPoster() {
    if (!posterPromptRef.current || posterBusy) return
    setPosterBusy(true); setErr(null)
    const res = await regeneratePosterAction(posterPromptRef.current, shape)
    setPosterBusy(false)
    if (!res.url) return
    const fabric = fabRef.current, canvas = liveCanvas(); if (!fabric || !canvas) return
    const d = POSTER_DIMS[shape] ?? POSTER_DIMS.portrait
    try {
      if (posterBgRef.current) canvas.remove(posterBgRef.current)
      const bg = await fabric.FabricImage.fromURL(res.url, { crossOrigin: 'anonymous' })
      const sc = Math.max(d.w / bg.width, d.h / bg.height)
      bg.set({ left: (d.w - bg.width * sc) / 2, top: (d.h - bg.height * sc) / 2, scaleX: sc, scaleY: sc, selectable: false, evented: false })
      canvas.add(bg); canvas.sendObjectToBack(bg); posterBgRef.current = bg
      canvas.renderAll()
    } catch { /* skip */ }
  }
  async function handleRef(file: File) {
    setRefName('Uploading…')
    const fd = new FormData(); fd.set('file', file)
    const res = await uploadReferenceAction(fd)
    if (res.url) { refUrlRef.current = res.url; setRefName(file.name) } else { setRefName(''); setErr(res.error ?? 'Upload failed') }
  }

  function apply(fn: (o: any) => void) {
    const c = liveCanvas(); const o = c?.getActiveObject(); if (!c || !o) return
    fn(o); c.renderAll()
    if (String(o.type).includes('text')) setSel((s) => ({ ...s, fontSize: Math.round(o.fontSize) }))
  }
  const addText = () => {
    const fabric = fabRef.current, c = liveCanvas(); if (!fabric || !c) return
    const t = new fabric.Textbox('Your text', { left: 60, top: 120, width: 300, fontFamily: 'InterEd', fontSize: 22, fill: NAVY })
    c.add(t); c.setActiveObject(t); c.renderAll()
  }
  const del = () => { const c = liveCanvas(), o = c?.getActiveObject(); if (c && o) { c.remove(o); c.discardActiveObject(); c.renderAll(); setSel({ kind: null }) } }
  async function uploadImg(file: File) {
    const fabric = fabRef.current, c = liveCanvas(); if (!fabric || !c) return
    const img = await fabric.FabricImage.fromURL(URL.createObjectURL(file), { crossOrigin: 'anonymous' })
    if (!liveCanvas()) return
    const s = Math.min(300 / img.width, 300 / img.height); img.set({ left: 120, top: 320, scaleX: s, scaleY: s })
    c.add(img); c.setActiveObject(img); c.renderAll()
  }
  async function regenHero() {
    const p = payloadRef.current; if (!p || regen || !p.design.heroPrompt) return
    setRegen(true)
    const res = await regenerateHeroAction(p.design.heroPrompt)
    setRegen(false)
    if (!res.url) return
    p.heroUrl = res.url
    await render(template)
  }
  async function save(schedule: boolean) {
    if (saving) return
    if (schedule && !when) { setErr('Pick a date & time to schedule.'); return }
    const c = liveCanvas(); if (!c) { setErr('Generate a design first.'); return }
    setSaving(true); setErr(null)
    c.discardActiveObject(); c.renderAll()
    const dataUrl = c.toDataURL({ format: 'png', multiplier: 1080 / c.getWidth() })
    const res = await saveDesignAction({ dataUrl, caption, hashtags, brief, scheduledAt: schedule ? new Date(when).toISOString() : undefined })
    setSaving(false)
    if (res.error) { setErr(res.error); return }
    setSaved(schedule ? 'Scheduled ✓ — it will auto-publish at the set time.' : 'Saved to Content as a draft ✓')
  }

  return (
    <div className="space-y-4">
      <div className="flex w-fit gap-1 rounded-lg border border-border bg-muted/40 p-1 text-sm">
        <button onClick={() => setMode('poster')} className={`rounded-md px-3 py-1 ${mode === 'poster' ? 'bg-card font-medium shadow-[var(--shadow-sm)]' : 'text-muted-foreground'}`}>AI Poster (full image)</button>
        <button onClick={() => setMode('template')} className={`rounded-md px-3 py-1 ${mode === 'template' ? 'bg-card font-medium shadow-[var(--shadow-sm)]' : 'text-muted-foreground'}`}>Template editor</button>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,560px)_1fr]">
      <div className="space-y-3">
        {mode === 'template' && hasDesign && (
          <div className="flex flex-wrap gap-1.5">
            {TEMPLATES.map((t) => (
              <button key={t.key} onClick={() => switchTemplate(t.key)} className={`rounded-full px-3 py-1 text-xs font-medium ${template === t.key ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'}`}>{t.label}</button>
            ))}
          </div>
        )}
        <div className="overflow-hidden rounded-xl border border-border bg-muted/30 p-3">
          {!hasDesign && (
            <p className="flex min-h-[380px] items-center justify-center px-8 text-center text-sm text-muted-foreground">
              {(posterBusy || busy) ? <span className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> {mode === 'poster' ? 'Painting your poster… (~15–30s)' : 'Designing…'}</span> : 'Enter a topic → Generate. The result appears here — fully editable.'}
            </p>
          )}
          <canvas ref={elRef} className={`mx-auto block w-full max-w-[560px] rounded-md shadow-[var(--shadow-card)] ${hasDesign ? '' : 'hidden'}`} />
        </div>
        {hasDesign && (
          <div className="flex flex-wrap gap-1.5">
            <Button size="sm" variant="outline" onClick={undo} disabled={historyRef.current.length < 2}><Undo2 className="h-4 w-4" /> Undo</Button>
            <Button size="sm" variant="outline" onClick={addText}><Type className="h-4 w-4" /> Text</Button>
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-input bg-card px-3 py-1.5 text-sm hover:bg-muted">
              <Upload className="h-4 w-4" /> Image
              <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && uploadImg(e.target.files[0])} />
            </label>
            {mode === 'template' && <Button size="sm" variant="outline" onClick={regenHero} disabled={regen}>{regen ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageIcon className="h-4 w-4" />} New photo</Button>}
            {mode === 'poster' && <Button size="sm" variant="outline" onClick={regenPoster} disabled={posterBusy}>{posterBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageIcon className="h-4 w-4" />} Regenerate</Button>}
          </div>
        )}
        {sel.kind && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card p-2 text-sm">
            <button onClick={duplicate} className="rounded border px-2 py-1" title="Duplicate"><Copy className="h-3.5 w-3.5" /></button>
            <button onClick={() => layer('front')} className="rounded border px-2 py-1" title="Bring to front"><ArrowUpToLine className="h-3.5 w-3.5" /></button>
            <button onClick={() => layer('back')} className="rounded border px-2 py-1" title="Send to back"><ArrowDownToLine className="h-3.5 w-3.5" /></button>
            <button onClick={() => alignX('l')} className="rounded border px-2 py-1" title="Align left"><AlignLeft className="h-3.5 w-3.5" /></button>
            <button onClick={() => alignX('c')} className="rounded border px-2 py-1" title="Align center"><AlignCenter className="h-3.5 w-3.5" /></button>
            <button onClick={() => alignX('r')} className="rounded border px-2 py-1" title="Align right"><AlignRight className="h-3.5 w-3.5" /></button>
            <span className="mx-1 h-4 w-px bg-border" />
            <span className="text-xs text-muted-foreground">Opacity</span>
            <input type="range" min={20} max={100} value={Math.round((sel.opacity ?? 1) * 100)} onChange={(e) => setOpacity(Number(e.target.value) / 100)} className="w-20" />
            <button onClick={del} className="rounded border px-2 py-1 text-destructive" title="Delete"><Trash2 className="h-3.5 w-3.5" /></button>
          </div>
        )}
        {sel.kind === 'text' && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card p-2 text-sm">
            <button onClick={() => apply((o) => o.set('fontSize', Math.max(8, o.fontSize - 2)))} className="rounded border px-2">A-</button>
            <span className="w-8 text-center text-xs">{sel.fontSize}</span>
            <button onClick={() => apply((o) => o.set('fontSize', o.fontSize + 2))} className="rounded border px-2">A+</button>
            <button onClick={() => apply((o) => o.set('fontWeight', o.fontWeight === '700' ? '400' : '700'))} className="rounded border px-2 font-bold">B</button>
            <button onClick={() => apply((o) => o.set('fontFamily', o.fontFamily === 'AntonEd' ? 'InterEd' : 'AntonEd'))} className="rounded border px-2 text-xs">Font</button>
            <span className="mx-1 h-4 w-px bg-border" />
            {SWATCHES.map((col) => <button key={col} onClick={() => apply((o) => o.set('fill', col))} className="h-5 w-5 rounded-full border border-border" style={{ background: col }} title={col} />)}
          </div>
        )}
      </div>

      <div className="space-y-4">
        <div className="space-y-3 rounded-xl border border-border bg-card p-4">
          <label className="block text-sm font-medium">Topic / idea</label>
          <textarea value={brief} onChange={(e) => setBrief(e.target.value)} rows={mode === 'poster' ? 5 : 2} className={area} placeholder={mode === 'poster' ? 'Describe the post you want (more detail = better), or just a topic…' : 'e.g. Manual work isn’t free — it’s just unbilled'} />
          <div className="flex flex-wrap gap-1.5">
            {EXAMPLES.map((ex) => <button key={ex} onClick={() => setBrief(ex)} className="rounded-full border border-border px-2.5 py-0.5 text-xs text-muted-foreground hover:border-primary/40 hover:text-foreground">{ex}</button>)}
          </div>
          {mode === 'poster' && (
            <>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Size</label>
                <select value={shape} onChange={(e) => setShape(e.target.value as typeof shape)} className={`${area} h-10`}>
                  <option value="portrait">Portrait 4:5 — Instagram post / Story</option>
                  <option value="square">Square 1:1 — Instagram / Facebook / LinkedIn</option>
                  <option value="landscape">Landscape 3:2 — X / LinkedIn / YouTube</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Reference image (optional — AI matches its style)</label>
                <div className="flex items-center gap-2">
                  <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-input bg-card px-3 py-1.5 text-sm hover:bg-muted">
                    <Upload className="h-4 w-4" /> Upload
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && handleRef(e.target.files[0])} />
                  </label>
                  {refName && <span className="truncate text-xs text-muted-foreground">{refName} <button onClick={() => { refUrlRef.current = ''; setRefName('') }} className="ml-1 text-destructive">✕</button></span>}
                </div>
              </div>
            </>
          )}
          <Button onClick={() => (mode === 'poster' ? genPoster() : generate())} disabled={(mode === 'poster' ? posterBusy : busy || !ready) || !brief.trim()} className="w-full">
            {(mode === 'poster' ? posterBusy : busy) ? <><Loader2 className="h-4 w-4 animate-spin" /> {mode === 'poster' ? 'Painting poster…' : 'Designing…'}</> : <><Wand2 className="h-4 w-4" /> {mode === 'poster' ? 'Generate AI poster' : 'Generate design'}</>}
          </Button>
          {!ready && mode === 'template' && <p className="text-xs text-muted-foreground">Loading editor…</p>}
          {mode === 'poster' && <p className="text-xs text-muted-foreground">AI writes a full art-director prompt from your <Link href="/settings/brand" className="underline">Brand Kit</Link> (colors, products, style, footer), then paints the whole poster. Text may vary — regenerate for another take.</p>}
          {mode === 'template' && hasDesign && <p className="text-xs text-muted-foreground">Switch layouts with the tabs above the canvas — same copy, different design.</p>}
          {err && <p className="text-sm text-destructive">{err}</p>}
        </div>

        {hasDesign && (
          <div className="space-y-3 rounded-xl border border-border bg-card p-4">
            <p className="text-sm font-semibold">Caption & schedule</p>
            <textarea value={caption} onChange={(e) => setCaption(e.target.value)} rows={4} className={area} placeholder="Caption…" />
            <textarea value={hashtags} onChange={(e) => setHashtags(e.target.value)} rows={2} className={area} placeholder="#hashtags #here" />
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Date & time (optional — to schedule)</label>
              <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className={`${area} h-10`} />
            </div>
            {saved && <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{saved} <Link href="/content" className="font-medium underline">View content →</Link></p>}
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => save(true)} disabled={saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarClock className="h-4 w-4" />} Save & schedule</Button>
              <Button variant="outline" onClick={() => save(false)} disabled={saving}><Check className="h-4 w-4" /> Save draft</Button>
            </div>
            <p className="text-xs text-muted-foreground">Tip: click any element to move, resize, edit or recolour. Your logo is added automatically from the Brand Kit — drag it, resize it, or duplicate it. Double-click text to type.</p>
          </div>
        )}
      </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Template builders (fabric objects on a 540×675 canvas)
// ─────────────────────────────────────────────────────────────

// lucide-style line icons (inner SVG markup) — rendered in the brand accent.
const ICONS: Record<string, string> = {
  check: '<path d="M20 6 9 17l-5-5"/>',
  droplet: '<path d="M12 2s6 5.5 6 10a6 6 0 0 1-12 0c0-4.5 6-10 6-10z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.4 1.4M17.6 17.6 19 19M19 5l-1.4 1.4M6.4 17.6 5 19"/>',
  star: '<path d="M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9 6.8 19.2l1-5.8L3.5 9.2l5.9-.9z"/>',
  heart: '<path d="M12 20s-7-4.3-9.2-8.5C1.3 8 3.2 4.5 6.5 4.5c2 0 3.5 1.3 5.5 3 2-1.7 3.5-3 5.5-3 3.3 0 5.2 3.5 3.7 7C19 15.7 12 20 12 20z"/>',
  shield: '<path d="M12 2l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V5z"/>',
  sparkles: '<path d="M12 3l1.7 4.3L18 9l-4.3 1.7L12 15l-1.7-4.3L6 9l4.3-1.7z"/><path d="M19 14l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z"/>',
  'trending-up': '<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l4 2"/>',
  zap: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
  leaf: '<path d="M4 20c8 0 16-5 16-15 0 0-13-2-16 7-1.5 4.5 0 8 0 8z"/><path d="M4 20c3-6 7-9 12-11"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/>',
  users: '<circle cx="9" cy="8" r="3.2"/><path d="M3.5 20c0-3.3 3-5.5 5.5-5.5s5.5 2.2 5.5 5.5"/><path d="M16 5.2A3 3 0 0 1 16 11M21 20c0-2.5-1.5-4.3-3.5-5"/>',
  message: '<path d="M20 15a2 2 0 0 1-2 2H8l-4 3V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2z"/>',
  gift: '<path d="M20 12v8H4v-8"/><path d="M2 8h20v4H2z"/><path d="M12 8v12"/><path d="M12 8S11 3 8.5 3 6 6 8.5 8M12 8s1-5 3.5-5S18 6 15.5 8"/>',
  camera: '<rect x="3" y="7" width="18" height="13" rx="2"/><circle cx="12" cy="13.5" r="3.5"/><path d="M8 7l1.5-2.5h5L16 7"/>',
  award: '<circle cx="12" cy="9" r="5"/><path d="M9 13l-1 8 4-2.5 4 2.5-1-8"/>',
  dollar: '<path d="M12 2v20"/><path d="M17 6.5C17 4.5 14.8 4 12 4S7 5 7 7.5 9 11 12 11s5 1 5 3.5S14.5 20 12 20s-5-.5-5-2.5"/>',
  smile: '<circle cx="12" cy="12" r="9"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><path d="M9 9h.01M15 9h.01"/>',
  book: '<path d="M4 4h11a2 2 0 0 1 2 2v14H6a2 2 0 0 1-2-2z"/><path d="M17 4h3v16h-3"/>',
}
async function iconImage(fabric: any, name: string, color: string, size: number) {
  const inner = ICONS[name] || ICONS.sparkles
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`
  return fabric.FabricImage.fromURL('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg))
}
function hexA(hex: string, a: number): string {
  const m = hex.replace('#', ''); const n = m.length === 3 ? m.split('').map((x) => x + x).join('') : m
  const r = parseInt(n.slice(0, 2), 16) || 0, g = parseInt(n.slice(2, 4), 16) || 0, b = parseInt(n.slice(4, 6), 16) || 0
  return `rgba(${r},${g},${b},${a})`
}

function addBadge(fabric: any, canvas: any, text: string, accent: string, left = 24, top = 28) {
  const badge = new fabric.IText((text || 'YOUR BRAND').toUpperCase(), { left: left + 16, top: top + 6, fontFamily: 'InterEd', fontSize: 12, fontWeight: '700', charSpacing: 60, fill: accent })
  const pill = new fabric.Rect({ left, top, width: (badge.width ?? 120) + 32, height: 28, rx: 14, ry: 14, fill: 'rgba(0,0,0,0)', stroke: accent, strokeWidth: 1.5 })
  canvas.add(pill); canvas.add(badge)
}

function addTwoTone(fabric: any, canvas: any, p: DesignPayload, c: Colors, left: number, top: number, width: number, size: number) {
  canvas.add(new fabric.Rect({ left: left - 16, top: top + 4, width: 6, height: size * 2, fill: c.accent, rx: 3, ry: 3 }))
  const full = p.design.headline
  const acc = p.design.headlineAccent && full.includes(p.design.headlineAccent) ? p.design.headlineAccent : ''
  const main = acc ? full.replace(acc, '').trim() : full
  const hm = new fabric.Textbox(main, { left, top, width, fontFamily: 'AntonEd', fontSize: size, lineHeight: 0.98, fill: c.accent2 })
  canvas.add(hm)
  let y = top + hm.getScaledHeight() + 2
  if (acc) {
    const ha = new fabric.Textbox(acc, { left, top: y, width, fontFamily: 'AntonEd', fontSize: size, lineHeight: 0.98, fill: c.accent })
    canvas.add(ha); y += ha.getScaledHeight() + 6
  }
  return y
}

async function addHeroBand(fabric: any, canvas: any, url: string | null, left: number, top: number, w: number, h: number, radius = 0) {
  if (!url) { canvas.add(new fabric.Rect({ left, top, width: w, height: h, fill: '#eef1f5', rx: radius, ry: radius })); return }
  try {
    const img = await fabric.FabricImage.fromURL(url, { crossOrigin: 'anonymous' })
    const s = Math.max(w / img.width, h / img.height)
    img.set({ left: left + (w - img.width * s) / 2, top: top + (h - img.height * s) / 2, scaleX: s, scaleY: s })
    img.clipPath = new fabric.Rect({ left, top, width: w, height: h, rx: radius, ry: radius, absolutePositioned: true })
    canvas.add(img)
  } catch { /* skip */ }
}

function footerText(p: DesignPayload) {
  const parts = [p.brand.website || `www.${(p.brand.name || 'yourbrand').toLowerCase().replace(/\s+/g, '')}.com`]
  if (p.brand.phone) parts.push(p.brand.phone)
  if (p.brand.handle) parts.push(p.brand.handle)
  return parts.join('     |     ')
}
function addFooter(fabric: any, canvas: any, accent: string, p: DesignPayload) {
  canvas.add(new fabric.Rect({ left: 0, top: H - 56, width: W, height: 56, fill: accent }))
  canvas.add(new fabric.IText(footerText(p), { left: 40, top: H - 38, fontFamily: 'InterEd', fontSize: 14, fontWeight: '600', fill: '#ffffff' }))
}

async function addLogo(fabric: any, canvas: any, url: string, right = true) {
  if (!url) return
  try {
    const logo = await fabric.FabricImage.fromURL(url, { crossOrigin: 'anonymous' })
    const s = Math.min(38 / logo.height, 130 / logo.width) // cap height AND width
    logo.set({ left: right ? W - logo.width * s - 28 : 28, top: 30, scaleX: s, scaleY: s })
    canvas.add(logo)
  } catch { /* skip */ }
}

async function buildHero(fabric: any, canvas: any, p: DesignPayload, c: Colors) {
  addBadge(fabric, canvas, p.design.badge, c.accent)
  const y = addTwoTone(fabric, canvas, p, c, 42, 92, 470, 40)
  canvas.add(new fabric.Textbox(p.design.subtext, { left: 44, top: Math.min(y, 250), width: 460, fontFamily: 'InterEd', fontSize: 15, fill: GRAY }))
  await addHeroBand(fabric, canvas, p.heroUrl, 0, 300, W, 315)
  addFooter(fabric, canvas, c.accent, p)
  await addLogo(fabric, canvas, p.brand.logo)
}

async function buildBullets(fabric: any, canvas: any, p: DesignPayload, c: Colors) {
  // hero photo on the right band
  await addHeroBand(fabric, canvas, p.heroUrl, 258, 0, W - 258, H - 56)
  await addLogo(fabric, canvas, p.brand.logo, false)
  const y = addTwoTone(fabric, canvas, p, c, 44, 96, 200, 30)
  const bullets = (p.design.cards.length ? p.design.cards : ['CAPTURE EVERY LEAD', 'RESPOND INSTANTLY', 'SCALE WITHOUT HIRING']).slice(0, 3)
  let by = Math.min(y, 380) + 8
  for (const b of bullets) {
    canvas.add(new fabric.Circle({ left: 44, top: by, radius: 12, fill: c.accent }))
    const chk = await iconImage(fabric, 'check', '#ffffff', 15)
    chk.set({ left: 48.5, top: by + 4.5 })
    canvas.add(chk)
    canvas.add(new fabric.Textbox(b, { left: 76, top: by + 1, width: 170, fontFamily: 'InterEd', fontSize: 15, fontWeight: '600', fill: NAVY }))
    by += 44
  }
  const cta = new fabric.IText(`  ${p.design.cta || 'Book Your Demo Today'}   →  `, { left: 58, top: by + 26, fontFamily: 'InterEd', fontSize: 14, fontWeight: '700', fill: '#ffffff' })
  canvas.add(new fabric.Rect({ left: 44, top: by + 18, width: (cta.width ?? 180) + 24, height: 42, rx: 21, ry: 21, fill: c.accent }))
  canvas.add(cta)
  addFooter(fabric, canvas, c.accent, p)
}

async function buildSplit(fabric: any, canvas: any, p: DesignPayload, c: Colors) {
  addBadge(fabric, canvas, p.design.badge, c.accent)
  const y = addTwoTone(fabric, canvas, p, c, 42, 92, 470, 38)
  canvas.add(new fabric.Textbox(p.design.subtext, { left: 44, top: Math.min(y, 250), width: 470, fontFamily: 'InterEd', fontSize: 14, fill: GRAY }))
  // pill tags from cards
  let px = 42
  const py = Math.min(y, 250) + 46
  for (const card of p.design.cards.slice(0, 3)) {
    const t = new fabric.IText(card, { left: px + 14, top: py + 8, fontFamily: 'InterEd', fontSize: 12, fontWeight: '700', fill: NAVY })
    const w = (t.width ?? 60) + 28
    canvas.add(new fabric.Rect({ left: px, top: py, width: w, height: 30, rx: 15, ry: 15, fill: '#eef1f5' }))
    canvas.add(t); px += w + 10
  }
  // framed hero
  canvas.add(new fabric.Rect({ left: 34, top: 344, width: 472, height: 262, rx: 22, ry: 22, fill: c.accent }))
  await addHeroBand(fabric, canvas, p.heroUrl, 40, 350, 460, 250, 18)
  addFooter(fabric, canvas, c.accent, p)
  await addLogo(fabric, canvas, p.brand.logo)
}

async function buildCards(fabric: any, canvas: any, p: DesignPayload, c: Colors) {
  await addHeroBand(fabric, canvas, p.heroUrl, 0, 0, W, H)
  // gradient white overlay — opaque up top (readable header) fading down
  const ov = new fabric.Rect({ left: 0, top: 0, width: W, height: H })
  ov.set('fill', new fabric.Gradient({
    type: 'linear', coords: { x1: 0, y1: 0, x2: 0, y2: H },
    colorStops: [{ offset: 0, color: 'rgba(255,255,255,0.97)' }, { offset: 0.4, color: 'rgba(255,255,255,0.85)' }, { offset: 1, color: 'rgba(255,255,255,0.72)' }],
  }))
  canvas.add(ov)
  addBadge(fabric, canvas, p.design.badge, c.accent)
  addTwoTone(fabric, canvas, p, c, 42, 92, 470, 34)
  const cards = p.design.cards.length ? p.design.cards : ['ITEM ONE', 'ITEM TWO', 'ITEM THREE', 'ITEM FOUR']
  const icons = p.design.icons ?? []
  const pos = [[28, 300], [280, 300], [28, 452], [280, 452]]
  for (let i = 0; i < cards.length && i < 4; i++) {
    const [cx, cy] = pos[i]
    canvas.add(new fabric.Rect({ left: cx, top: cy, width: 232, height: 138, rx: 18, ry: 18, fill: '#ffffff', stroke: '#eef1f5', strokeWidth: 1, shadow: new fabric.Shadow({ color: 'rgba(22,35,58,0.14)', blur: 18, offsetY: 7 }) }))
    canvas.add(new fabric.Circle({ left: cx + 116 - 25, top: cy + 20, radius: 25, fill: hexA(c.accent, 0.12) }))
    const ic = await iconImage(fabric, icons[i] || 'star', c.accent, 28)
    ic.set({ left: cx + 116 - 14, top: cy + 31 })
    canvas.add(ic)
    canvas.add(new fabric.Textbox(cards[i], { left: cx + 16, top: cy + 82, width: 200, fontFamily: 'InterEd', fontSize: 15, fontWeight: '700', textAlign: 'center', fill: NAVY }))
  }
  addFooter(fabric, canvas, c.accent, p)
  await addLogo(fabric, canvas, p.brand.logo)
}

async function buildReceipt(fabric: any, canvas: any, p: DesignPayload, c: Colors) {
  addBadge(fabric, canvas, p.design.badge, c.accent)
  addTwoTone(fabric, canvas, p, c, 42, 92, 470, 40)
  // statement card
  const cardTop = 250
  canvas.add(new fabric.Rect({ left: 40, top: cardTop, width: 460, height: 290, rx: 20, ry: 20, fill: '#ffffff', stroke: '#eef1f5', strokeWidth: 1, shadow: new fabric.Shadow({ color: 'rgba(22,35,58,0.12)', blur: 22, offsetY: 8 }) }))
  const hp = new fabric.IText(' MONTHLY STATEMENT ', { left: 66, top: cardTop + 26, fontFamily: 'InterEd', fontSize: 11, fontWeight: '700', charSpacing: 40, fill: GRAY, backgroundColor: '#eef1f5' })
  canvas.add(hp)
  canvas.add(new fabric.IText('MANUAL WORK', { left: 300, top: cardTop + 22, fontFamily: 'InterEd', fontSize: 18, fontWeight: '800', fill: NAVY }))
  const rows = (p.design.cards.length ? p.design.cards : ['LEAD DATA ENTRY', 'FOLLOW-UPS', 'WEEKLY REPORTS', 'DATA MOVED']).slice(0, 4)
  rows.forEach((label, i) => {
    const ry = cardTop + 74 + i * 44
    canvas.add(new fabric.Textbox(label, { left: 66, top: ry, width: 300, fontFamily: 'InterEd', fontSize: 15, fill: NAVY }))
    const tag = new fabric.IText(' unbilled ', { left: 400, top: ry - 2, fontFamily: 'InterEd', fontSize: 12, fill: GRAY, backgroundColor: '#eef1f5' })
    canvas.add(tag)
    if (i < rows.length - 1) canvas.add(new fabric.Rect({ left: 66, top: ry + 30, width: 408, height: 1, fill: '#eef1f5' }))
  })
  canvas.add(new fabric.IText('TOTAL', { left: 66, top: cardTop + 250, fontFamily: 'InterEd', fontSize: 17, fontWeight: '800', fill: NAVY }))
  canvas.add(new fabric.IText('YOUR BEST HOURS', { left: 250, top: cardTop + 250, fontFamily: 'InterEd', fontSize: 17, fontWeight: '800', fill: c.accent }))
  // closing line
  canvas.add(new fabric.Textbox(p.design.cta || p.design.subtext, { left: 44, top: 560, width: 452, fontFamily: 'InterEd', fontSize: 15, fontWeight: '600', textAlign: 'center', fill: NAVY }))
  addFooter(fabric, canvas, c.accent, p)
  await addLogo(fabric, canvas, p.brand.logo)
}
