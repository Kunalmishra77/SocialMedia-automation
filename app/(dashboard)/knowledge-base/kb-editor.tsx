'use client'

import { useState } from 'react'
import { useActionState } from 'react'
import { createKbEntryAction } from '@/lib/actions/knowledge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export function KbEditor() {
  const [open, setOpen] = useState(false)
  const [state, formAction, pending] = useActionState<{ error?: string }, FormData>(
    async (_prev, fd) => {
      const res = await createKbEntryAction(fd)
      if (!res.error) setOpen(false)
      return res
    },
    {},
  )

  if (!open) return <Button onClick={() => setOpen(true)} size="sm">+ Add entry</Button>

  return (
    <form action={formAction} className="space-y-3 rounded-lg border border-border bg-card p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Input name="title" placeholder="Title (e.g. Return policy)" required />
        <Input name="category" placeholder="Category (optional)" />
      </div>
      <textarea
        name="content"
        required
        rows={5}
        placeholder="The answer / information the AI should use…"
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
      />
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending}>{pending ? 'Saving…' : 'Save entry'}</Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
      </div>
    </form>
  )
}
