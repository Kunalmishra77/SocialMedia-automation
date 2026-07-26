'use client'

import { useState } from 'react'
import { useActionState } from 'react'
import { createRuleAction } from '@/lib/actions/inbox-rules'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export function CreateRule() {
  const [open, setOpen] = useState(false)
  const [state, formAction, pending] = useActionState<{ error?: string }, FormData>(
    async (_prev, fd) => {
      const res = await createRuleAction(fd)
      if (!res.error) setOpen(false)
      return res
    },
    {},
  )

  if (!open) return <Button size="sm" onClick={() => setOpen(true)}>+ Add rule</Button>

  return (
    <form action={formAction} className="space-y-3 rounded-lg border border-border bg-card p-4">
      <Input name="name" placeholder="Rule name (e.g. Pricing auto-reply)" required />
      <Input name="keywords" placeholder="Keywords, comma separated (price, cost, rate)" required />
      <select name="match" defaultValue="any" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
        <option value="any">Match ANY keyword</option>
        <option value="all">Match ALL keywords</option>
      </select>
      <textarea name="auto_reply" rows={2} placeholder="Auto-reply message (optional)" className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
      <Input name="add_label" placeholder="Add label (optional)" />
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending}>{pending ? 'Saving…' : 'Save rule'}</Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
      </div>
    </form>
  )
}
