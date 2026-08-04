'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Wand2, Loader2, RefreshCw, Type, Trash2, Upload, CalendarClock, Check, ImageIcon } from 'lucide-react'
import { generateDesignAction, regenerateHeroAction, saveDesignAction, type DesignPayload } from '@/lib/actions/content'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

// Work in a 540×675 (4:5) space; export at 2× → 1080×1350.
const W = 540, H = 675, NAVY = '#16233a', DEFAULT_ACCENT = '#ea6a24', GRAY = '#5b6472'
const EXAMPLES = ['Manual work isn’t free', '5 skincare tips for glowing skin', 'Why daily sunscreen matters']
const SWATCHES = [NAVY, DEFAULT_ACCENT, '#ffffff', GRAY, '#000000', '#10b981']
const area = 'w-full rounded-md border border-input bg-background px-3 py-2 text-sm'

/* eslint-disable @typescript-eslint/no-explicit-any */
export function DesignEditor() {
  const elRef = useRef<HTMLCanvasElement | null>(null)
  const fabRef = useRef<any>(null)         // fabric module
  const canvasRef = useRef<any>(null)      // fabric.Canvas
  const heroPromptRef = useRef<string>('')

  const [ready, setReady] = useState(false)
  const [brief, setBrief] = useState('')
  const [busy, setBusy] = useState(false)
  const [regen, setRegen] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [hasDesign, setHasDesign] = useState(false)
  const [sel, setSel] = useState<{ kind: 'text' | 'other' | null; fontSize?: number }>({ kind: null })

  const [caption, setCaption] = useState('')
  const [hashtags, setHashtags] = useState('')
  const [when, setWhen] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState<string | null>(null)

  // Init fabric + fonts once (client only).
  useEffect(() => {
    let disposed = false
    ;(async () => {
      const fabric = await import('fabric')
      if (disposed || !elRef.current) return
      // Load the editor fonts.
      const style = document.createElement('style')
      style.textContent = `@font-face{font-family:'AntonEd';src:url('/fonts/Anton-Regular.ttf') format('truetype');}@font-face{font-family:'InterEd';src:url('/fonts/Inter-var.ttf') format('truetype');font-weight:100 900;}`
      document.head.appendChild(style)
      try { await Promise.all([(document as any).fonts.load('40px AntonEd'), (document as any).fonts.load('600 18px InterEd')]) } catch { /* ignore */ }

      const canvas = new fabric.Canvas(elRef.current, { width: W, height: H, backgroundColor: '#ffffff', preserveObjectStacking: true })
      fabRef.current = fabric
      canvasRef.current = canvas
      const onSel = () => {
        const o: any = canvas.getActiveObject()
        if (!o) return setSel({ kind: null })
        const isText = o.type === 'textbox' || o.type === 'i-text' || o.type === 'text'
        setSel({ kind: isText ? 'text' : 'other', fontSize: isText ? Math.round(o.fontSize) : undefined })
      }
      canvas.on('selection:created', onSel)
      canvas.on('selection:updated', onSel)
      canvas.on('selection:cleared', () => setSel({ kind: null }))
      setReady(true)
    })()
    return () => { disposed = true; canvasRef.current?.dispose?.() }
  }, [])

  async function generate(text?: string) {
    const b = (text ?? brief).trim()
    if (!b || busy || !ready) return
    setBusy(true); setErr(null); setSaved(null)
    const res = await generateDesignAction(b)
    setBusy(false)
    if (res.error || !res.payload) { setErr(res.error ?? 'Failed'); return }
    heroPromptRef.current = res.payload.design.heroPrompt
    setCaption(`${res.payload.design.headline}\n\n${res.payload.design.subtext}`)
    await buildTemplate(res.payload)
    setHasDesign(true)
  }

  async function buildTemplate(p: DesignPayload) {
    const fabric = fabRef.current, canvas = canvasRef.current
    if (!fabric || !canvas) return
    const accent = (p.brand.colors[0] && /^#[0-9a-f]{3,8}$/i.test(p.brand.colors[0])) ? p.brand.colors[0] : DEFAULT_ACCENT
    const accent2 = p.brand.colors[1] && /^#[0-9a-f]{3,8}$/i.test(p.brand.colors[1]) ? p.brand.colors[1] : NAVY
    canvas.clear(); canvas.backgroundColor = '#ffffff'

    // vertical accent bar + badge pill
    canvas.add(new fabric.Rect({ left: 24, top: 92, width: 6, height: 92, fill: accent, rx: 3, ry: 3 }))
    const badge = new fabric.IText(p.design.badge || 'YOUR BRAND', { left: 40, top: 36, fontFamily: 'InterEd', fontSize: 12, fontWeight: '700', charSpacing: 60, fill: accent })
    const pill = new fabric.Rect({ left: 24, top: 28, width: (badge.width ?? 120) + 32, height: 28, rx: 14, ry: 14, fill: 'rgba(0,0,0,0)', stroke: accent, strokeWidth: 1.5 })
    badge.set({ top: 34 })
    canvas.add(pill); canvas.add(badge)

    // two-tone headline (main navy, accent orange, stacked)
    const full = p.design.headline
    const acc = p.design.headlineAccent && full.includes(p.design.headlineAccent) ? p.design.headlineAccent : ''
    const main = acc ? full.replace(acc, '').trim() : full
    const headMain = new fabric.Textbox(main, { left: 42, top: 92, width: 470, fontFamily: 'AntonEd', fontSize: 40, lineHeight: 0.98, fill: accent2 })
    canvas.add(headMain)
    let cursorY = 92 + headMain.getScaledHeight() + 2
    if (acc) {
      const headAcc = new fabric.Textbox(acc, { left: 42, top: cursorY, width: 470, fontFamily: 'AntonEd', fontSize: 40, lineHeight: 0.98, fill: accent })
      canvas.add(headAcc)
      cursorY += headAcc.getScaledHeight() + 8
    }
    const sub = new fabric.Textbox(p.design.subtext, { left: 44, top: Math.min(cursorY, 250), width: 460, fontFamily: 'InterEd', fontSize: 15, fill: GRAY })
    canvas.add(sub)

    // hero image band (300 → 615)
    const bandTop = 300, bandH = 315
    if (p.heroUrl) {
      try {
        const img = await fabric.FabricImage.fromURL(p.heroUrl, { crossOrigin: 'anonymous' })
        const scale = Math.max(W / img.width, bandH / img.height)
        img.set({ left: (W - img.width * scale) / 2, top: bandTop + (bandH - img.height * scale) / 2, scaleX: scale, scaleY: scale })
        img.clipPath = new fabric.Rect({ left: 0, top: bandTop, width: W, height: bandH, absolutePositioned: true })
        canvas.add(img)
      } catch { /* skip */ }
    } else {
      canvas.add(new fabric.Rect({ left: 0, top: bandTop, width: W, height: bandH, fill: '#eef1f5' }))
    }

    // footer bar
    canvas.add(new fabric.Rect({ left: 0, top: H - 56, width: W, height: 56, fill: accent }))
    canvas.add(new fabric.IText(`www.${(p.brand.name || 'yourbrand').toLowerCase().replace(/\s+/g, '')}.com    |    +91 00000 00000`, { left: 40, top: H - 38, fontFamily: 'InterEd', fontSize: 14, fontWeight: '600', fill: '#ffffff' }))

    // logo top-right
    if (p.brand.logo) {
      try {
        const logo = await fabric.FabricImage.fromURL(p.brand.logo, { crossOrigin: 'anonymous' })
        const lh = 40, ls = lh / logo.height
        logo.set({ left: W - logo.width * ls - 28, top: 30, scaleX: ls, scaleY: ls })
        canvas.add(logo)
      } catch { /* skip */ }
    }
    canvas.renderAll()
  }

  function apply(fn: (o: any) => void) {
    const c = canvasRef.current; const o = c?.getActiveObject(); if (!o) return
    fn(o); c.renderAll()
    if (o.type?.includes('text')) setSel((s) => ({ ...s, fontSize: Math.round(o.fontSize) }))
  }
  const addText = () => {
    const fabric = fabRef.current, c = canvasRef.current; if (!fabric || !c) return
    const t = new fabric.Textbox('Your text', { left: 60, top: 120, width: 300, fontFamily: 'InterEd', fontSize: 22, fill: NAVY })
    c.add(t); c.setActiveObject(t); c.renderAll()
  }
  const del = () => { const c = canvasRef.current, o = c?.getActiveObject(); if (o) { c.remove(o); c.discardActiveObject(); c.renderAll(); setSel({ kind: null }) } }
  async function uploadImg(file: File) {
    const fabric = fabRef.current, c = canvasRef.current; if (!fabric || !c) return
    const url = URL.createObjectURL(file)
    const img = await fabric.FabricImage.fromURL(url, { crossOrigin: 'anonymous' })
    const s = Math.min(300 / img.width, 300 / img.height); img.set({ left: 120, top: 320, scaleX: s, scaleY: s })
    c.add(img); c.setActiveObject(img); c.renderAll()
  }
  async function regenHero() {
    const c = canvasRef.current; if (!c || regen || !heroPromptRef.current) return
    setRegen(true)
    const res = await regenerateHeroAction(heroPromptRef.current)
    setRegen(false)
    if (!res.url) return
    const fabric = fabRef.current
    const bandTop = 300, bandH = 315
    const img = await fabric.FabricImage.fromURL(res.url, { crossOrigin: 'anonymous' })
    const scale = Math.max(W / img.width, bandH / img.height)
    img.set({ left: (W - img.width * scale) / 2, top: bandTop + (bandH - img.height * scale) / 2, scaleX: scale, scaleY: scale })
    img.clipPath = new fabric.Rect({ left: 0, top: bandTop, width: W, height: bandH, absolutePositioned: true })
    c.add(img); c.renderAll()
  }

  async function save(schedule: boolean) {
    const c = canvasRef.current; if (!c || saving) return
    if (schedule && !when) { setErr('Pick a date & time to schedule.'); return }
    setSaving(true); setErr(null)
    c.discardActiveObject(); c.renderAll()
    const dataUrl = c.toDataURL({ format: 'png', multiplier: 2 })
    const res = await saveDesignAction({ dataUrl, caption, hashtags, brief, scheduledAt: schedule ? new Date(when).toISOString() : undefined })
    setSaving(false)
    if (res.error) { setErr(res.error); return }
    setSaved(schedule ? 'Scheduled ✓ — it will auto-publish at the set time.' : 'Saved to Content as a draft ✓')
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,560px)_1fr]">
      {/* Canvas */}
      <div className="space-y-3">
        <div className="overflow-hidden rounded-xl border border-border bg-muted/30 p-3">
          <canvas ref={elRef} className="mx-auto block w-full max-w-[540px] rounded-md shadow-[var(--shadow-card)]" />
        </div>
        {hasDesign && (
          <div className="flex flex-wrap gap-1.5">
            <Button size="sm" variant="outline" onClick={addText}><Type className="h-4 w-4" /> Text</Button>
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-input bg-card px-3 py-1.5 text-sm hover:bg-muted">
              <Upload className="h-4 w-4" /> Image
              <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && uploadImg(e.target.files[0])} />
            </label>
            <Button size="sm" variant="outline" onClick={regenHero} disabled={regen}>{regen ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageIcon className="h-4 w-4" />} New photo</Button>
            {sel.kind && <Button size="sm" variant="ghost" className="text-destructive" onClick={del}><Trash2 className="h-4 w-4" /></Button>}
          </div>
        )}
        {/* selected-object controls */}
        {sel.kind === 'text' && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card p-2 text-sm">
            <button onClick={() => apply((o) => o.set('fontSize', Math.max(8, o.fontSize - 2)))} className="rounded border px-2">A-</button>
            <span className="w-8 text-center text-xs">{sel.fontSize}</span>
            <button onClick={() => apply((o) => o.set('fontSize', o.fontSize + 2))} className="rounded border px-2">A+</button>
            <button onClick={() => apply((o) => o.set('fontWeight', o.fontWeight === '700' ? '400' : '700'))} className="rounded border px-2 font-bold">B</button>
            <button onClick={() => apply((o) => o.set('fontFamily', o.fontFamily === 'AntonEd' ? 'InterEd' : 'AntonEd'))} className="rounded border px-2 text-xs">Font</button>
            <span className="mx-1 h-4 w-px bg-border" />
            {SWATCHES.map((c) => (
              <button key={c} onClick={() => apply((o) => o.set('fill', c))} className="h-5 w-5 rounded-full border border-border" style={{ background: c }} title={c} />
            ))}
          </div>
        )}
      </div>

      {/* Right panel */}
      <div className="space-y-4">
        <div className="space-y-3 rounded-xl border border-border bg-card p-4">
          <label className="block text-sm font-medium">Topic / idea</label>
          <textarea value={brief} onChange={(e) => setBrief(e.target.value)} rows={2} className={area} placeholder="e.g. Manual work isn’t free — it’s just unbilled" />
          <div className="flex flex-wrap gap-1.5">
            {EXAMPLES.map((ex) => <button key={ex} onClick={() => setBrief(ex)} className="rounded-full border border-border px-2.5 py-0.5 text-xs text-muted-foreground hover:border-primary/40 hover:text-foreground">{ex}</button>)}
          </div>
          <Button onClick={() => generate()} disabled={busy || !ready || !brief.trim()} className="w-full">
            {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Designing post + visual…</> : <><Wand2 className="h-4 w-4" /> Generate design</>}
          </Button>
          {!ready && <p className="text-xs text-muted-foreground">Loading editor…</p>}
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
            <p className="text-xs text-muted-foreground">Tip: click any text or the photo to move, resize, edit or recolor it. Double-click text to type.</p>
          </div>
        )}
      </div>
    </div>
  )
}
