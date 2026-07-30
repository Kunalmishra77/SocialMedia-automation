'use client'

import { useState } from 'react'
import { useActionState } from 'react'
import { Upload, FileText } from 'lucide-react'
import { ingestDocumentAction } from '@/lib/actions/knowledge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

const ACCEPT = '.pdf,.doc,.docx,.xls,.xlsx,.csv,.tsv,.txt,.md'

export function DocIngest() {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<'file' | 'paste'>('file')
  const [fileName, setFileName] = useState('')
  const [state, formAction, pending] = useActionState<{ error?: string; ok?: string }, FormData>(
    async (_prev, fd) => ingestDocumentAction(fd),
    {},
  )

  if (!open) return <Button size="sm" variant="outline" onClick={() => setOpen(true)}><Upload className="h-4 w-4" /> Upload document</Button>

  return (
    <form action={formAction} className="space-y-3 rounded-lg border border-border bg-card p-4">
      <div className="flex gap-1 rounded-md border border-border bg-muted/40 p-1 text-xs">
        <button type="button" onClick={() => setMode('file')} className={`flex-1 rounded px-2 py-1 ${mode === 'file' ? 'bg-card font-medium shadow-[var(--shadow-sm)]' : 'text-muted-foreground'}`}>Upload file</button>
        <button type="button" onClick={() => setMode('paste')} className={`flex-1 rounded px-2 py-1 ${mode === 'paste' ? 'bg-card font-medium shadow-[var(--shadow-sm)]' : 'text-muted-foreground'}`}>Paste text</button>
      </div>

      {mode === 'file' ? (
        <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-input bg-background px-4 py-6 text-center hover:border-primary/40">
          <FileText className="h-6 w-6 text-muted-foreground" />
          <span className="text-sm font-medium">{fileName || 'Choose a file'}</span>
          <span className="text-xs text-muted-foreground">PDF, Word, Excel, CSV, TXT — up to 25 MB. It’s chunked + embedded so the AI can cite it.</span>
          <input type="file" name="file" accept={ACCEPT} required className="hidden" onChange={(e) => setFileName(e.target.files?.[0]?.name ?? '')} />
        </label>
      ) : (
        <>
          <Input name="filename" placeholder="Document name (e.g. Product-catalog.txt)" />
          <textarea
            name="content"
            rows={6}
            placeholder="Paste your document text (FAQs, catalog, policies…)."
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </>
      )}

      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      {state.ok && <p className="text-sm text-emerald-600">{state.ok}</p>}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending}>{pending ? 'Ingesting…' : 'Ingest'}</Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => { setOpen(false); setFileName('') }}>Cancel</Button>
      </div>
    </form>
  )
}
