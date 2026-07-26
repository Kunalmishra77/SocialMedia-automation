'use client'

import { useState } from 'react'
import { useActionState } from 'react'
import { createInfluencerAction } from '@/lib/actions/influencers'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export function AddInfluencer() {
  const [open, setOpen] = useState(false)
  const [state, formAction, pending] = useActionState<{ error?: string }, FormData>(
    async (_prev, fd) => {
      const res = await createInfluencerAction(fd)
      if (!res.error) setOpen(false)
      return res
    },
    {},
  )

  if (!open) return <Button size="sm" onClick={() => setOpen(true)}>+ Add influencer</Button>

  return (
    <form action={formAction} className="rounded-lg border border-border bg-card p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Input name="name" placeholder="Name" />
        <Input name="ig_username" placeholder="Instagram username" />
        <Input name="category" placeholder="Category (fashion, tech…)" />
        <Input name="followers_count" type="number" placeholder="Followers" />
        <Input name="rate_per_post" type="number" placeholder="Rate per post (₹)" className="sm:col-span-2" />
      </div>
      {state.error && <p className="mt-2 text-sm text-destructive">{state.error}</p>}
      <div className="mt-3 flex gap-2">
        <Button type="submit" size="sm" disabled={pending}>{pending ? 'Saving…' : 'Save'}</Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
      </div>
    </form>
  )
}
