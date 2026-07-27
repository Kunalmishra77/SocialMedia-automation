'use client'

import { useState } from 'react'
import { useActionState } from 'react'
import { Sparkles, Loader2 } from 'lucide-react'
import { createCampaignAction, aiGenerateCampaignMessage } from '@/lib/actions/campaigns'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export function CreateCampaign() {
  const [open, setOpen] = useState(false)
  const [message, setMessage] = useState('')
  const [goal, setGoal] = useState('')
  const [genBusy, setGenBusy] = useState(false)
  const [genErr, setGenErr] = useState('')
  const [state, formAction, pending] = useActionState<{ error?: string }, FormData>(
    async (_prev, fd) => {
      const res = await createCampaignAction(fd)
      if (!res.error) { setOpen(false); setMessage(''); setGoal('') }
      return res
    },
    {},
  )

  async function generate() {
    setGenErr(''); setGenBusy(true)
    try {
      const res = await aiGenerateCampaignMessage(goal)
      if (res.error) setGenErr(res.error)
      else setMessage(res.message ?? '')
    } finally { setGenBusy(false) }
  }

  if (!open) return <Button size="sm" onClick={() => setOpen(true)}>+ New campaign</Button>

  return (
    <form action={formAction} className="space-y-3 rounded-xl border border-border bg-card p-4 shadow-[var(--shadow-card)]">
      <Input name="name" placeholder="Campaign name" required />
      <select name="type" defaultValue="window_broadcast" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
        <option value="window_broadcast">Window broadcast (active 24h window)</option>
        <option value="segment">Segment broadcast</option>
        <option value="re_engagement">Re-engagement (template)</option>
        <option value="post_comment">Post comment DM</option>
      </select>

      <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
        <div className="flex items-center gap-2">
          <Input value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="AI: campaign goal (e.g. flash sale 20% off today)" className="flex-1" />
          <Button type="button" size="sm" onClick={generate} disabled={genBusy}>
            {genBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Sparkles className="h-4 w-4" /> Generate</>}
          </Button>
        </div>
        {genErr && <p className="mt-1 text-xs text-destructive">{genErr}</p>}
      </div>

      <textarea name="message_text" value={message} onChange={(e) => setMessage(e.target.value)} rows={4} required placeholder="Message to send…" className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending}>{pending ? 'Creating…' : 'Create campaign'}</Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
      </div>
    </form>
  )
}
