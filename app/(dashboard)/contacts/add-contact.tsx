'use client'

import { useState } from 'react'
import { useActionState } from 'react'
import { createContactAction } from '@/lib/actions/crm'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export function AddContact() {
  const [open, setOpen] = useState(false)
  const [state, formAction, pending] = useActionState<{ error?: string }, FormData>(
    async (_prev, fd) => {
      const res = await createContactAction(fd)
      if (!res.error) setOpen(false)
      return res
    },
    {},
  )

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)} size="sm">
        + Add contact
      </Button>
    )
  }

  return (
    <form action={formAction} className="rounded-lg border border-border bg-card p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Input name="full_name" placeholder="Full name" />
        <Input name="ig_username" placeholder="Instagram username" />
        <Input name="email" type="email" placeholder="Email" />
        <Input name="phone" placeholder="Phone" />
        <Input name="tags" placeholder="Tags (comma separated)" className="sm:col-span-2" />
      </div>
      {state.error && <p className="mt-2 text-sm text-destructive">{state.error}</p>}
      <div className="mt-3 flex gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? 'Saving…' : 'Save contact'}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  )
}
