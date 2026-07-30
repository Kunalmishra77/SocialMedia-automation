'use client'

import { useState } from 'react'
import { FileText, ChevronDown, ChevronRight, Trash2 } from 'lucide-react'
import { deleteDocumentAction } from '@/lib/actions/knowledge'

export interface DocGroup {
  filename: string
  fileType: string
  chunks: { index: number; preview: string }[]
}

export function DocumentsList({ docs }: { docs: DocGroup[] }) {
  if (!docs.length) {
    return <p className="text-sm text-muted-foreground">No documents yet. Use “Upload document” to add PDFs, Excel, CSV or Word files — they’re chunked and embedded so the AI can cite them.</p>
  }
  return (
    <div className="space-y-2">
      {docs.map((d) => <DocRow key={d.filename} doc={d} />)}
    </div>
  )
}

function DocRow({ doc }: { doc: DocGroup }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="rounded-lg border border-border">
      <div className="flex items-center justify-between gap-2 px-3 py-2.5">
        <button onClick={() => setOpen((o) => !o)} className="flex min-w-0 items-center gap-2 text-left">
          {open ? <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
          <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="truncate text-sm font-medium">{doc.filename}</span>
          <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">{doc.fileType}</span>
          <span className="shrink-0 text-xs text-muted-foreground">{doc.chunks.length} chunk(s)</span>
        </button>
        <form action={deleteDocumentAction}>
          <input type="hidden" name="filename" value={doc.filename} />
          <button className="rounded-md p-1 text-destructive hover:bg-destructive/10" title="Delete document"><Trash2 className="h-4 w-4" /></button>
        </form>
      </div>
      {open && (
        <div className="space-y-1.5 border-t border-border p-3">
          {doc.chunks.map((c) => (
            <div key={c.index} className="rounded-md bg-muted/40 p-2 text-xs">
              <span className="mb-0.5 block font-mono text-[10px] text-muted-foreground">chunk #{c.index}</span>
              <p className="whitespace-pre-wrap text-muted-foreground">{c.preview}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
