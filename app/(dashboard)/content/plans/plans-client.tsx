'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Wand2, Loader2, Trash2, Zap } from 'lucide-react'
import { createPlanAction, togglePlanAction, deletePlanAction, generateNowAction } from '@/lib/actions/plans'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export interface Plan {
  id: string
  name: string
  platforms: string[]
  frequency: string
  days_of_week: number[]
  time_of_day: string
  timezone: string
  themes: string | null
  mode: string
  is_active: boolean
  next_run_at: string | null
}

const PLATFORMS = [['instagram', 'Instagram'], ['facebook', 'Facebook'], ['linkedin', 'LinkedIn'], ['twitter', 'X / Twitter']]
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const ZONES = ['Asia/Kolkata', 'Asia/Dubai', 'Asia/Singapore', 'Europe/London', 'America/New_York', 'America/Los_Angeles', 'Australia/Sydney']
const area = 'w-full rounded-md border border-input bg-background px-3 py-2 text-sm'

export function PlansManager({ plans }: { plans: Plan[] }) {
  const [open, setOpen] = useState(plans.length === 0)
  return (
    <div className="space-y-4">
      {plans.length > 0 && (
        <div className="space-y-3">
          {plans.map((p) => <PlanRow key={p.id} plan={p} />)}
        </div>
      )}

      {open ? (
        <NewPlanForm onDone={() => setOpen(false)} />
      ) : (
        <Button variant="outline" onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> New content plan</Button>
      )}
    </div>
  )
}

function NewPlanForm({ onDone }: { onDone: () => void }) {
  const router = useRouter()
  const [freq, setFreq] = useState('daily')
  const [mode, setMode] = useState('manual')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const tzGuess = typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : 'Asia/Kolkata'
  const zones = ZONES.includes(tzGuess) ? ZONES : [tzGuess, ...ZONES]

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (busy) return
    setBusy(true); setErr(null)
    const res = await createPlanAction(new FormData(e.currentTarget))
    setBusy(false)
    if (res.error) { setErr(res.error); return }
    router.refresh()
    onDone()
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-xl border border-border bg-card p-5">
      <div className="space-y-2">
        <Label htmlFor="name">Plan name</Label>
        <Input id="name" name="name" placeholder="Daily Instagram education" />
      </div>

      <div>
        <p className="mb-1.5 text-sm font-medium">Platforms</p>
        <div className="flex flex-wrap gap-2">
          {PLATFORMS.map(([k, label]) => (
            <label key={k} className="flex cursor-pointer items-center gap-1.5 rounded-full border border-border px-3 py-1 text-xs has-[:checked]:border-primary has-[:checked]:bg-primary/10 has-[:checked]:text-primary">
              <input type="checkbox" name="platforms" value={k} defaultChecked={k === 'instagram'} className="hidden" />
              {label}
            </label>
          ))}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="frequency">Frequency</Label>
          <select id="frequency" name="frequency" value={freq} onChange={(e) => setFreq(e.target.value)} className={`${area} h-10`}>
            <option value="daily">Every day</option>
            <option value="weekly">Specific weekdays</option>
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="time_of_day">Time</Label>
          <input id="time_of_day" name="time_of_day" type="time" defaultValue="09:00" className={`${area} h-10`} />
        </div>
      </div>

      {freq === 'weekly' && (
        <div>
          <p className="mb-1.5 text-sm font-medium">On these days</p>
          <div className="flex flex-wrap gap-1.5">
            {DAYS.map((d, i) => (
              <label key={d} className="flex cursor-pointer items-center gap-1 rounded-md border border-border px-2.5 py-1 text-xs has-[:checked]:border-primary has-[:checked]:bg-primary/10 has-[:checked]:text-primary">
                <input type="checkbox" name="days_of_week" value={i} defaultChecked={i >= 1 && i <= 5} className="hidden" />
                {d}
              </label>
            ))}
          </div>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="timezone">Timezone</Label>
          <select id="timezone" name="timezone" defaultValue={zones[0]} className={`${area} h-10`}>
            {zones.map((z) => <option key={z} value={z}>{z}</option>)}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="mode">Mode</Label>
          <select id="mode" name="mode" value={mode} onChange={(e) => setMode(e.target.value)} className={`${area} h-10`}>
            <option value="manual">Manual — review before publish</option>
            <option value="autopilot">Auto-Pilot — publish without review</option>
          </select>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="themes">Content themes / instructions</Label>
        <textarea id="themes" name="themes" rows={2} className={area} placeholder="Skincare tips, ingredient education, sunscreen habits. Mix educational + promotional." />
      </div>

      {mode === 'autopilot' && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
          ⚡ Auto-Pilot publishes AI posts automatically at the scheduled time, without approval. Make sure your brand profile is complete.
        </p>
      )}
      {err && <p className="text-sm text-destructive">{err}</p>}

      <div className="flex gap-2">
        <Button type="submit" disabled={busy}>{busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Creating…</> : <><Wand2 className="h-4 w-4" /> Create plan</>}</Button>
        <Button type="button" variant="ghost" onClick={onDone}>Cancel</Button>
      </div>
    </form>
  )
}

function PlanRow({ plan }: { plan: Plan }) {
  const router = useRouter()
  const [busy, setBusy] = useState<'' | 'gen' | 'toggle' | 'del'>('')
  const [msg, setMsg] = useState<string | null>(null)

  const schedule = plan.frequency === 'weekly' && plan.days_of_week.length
    ? plan.days_of_week.map((d) => DAYS[d]).join(', ')
    : 'Every day'

  async function generate() {
    if (busy) return
    setBusy('gen'); setMsg(null)
    const res = await generateNowAction(plan.id)
    setBusy('')
    setMsg(res.error ?? `Generated: “${res.brief}” — check ${plan.mode === 'autopilot' ? 'Content' : 'approval queue'}.`)
    router.refresh()
  }
  async function toggle() {
    setBusy('toggle')
    const fd = new FormData(); fd.set('id', plan.id); fd.set('is_active', String(!plan.is_active))
    await togglePlanAction(fd)
    setBusy(''); router.refresh()
  }
  async function del() {
    if (!window.confirm('Delete this plan?')) return
    setBusy('del')
    const fd = new FormData(); fd.set('id', plan.id)
    await deletePlanAction(fd)
    setBusy(''); router.refresh()
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-medium">{plan.name}</p>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${plan.mode === 'autopilot' ? 'bg-amber-500/15 text-amber-600' : 'bg-muted text-muted-foreground'}`}>
              {plan.mode === 'autopilot' ? 'Auto-Pilot' : 'Manual'}
            </span>
            {!plan.is_active && <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">Paused</span>}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {plan.platforms.join(', ')} · {schedule} at {plan.time_of_day} ({plan.timezone})
            {plan.next_run_at && plan.is_active && <> · next {new Date(plan.next_run_at).toLocaleString()}</>}
          </p>
          {plan.themes && <p className="mt-1 line-clamp-1 text-xs text-muted-foreground/80">{plan.themes}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <Button size="sm" variant="outline" onClick={generate} disabled={!!busy}>
            {busy === 'gen' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />} Generate now
          </Button>
          <Button size="sm" variant="ghost" onClick={toggle} disabled={!!busy}>{plan.is_active ? 'Pause' : 'Resume'}</Button>
          <Button size="sm" variant="ghost" onClick={del} disabled={!!busy} className="text-destructive"><Trash2 className="h-4 w-4" /></Button>
        </div>
      </div>
      {msg && <p className="mt-2 rounded-md bg-muted/50 px-3 py-1.5 text-xs text-muted-foreground">{msg}</p>}
    </div>
  )
}
