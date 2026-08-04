'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Wand2, Loader2, Type, Trash2, Upload, CalendarClock, Check, ImageIcon } from 'lucide-react'
import { generateDesignAction, regenerateHeroAction, saveDesignAction, type DesignPayload } from '@/lib/actions/content'
import { Button } from '@/components/ui/button'

/* eslint-disable @typescript-eslint/no-explicit-any */

const W = 540, H = 675, NAVY = '#16233a', ACCENT = '#ea6a24', GRAY = '#5b6472'
const EXAMPLES = ['Manual work isn’t free', '5 skincare tips for glowing skin', 'Why daily sunscreen matters']
const SWATCHES = [NAVY, ACCENT, '#ffffff', GRAY, '#000000', '#10b981']
const TEMPLATES = [
  { key: 'hero', label: 'Hero + photo' },
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
  const [sel, setSel] = useState<{ kind: 'text' | 'other' | null; fontSize?: number }>({ kind: null })

  const [caption, setCaption] = useState('')
  const [hashtags, setHashtags] = useState('')
  const [when, setWhen] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState<string | null>(null)

  useEffect(() => {
    let disposed = false
    ;(async () => {
      const fabric = await import('fabric')
      if (disposed || !elRef.current) return
      const style = document.createElement('style')
      style.textContent = `@font-face{font-family:'AntonEd';src:url('/fonts/Anton-Regular.ttf') format('truetype');}@font-face{font-family:'InterEd';src:url('/fonts/Inter-var.ttf') format('truetype');font-weight:100 900;}`
      document.head.appendChild(style)
      try { await Promise.all([(document as any).fonts.load('40px AntonEd'), (document as any).fonts.load('600 18px InterEd')]) } catch { /* ignore */ }
      const canvas = new fabric.Canvas(elRef.current, { width: W, height: H, backgroundColor: '#ffffff', preserveObjectStacking: true })
      fabRef.current = fabric; canvasRef.current = canvas
      const onSel = () => {
        const o: any = canvas.getActiveObject()
        if (!o) return setSel({ kind: null })
        const isText = String(o.type).includes('text')
        setSel({ kind: isText ? 'text' : 'other', fontSize: isText ? Math.round(o.fontSize) : undefined })
      }
      canvas.on('selection:created', onSel)
      canvas.on('selection:updated', onSel)
      canvas.on('selection:cleared', () => setSel({ kind: null }))
      setReady(true)
    })()
    return () => { disposed = true; canvasRef.current?.dispose?.() }
  }, [])

  async function render(tpl: TemplateKey) {
    const fabric = fabRef.current, canvas = canvasRef.current, p = payloadRef.current
    if (!fabric || !canvas || !p) return
    canvas.clear(); canvas.backgroundColor = '#ffffff'
    const c = colorsOf(p)
    if (tpl === 'hero') await buildHero(fabric, canvas, p, c)
    else if (tpl === 'split') await buildSplit(fabric, canvas, p, c)
    else if (tpl === 'cards') await buildCards(fabric, canvas, p, c)
    else await buildReceipt(fabric, canvas, p, c)
    canvas.renderAll()
  }

  async function generate(text?: string) {
    const b = (text ?? brief).trim()
    if (!b || busy || !ready) return
    setBusy(true); setErr(null); setSaved(null)
    const res = await generateDesignAction(b)
    setBusy(false)
    if (res.error || !res.payload) { setErr(res.error ?? 'Failed'); return }
    payloadRef.current = res.payload
    setCaption(`${res.payload.design.headline}\n\n${res.payload.design.subtext}`)
    await render(template)
    setHasDesign(true)
  }

  async function switchTemplate(tpl: TemplateKey) {
    setTemplate(tpl); setSel({ kind: null })
    await render(tpl)
  }

  function apply(fn: (o: any) => void) {
    const c = canvasRef.current; const o = c?.getActiveObject(); if (!o) return
    fn(o); c.renderAll()
    if (String(o.type).includes('text')) setSel((s) => ({ ...s, fontSize: Math.round(o.fontSize) }))
  }
  const addText = () => {
    const fabric = fabRef.current, c = canvasRef.current; if (!fabric || !c) return
    const t = new fabric.Textbox('Your text', { left: 60, top: 120, width: 300, fontFamily: 'InterEd', fontSize: 22, fill: NAVY })
    c.add(t); c.setActiveObject(t); c.renderAll()
  }
  const del = () => { const c = canvasRef.current, o = c?.getActiveObject(); if (o) { c.remove(o); c.discardActiveObject(); c.renderAll(); setSel({ kind: null }) } }
  async function uploadImg(file: File) {
    const fabric = fabRef.current, c = canvasRef.current; if (!fabric || !c) return
    const img = await fabric.FabricImage.fromURL(URL.createObjectURL(file), { crossOrigin: 'anonymous' })
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
      <div className="space-y-3">
        {hasDesign && (
          <div className="flex flex-wrap gap-1.5">
            {TEMPLATES.map((t) => (
              <button key={t.key} onClick={() => switchTemplate(t.key)} className={`rounded-full px-3 py-1 text-xs font-medium ${template === t.key ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'}`}>{t.label}</button>
            ))}
          </div>
        )}
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
          <textarea value={brief} onChange={(e) => setBrief(e.target.value)} rows={2} className={area} placeholder="e.g. Manual work isn’t free — it’s just unbilled" />
          <div className="flex flex-wrap gap-1.5">
            {EXAMPLES.map((ex) => <button key={ex} onClick={() => setBrief(ex)} className="rounded-full border border-border px-2.5 py-0.5 text-xs text-muted-foreground hover:border-primary/40 hover:text-foreground">{ex}</button>)}
          </div>
          <Button onClick={() => generate()} disabled={busy || !ready || !brief.trim()} className="w-full">
            {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Designing post + visual…</> : <><Wand2 className="h-4 w-4" /> Generate design</>}
          </Button>
          {!ready && <p className="text-xs text-muted-foreground">Loading editor…</p>}
          {hasDesign && <p className="text-xs text-muted-foreground">Switch layouts with the tabs above the canvas — same copy, different design.</p>}
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
            <p className="text-xs text-muted-foreground">Tip: click any element to move, resize, edit or recolour. Double-click text to type.</p>
          </div>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Template builders (fabric objects on a 540×675 canvas)
// ─────────────────────────────────────────────────────────────

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

function addFooter(fabric: any, canvas: any, accent: string, name: string) {
  canvas.add(new fabric.Rect({ left: 0, top: H - 56, width: W, height: 56, fill: accent }))
  canvas.add(new fabric.IText(`www.${(name || 'yourbrand').toLowerCase().replace(/\s+/g, '')}.com    |    +91 00000 00000`, { left: 40, top: H - 38, fontFamily: 'InterEd', fontSize: 14, fontWeight: '600', fill: '#ffffff' }))
}

async function addLogo(fabric: any, canvas: any, url: string, right = true) {
  if (!url) return
  try {
    const logo = await fabric.FabricImage.fromURL(url, { crossOrigin: 'anonymous' })
    const lh = 40, s = lh / logo.height
    logo.set({ left: right ? W - logo.width * s - 28 : 28, top: 30, scaleX: s, scaleY: s })
    canvas.add(logo)
  } catch { /* skip */ }
}

async function buildHero(fabric: any, canvas: any, p: DesignPayload, c: Colors) {
  addBadge(fabric, canvas, p.design.badge, c.accent)
  const y = addTwoTone(fabric, canvas, p, c, 42, 92, 470, 40)
  canvas.add(new fabric.Textbox(p.design.subtext, { left: 44, top: Math.min(y, 250), width: 460, fontFamily: 'InterEd', fontSize: 15, fill: GRAY }))
  await addHeroBand(fabric, canvas, p.heroUrl, 0, 300, W, 315)
  addFooter(fabric, canvas, c.accent, p.brand.name)
  await addLogo(fabric, canvas, p.brand.logo)
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
  addFooter(fabric, canvas, c.accent, p.brand.name)
  await addLogo(fabric, canvas, p.brand.logo)
}

async function buildCards(fabric: any, canvas: any, p: DesignPayload, c: Colors) {
  await addHeroBand(fabric, canvas, p.heroUrl, 0, 0, W, H)
  canvas.add(new fabric.Rect({ left: 0, top: 0, width: W, height: H, fill: 'rgba(255,255,255,0.74)' }))
  addBadge(fabric, canvas, p.design.badge, c.accent)
  addTwoTone(fabric, canvas, p, c, 42, 92, 470, 34)
  const cards = p.design.cards.length ? p.design.cards : ['ITEM ONE', 'ITEM TWO', 'ITEM THREE', 'ITEM FOUR']
  const pos = [[28, 300], [280, 300], [28, 452], [280, 452]]
  cards.slice(0, 4).forEach((label, i) => {
    const [cx, cy] = pos[i]
    canvas.add(new fabric.Rect({ left: cx, top: cy, width: 232, height: 138, rx: 18, ry: 18, fill: '#ffffff', stroke: '#eef1f5', strokeWidth: 1, shadow: new fabric.Shadow({ color: 'rgba(22,35,58,0.12)', blur: 16, offsetY: 6 }) }))
    canvas.add(new fabric.Circle({ left: cx + 116 - 22, top: cy + 18, radius: 22, fill: c.accent2 }))
    canvas.add(new fabric.Circle({ left: cx + 116 - 9, top: cy + 31, radius: 9, fill: c.accent }))
    canvas.add(new fabric.Textbox(label, { left: cx + 16, top: cy + 78, width: 200, fontFamily: 'InterEd', fontSize: 15, fontWeight: '700', textAlign: 'center', fill: NAVY }))
  })
  addFooter(fabric, canvas, c.accent, p.brand.name)
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
  addFooter(fabric, canvas, c.accent, p.brand.name)
  await addLogo(fabric, canvas, p.brand.logo)
}
