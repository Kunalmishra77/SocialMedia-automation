'use client'

import { useState } from 'react'
import { MessageSquare, Tag, Clock, Zap, Plus, Trash2, Play, Pause, Save } from 'lucide-react'
import type { FlowStep } from '@/lib/actions/flow-builder'
import { saveFlowAction, setFlowActiveAction } from '@/lib/actions/flow-builder'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

const STEP_META: Record<FlowStep['type'], { label: string; icon: typeof MessageSquare; color: string }> = {
  send_message: { label: 'Send message', icon: MessageSquare, color: 'text-rose-600 bg-rose-500/10' },
  add_tag: { label: 'Add tag', icon: Tag, color: 'text-amber-600 bg-amber-500/10' },
  assign: { label: 'Assign to agent', icon: Zap, color: 'text-blue-600 bg-blue-500/10' },
  wait: { label: 'Wait', icon: Clock, color: 'text-zinc-600 bg-zinc-500/10' },
}

function uid() { return Math.random().toString(36).slice(2, 9) }

export function FlowEditor({
  id, initialName, initialTrigger, initialKeyword, initialSteps, initialActive,
}: {
  id: string; initialName: string; initialTrigger: string; initialKeyword: string
  initialSteps: FlowStep[]; initialActive: boolean
}) {
  const [name, setName] = useState(initialName)
  const [trigger, setTrigger] = useState(initialTrigger)
  const [keyword, setKeyword] = useState(initialKeyword)
  const [steps, setSteps] = useState<FlowStep[]>(initialSteps)
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)

  function addStep(type: FlowStep['type']) {
    setSteps((s) => [...s, { id: uid(), type, message: '', tag: '', hours: 24 }])
  }
  function update(i: number, patch: Partial<FlowStep>) {
    setSteps((s) => s.map((st, j) => (j === i ? { ...st, ...patch } : st)))
  }
  function remove(i: number) { setSteps((s) => s.filter((_, j) => j !== i)) }

  async function save() {
    setBusy(true)
    const fd = new FormData()
    fd.set('id', id); fd.set('name', name); fd.set('trigger', trigger); fd.set('keyword', keyword)
    fd.set('steps', JSON.stringify(steps))
    await saveFlowAction(fd)
    setSaved(true); setBusy(false)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Input value={name} onChange={(e) => setName(e.target.value)} className="max-w-xs text-lg font-semibold" />
        <div className="flex items-center gap-2">
          <form action={setFlowActiveAction}>
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="is_active" value={initialActive ? 'false' : 'true'} />
            <button className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium ${initialActive ? 'bg-muted text-foreground' : 'bg-emerald-600 text-white hover:bg-emerald-500'}`}>
              {initialActive ? <><Pause className="h-4 w-4" /> Pause</> : <><Play className="h-4 w-4" /> Activate</>}
            </button>
          </form>
          <Button onClick={save} disabled={busy}>{busy ? 'Saving…' : saved ? 'Saved ✓' : <><Save className="h-4 w-4" /> Save</>}</Button>
        </div>
      </div>

      {/* Trigger */}
      <div className="rounded-xl border-2 border-primary/30 bg-primary/5 p-4">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-primary">When (trigger)</p>
        <div className="flex flex-wrap gap-2">
          <select value={trigger} onChange={(e) => setTrigger(e.target.value)} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
            <option value="first_dm">First DM from a contact</option>
            <option value="dm_received">Any DM received</option>
            <option value="comment_received">Comment received</option>
            <option value="story_mention">Story mention</option>
          </select>
          <Input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="Keyword (optional)" className="max-w-xs" />
        </div>
      </div>

      {/* Steps (visual chain) */}
      <div className="space-y-0">
        {steps.map((step, i) => {
          const meta = STEP_META[step.type]
          const Icon = meta.icon
          return (
            <div key={step.id}>
              <div className="mx-auto h-5 w-0.5 bg-border" />
              <div className="rounded-xl border border-border bg-card p-4 shadow-[var(--shadow-card)]">
                <div className="mb-2 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${meta.color}`}><Icon className="h-4 w-4" /></span>
                    <span className="text-sm font-medium">{meta.label}</span>
                  </div>
                  <button onClick={() => remove(i)} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
                </div>
                {step.type === 'send_message' && (
                  <textarea value={step.message ?? ''} onChange={(e) => update(i, { message: e.target.value })} rows={2} placeholder="Message to send…" className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
                )}
                {step.type === 'add_tag' && (
                  <Input value={step.tag ?? ''} onChange={(e) => update(i, { tag: e.target.value })} placeholder="Tag name" />
                )}
                {step.type === 'wait' && (
                  <div className="flex items-center gap-2 text-sm"><Input type="number" value={step.hours ?? 24} onChange={(e) => update(i, { hours: Number(e.target.value) })} className="w-24" /> hours</div>
                )}
                {step.type === 'assign' && <p className="text-xs text-muted-foreground">Assigns the conversation to an available agent (round-robin).</p>}
              </div>
            </div>
          )
        })}

        {/* Add step */}
        <div className="mx-auto h-5 w-0.5 bg-border" />
        <div className="rounded-xl border border-dashed border-border p-3">
          <p className="mb-2 text-center text-xs text-muted-foreground">Add a step</p>
          <div className="flex flex-wrap justify-center gap-2">
            {(Object.keys(STEP_META) as FlowStep['type'][]).map((t) => {
              const m = STEP_META[t]
              const Icon = m.icon
              return (
                <button key={t} onClick={() => addStep(t)} className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm hover:border-primary/40 hover:bg-muted">
                  <Icon className="h-4 w-4" /> {m.label}
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
