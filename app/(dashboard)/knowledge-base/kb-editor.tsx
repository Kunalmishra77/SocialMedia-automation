'use client'

import { useState } from 'react'
import { useActionState } from 'react'
import { Sparkles, Loader2 } from 'lucide-react'
import { createKbEntryAction, aiGenerateKbEntry } from '@/lib/actions/knowledge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export function KbEditor() {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [topic, setTopic] = useState('')
  const [genBusy, setGenBusy] = useState(false)
  const [genErr, setGenErr] = useState('')
  const [state, formAction, pending] = useActionState<{ error?: string }, FormData>(
    async (_prev, fd) => {
      const res = await createKbEntryAction(fd)
      if (!res.error) { setOpen(false); setTitle(''); setContent(''); setTopic('') }
      return res
    },
    {},
  )

  async function generate() {
    setGenErr(''); setGenBusy(true)
    try {
      const res = await aiGenerateKbEntry(topic)
      if (res.error) setGenErr(res.error)
      else { setTitle(res.title ?? ''); setContent(res.content ?? '') }
    } finally { setGenBusy(false) }
  }

  if (!open) return <Button onClick={() => setOpen(true)} size="sm">+ Add entry</Button>

  return (
    <form action={formAction} className="space-y-3 rounded-lg border border-border bg-card p-4">
      <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
        <div className="flex items-center gap-2">
          <Input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="AI: topic (e.g. our return policy)" className="flex-1" />
          <Button type="button" size="sm" onClick={generate} disabled={genBusy}>
            {genBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Sparkles className="h-4 w-4" /> Generate</>}
          </Button>
        </div>
        {genErr && <p className="mt-1 text-xs text-destructive">{genErr}</p>}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Input name="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title (e.g. Return policy)" required />
        <Input name="category" placeholder="Category (optional)" />
      </div>
      <textarea name="content" value={content} onChange={(e) => setContent(e.target.value)} required rows={5} placeholder="The answer / information the AI should use…" className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending}>{pending ? 'Saving…' : 'Save entry'}</Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
      </div>
    </form>
  )
}
