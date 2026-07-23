'use client'

import { useState } from 'react'
import { useActionState } from 'react'
import { createLeadAction } from '@/lib/actions/crm'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export function AddLead() {
  const [open, setOpen] = useState(false)
  const [state, formAction, pending] = useActionState<{ error?: string }, FormData>(
    async (_prev, fd) => {
      const res = await createLeadAction(fd)
      if (!res.error) setOpen(false)
      return res
    },
    {},
  )

  if (!open) {
    return <Button onClick={() => setOpen(true)} size="sm">+ Add lead</Button>
  }

  return (
    <form action={formAction} className="rounded-lg border border-border bg-card p-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Input name="title" placeholder="Lead title" className="sm:col-span-2" required />
        <Input name="value" type="number" placeholder="Value (₹)" />
      </div>
      {state.error && <p className="mt-2 text-sm text-destructive">{state.error}</p>}
      <div className="mt-3 flex gap-2">
        <Button type="submit" size="sm" disabled={pending}>{pending ? 'Saving…' : 'Save lead'}</Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
      </div>
    </form>
  )
}
