'use client'

import { useState } from 'react'
import { Sparkles, Loader2, Send, BookOpen } from 'lucide-react'
import { sandboxReplyAction } from '@/lib/actions/knowledge'

const EXAMPLES = ['What are your prices?', 'Do you ship to my city?', 'How do I book a consultation?']

export function Sandbox() {
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ reply?: string; kbContext?: string; error?: string } | null>(null)

  async function run(text?: string) {
    const msg = (text ?? message).trim()
    if (!msg || busy) return
    setBusy(true); setResult(null)
    const res = await sandboxReplyAction(msg)
    setResult(res)
    setBusy(false)
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Test message (as a customer would send)</label>
        <div className="flex gap-2">
          <input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); run() } }}
            placeholder="e.g. what is your return policy?"
            className="h-10 flex-1 rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:border-primary"
          />
          <button onClick={() => run()} disabled={busy} className="inline-flex h-10 items-center gap-1.5 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:brightness-110 disabled:opacity-50">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Test
          </button>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {EXAMPLES.map((ex) => (
            <button key={ex} onClick={() => { setMessage(ex); run(ex) }} disabled={busy} className="rounded-full border border-border px-2.5 py-0.5 text-xs text-muted-foreground hover:border-primary/40 hover:text-foreground">
              {ex}
            </button>
          ))}
        </div>
      </div>

      {result?.error && <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-700">{result.error}</p>}

      {result?.reply && (
        <div className="space-y-3">
          <div className="rounded-xl border border-primary/20 bg-primary/5 p-3">
            <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-primary"><Sparkles className="h-3.5 w-3.5" /> AI reply (exactly what your customer would get)</p>
            <p className="whitespace-pre-wrap text-sm">{result.reply}</p>
          </div>
          <details className="rounded-lg border border-border bg-muted/30 p-3 text-xs">
            <summary className="cursor-pointer font-medium text-muted-foreground"><BookOpen className="mr-1 inline h-3.5 w-3.5" />Knowledge the AI used {result.kbContext ? '' : '(none — add entries/docs for better answers)'}</summary>
            {result.kbContext
              ? <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap text-muted-foreground">{result.kbContext}</pre>
              : <p className="mt-2 text-muted-foreground">No matching knowledge found — the AI answered from its persona only. Add Knowledge entries or upload documents so it grounds on your business facts.</p>}
          </details>
        </div>
      )}

      <p className="text-[11px] text-muted-foreground">Sandbox uses your live persona + knowledge base. Nothing here is sent to Instagram or saved — it&apos;s a safe test.</p>
    </div>
  )
}
