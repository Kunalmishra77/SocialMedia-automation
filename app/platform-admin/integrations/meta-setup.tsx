'use client'

import { useState } from 'react'
import { Copy, Check } from 'lucide-react'

function Field({ label, value }: { label: string; value: string }) {
  const [done, setDone] = useState(false)
  return (
    <div>
      <p className="mb-1 text-xs font-medium text-muted-foreground">{label}</p>
      <div className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2">
        <code className="flex-1 truncate font-mono text-xs text-foreground">{value}</code>
        <button
          type="button"
          onClick={() => { navigator.clipboard.writeText(value); setDone(true); setTimeout(() => setDone(false), 1500) }}
          className="inline-flex items-center gap-1 rounded bg-primary/10 px-2 py-1 text-xs font-medium text-primary hover:bg-primary/20"
        >
          {done ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}{done ? 'Copied' : 'Copy'}
        </button>
      </div>
    </div>
  )
}

export function MetaSetup({ base, verifyToken }: { base: string; verifyToken: string }) {
  return (
    <div className="space-y-3">
      <Field label="1 · OAuth Redirect URI  (Meta → Instagram → Business login → Settings)" value={`${base}/api/integrations/instagram/callback`} />
      <Field label="2 · Webhook Callback URL  (Meta → Webhooks / Instagram → Callback URL)" value={`${base}/api/webhooks/instagram`} />
      <Field label="3 · Webhook Verify Token  (Meta → Webhooks → Verify token)" value={verifyToken} />
    </div>
  )
}
