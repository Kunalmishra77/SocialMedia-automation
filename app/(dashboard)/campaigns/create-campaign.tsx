'use client'

import { useState } from 'react'
import { useActionState } from 'react'
import { createCampaignAction } from '@/lib/actions/campaigns'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export function CreateCampaign() {
  const [open, setOpen] = useState(false)
  const [state, formAction, pending] = useActionState<{ error?: string }, FormData>(
    async (_prev, fd) => {
      const res = await createCampaignAction(fd)
      if (!res.error) setOpen(false)
      return res
    },
    {},
  )

  if (!open) return <Button size="sm" onClick={() => setOpen(true)}>+ New campaign</Button>

  return (
    <form action={formAction} className="space-y-3 rounded-lg border border-border bg-card p-4">
      <Input name="name" placeholder="Campaign name" required />
      <select name="type" defaultValue="window_broadcast" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
        <option value="window_broadcast">Window broadcast (active 24h window)</option>
        <option value="segment">Segment broadcast</option>
        <option value="re_engagement">Re-engagement (template)</option>
        <option value="post_comment">Post comment DM</option>
      </select>
      <textarea
        name="message_text"
        rows={4}
        required
        placeholder="Message to send…"
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
      />
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending}>{pending ? 'Creating…' : 'Create campaign'}</Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
      </div>
    </form>
  )
}
