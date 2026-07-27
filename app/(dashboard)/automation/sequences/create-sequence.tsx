'use client'

import { useState } from 'react'
import { useActionState } from 'react'
import { createSequenceAction } from '@/lib/actions/sequences'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export function CreateSequence() {
  const [open, setOpen] = useState(false)
  const [steps, setSteps] = useState([{ delay: 0, message: '' }])
  const [state, formAction, pending] = useActionState<{ error?: string }, FormData>(
    async (_prev, fd) => {
      const res = await createSequenceAction(fd)
      if (!res.error) { setOpen(false); setSteps([{ delay: 0, message: '' }]) }
      return res
    },
    {},
  )

  if (!open) return <Button size="sm" onClick={() => setOpen(true)}>+ New sequence</Button>

  return (
    <form action={formAction} className="space-y-3 rounded-xl border border-border bg-card p-4 shadow-[var(--shadow-card)]">
      <Input name="name" placeholder="Sequence name (e.g. Lead nurture)" required />
      <div className="space-y-2">
        {steps.map((s, i) => (
          <div key={i} className="rounded-lg border border-border p-3">
            <div className="mb-2 flex items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground">Step {i + 1} · send after</span>
              <input name="step_delay" type="number" min={0} defaultValue={s.delay} className="h-8 w-20 rounded-md border border-input bg-background px-2 text-sm" />
              <span className="text-xs text-muted-foreground">hours</span>
              {steps.length > 1 && <button type="button" onClick={() => setSteps((p) => p.filter((_, j) => j !== i))} className="ml-auto text-xs text-destructive">Remove</button>}
            </div>
            <textarea name="step_message" rows={2} placeholder="Message…" className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
          </div>
        ))}
        <button type="button" onClick={() => setSteps((p) => [...p, { delay: 24, message: '' }])} className="text-sm text-primary hover:underline">+ Add step</button>
      </div>
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending}>{pending ? 'Saving…' : 'Save sequence'}</Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
      </div>
    </form>
  )
}
