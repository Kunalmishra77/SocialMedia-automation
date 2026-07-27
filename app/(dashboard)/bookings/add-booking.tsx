'use client'

import { useState } from 'react'
import { useActionState } from 'react'
import { createBookingAction } from '@/lib/actions/bookings'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export function AddBooking() {
  const [open, setOpen] = useState(false)
  const [state, formAction, pending] = useActionState<{ error?: string }, FormData>(
    async (_prev, fd) => {
      const res = await createBookingAction(fd)
      if (!res.error) setOpen(false)
      return res
    },
    {},
  )

  if (!open) return <Button size="sm" onClick={() => setOpen(true)}>+ New booking</Button>

  return (
    <form action={formAction} className="rounded-xl border border-border bg-card p-4 shadow-[var(--shadow-card)]">
      <div className="grid gap-3 sm:grid-cols-2">
        <Input name="name" placeholder="Customer name" required />
        <Input name="service" placeholder="Service" />
        <Input name="starts_at" type="datetime-local" required />
        <Input name="phone" placeholder="Phone" />
        <Input name="email" type="email" placeholder="Email" className="sm:col-span-2" />
      </div>
      {state.error && <p className="mt-2 text-sm text-destructive">{state.error}</p>}
      <div className="mt-3 flex gap-2">
        <Button type="submit" size="sm" disabled={pending}>{pending ? 'Saving…' : 'Save booking'}</Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
      </div>
    </form>
  )
}
