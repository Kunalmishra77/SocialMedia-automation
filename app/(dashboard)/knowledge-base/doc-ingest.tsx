'use client'

import { useState } from 'react'
import { useActionState } from 'react'
import { ingestDocumentAction } from '@/lib/actions/knowledge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export function DocIngest() {
  const [open, setOpen] = useState(false)
  const [state, formAction, pending] = useActionState<{ error?: string; ok?: string }, FormData>(
    async (_prev, fd) => ingestDocumentAction(fd),
    {},
  )

  if (!open) return <Button size="sm" variant="outline" onClick={() => setOpen(true)}>+ Upload document</Button>

  return (
    <form action={formAction} className="space-y-2 rounded-lg border border-border bg-card p-4">
      <Input name="filename" placeholder="Document name (e.g. Product-catalog.txt)" />
      <textarea
        name="content"
        rows={6}
        required
        placeholder="Paste your document text (FAQs, catalog, policies…). It's chunked + embedded so the AI can cite it."
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
      />
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      {state.ok && <p className="text-sm text-emerald-600">{state.ok}</p>}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending}>{pending ? 'Ingesting…' : 'Ingest'}</Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
      </div>
    </form>
  )
}
