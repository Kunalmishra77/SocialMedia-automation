'use client'

import { useState } from 'react'
import { Loader2, RefreshCw } from 'lucide-react'
import { connectInstagramTokenAction, resubscribeInstagramAction } from '@/lib/actions/channels'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

/** Connect Instagram by pasting a long-lived access token (no OAuth redirect). */
export function ConnectInstagram({ oauthEnabled }: { oauthEnabled: boolean }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (busy) return
    setBusy(true); setMsg(null)
    const res = await connectInstagramTokenAction(new FormData(e.currentTarget))
    setBusy(false)
    if (res.error) setMsg({ ok: false, text: res.error })
    else if (res.warning) setMsg({ ok: false, text: res.warning })
    else setMsg({ ok: true, text: 'Instagram connected & webhooks subscribed ✓' })
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {oauthEnabled && (
          <a href="/api/integrations/instagram/connect" className="inline-block rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90">
            Connect with Instagram
          </a>
        )}
        <Button type="button" variant="outline" size="sm" onClick={() => setOpen((o) => !o)}>
          {open ? 'Hide token option' : 'Or paste access token'}
        </Button>
      </div>

      {open && (
        <form onSubmit={submit} className="space-y-2 rounded-lg border border-border bg-card p-3">
          <Input name="token" placeholder="Paste Instagram long-lived access token (IGAA…)" />
          <p className="text-xs text-muted-foreground">We validate it, save it securely, and subscribe the account to DM/comment webhooks automatically.</p>
          {msg && <p className={`text-xs ${msg.ok ? 'text-emerald-600' : 'text-destructive'}`}>{msg.text}</p>}
          <Button type="submit" size="sm" disabled={busy}>{busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Connecting…</> : 'Connect & subscribe'}</Button>
        </form>
      )}
    </div>
  )
}

/** Re-run webhook subscription for an already-connected Instagram account. */
export function ResubscribeInstagram({ id }: { id: string }) {
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  async function run() {
    if (busy) return
    setBusy(true); setMsg(null)
    const fd = new FormData(); fd.set('id', id)
    const res = await resubscribeInstagramAction(fd)
    setBusy(false)
    setMsg(res.ok ? { ok: true, text: 'Webhooks subscribed ✓' } : { ok: false, text: res.error ?? 'Failed' })
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button type="button" variant="outline" size="sm" onClick={run} disabled={busy}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Re-subscribe webhooks
      </Button>
      {msg && <span className={`text-xs ${msg.ok ? 'text-emerald-600' : 'text-destructive'}`}>{msg.text}</span>}
    </div>
  )
}
