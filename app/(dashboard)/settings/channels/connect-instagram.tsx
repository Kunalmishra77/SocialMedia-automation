'use client'

import { useState } from 'react'
import { Loader2, RefreshCw, Copy, Check, ChevronDown, ChevronRight, ExternalLink } from 'lucide-react'
import {
  saveInstagramAppAction, connectInstagramTokenAction,
  resubscribeInstagramAction, disconnectChannelAction,
} from '@/lib/actions/channels'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface Setup { configured: boolean; appId: string; verifyToken: string; callbackUrl: string }
interface Conn { id: string; handle: string | null; display_name: string | null }

function Copyable({ label, value }: { label: string; value: string }) {
  const [done, setDone] = useState(false)
  return (
    <div>
      <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
      <div className="flex items-center gap-1">
        <code className="min-w-0 flex-1 truncate rounded bg-muted px-2 py-1 text-xs">{value || '—'}</code>
        <button
          type="button"
          onClick={() => { navigator.clipboard?.writeText(value); setDone(true); setTimeout(() => setDone(false), 1200) }}
          className="rounded p-1 text-muted-foreground hover:bg-muted"
          title="Copy"
        >
          {done ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
      </div>
    </div>
  )
}

export function InstagramChannel({ conn, setup }: { conn: Conn | null; setup: Setup }) {
  const [cfg, setCfg] = useState(setup)
  const [guide, setGuide] = useState(!setup.configured)
  const [editing, setEditing] = useState(!setup.configured)

  return (
    <div className="space-y-4">
      {/* Where-to-get guide */}
      <div className="rounded-lg border border-border">
        <button type="button" onClick={() => setGuide((g) => !g)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium">
          {guide ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          How to get your Instagram App ID & Secret
        </button>
        {guide && (
          <div className="space-y-1.5 border-t border-border px-3 py-3 text-xs text-muted-foreground">
            <p>1. Open <a className="text-primary underline" href="https://developers.facebook.com/apps" target="_blank" rel="noreferrer">developers.facebook.com/apps <ExternalLink className="inline h-3 w-3" /></a> → <b>Create App</b> → type <b>Business</b>.</p>
            <p>2. Add the <b>Instagram</b> product → <b>API setup with Instagram business login</b>.</p>
            <p>3. Copy your <b>Instagram App ID</b> and <b>Instagram App Secret</b> (click “Show”). Paste them below.</p>
            <p>4. Under <b>Generate access tokens</b>, add your Instagram (Business/Creator) account and <b>Generate token</b>.</p>
            <p>5. Under <b>Configure webhooks</b>, paste the <b>Callback URL</b> and <b>Verify token</b> shown below, then subscribe the <b>messages</b>, <b>messaging_postbacks</b> and <b>comments</b> fields.</p>
            <p>6. Set the app to <b>Live</b> (top toggle). For DMs from any customer, complete <b>App Review</b> for <b>instagram_business_manage_messages</b>.</p>
            <p className="text-muted-foreground/80">Your Instagram must be a Business/Creator account.</p>
          </div>
        )}
      </div>

      {/* App credentials */}
      {editing ? (
        <AppForm
          setup={cfg}
          onSaved={(next) => { setCfg(next); setEditing(false) }}
          onCancel={cfg.configured ? () => setEditing(false) : undefined}
        />
      ) : (
        <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm">
          <span className="text-muted-foreground">App ID: <code className="text-foreground">{cfg.appId}</code> · credentials saved ✓</span>
          <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(true)}>Edit</Button>
        </div>
      )}

      {/* Webhook config values — always shown once configured */}
      {cfg.configured && (
        <div className="space-y-2 rounded-lg border border-primary/20 bg-primary/5 p-3">
          <p className="text-xs font-semibold">Paste these into your Meta app → Instagram → Configure webhooks</p>
          <Copyable label="Callback URL" value={cfg.callbackUrl} />
          <Copyable label="Verify token" value={cfg.verifyToken} />
          <p className="text-[11px] text-muted-foreground">Subscribe fields: messages, messaging_postbacks, comments.</p>
        </div>
      )}

      {/* Connect / connected */}
      {conn ? (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2">
          <span className="text-sm text-muted-foreground">Connected: {conn.display_name}{conn.handle ? ` · @${conn.handle}` : ''}</span>
          <div className="flex items-center gap-2">
            <Resubscribe id={conn.id} />
            <form action={disconnectChannelAction}>
              <input type="hidden" name="id" value={conn.id} />
              <button className="rounded-md px-2 py-1 text-xs text-destructive hover:bg-destructive/10">Disconnect</button>
            </form>
          </div>
        </div>
      ) : cfg.configured ? (
        <ConnectStep />
      ) : (
        <p className="text-xs text-muted-foreground">Save your App ID & Secret above to enable connecting.</p>
      )}
    </div>
  )
}

function AppForm({ setup, onSaved, onCancel }: { setup: Setup; onSaved: (s: Setup) => void; onCancel?: () => void }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (busy) return
    const fd = new FormData(e.currentTarget)
    setBusy(true); setErr(null)
    const res = await saveInstagramAppAction(fd)
    setBusy(false)
    if (res.error) { setErr(res.error); return }
    onSaved({ ...setup, configured: true, appId: String(fd.get('app_id') ?? setup.appId), verifyToken: res.verifyToken ?? setup.verifyToken })
  }

  return (
    <form onSubmit={submit} className="space-y-2 rounded-lg border border-border bg-card p-3">
      <div>
        <label className="text-xs font-medium text-muted-foreground">Instagram App ID</label>
        <Input name="app_id" defaultValue={setup.appId} placeholder="e.g. 1954837645190566" />
      </div>
      <div>
        <label className="text-xs font-medium text-muted-foreground">Instagram App Secret</label>
        <Input name="app_secret" type="password" placeholder="Paste app secret (stored encrypted)" />
      </div>
      {err && <p className="text-xs text-destructive">{err}</p>}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={busy}>{busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</> : 'Save credentials'}</Button>
        {onCancel && <Button type="button" variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>}
      </div>
    </form>
  )
}

function ConnectStep() {
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
    else setMsg({ ok: true, text: 'Instagram connected & webhooks subscribed ✓ — refresh the page.' })
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <a href="/api/integrations/instagram/connect" className="inline-block rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90">
          Connect with Instagram
        </a>
        <Button type="button" variant="outline" size="sm" onClick={() => setOpen((o) => !o)}>{open ? 'Hide token option' : 'Or paste access token'}</Button>
      </div>
      {open && (
        <form onSubmit={submit} className="space-y-2 rounded-lg border border-border bg-card p-3">
          <Input name="token" placeholder="Paste the generated access token (IGAA…)" />
          <p className="text-xs text-muted-foreground">Saved securely and auto-subscribed to DM/comment webhooks.</p>
          {msg && <p className={`text-xs ${msg.ok ? 'text-emerald-600' : 'text-destructive'}`}>{msg.text}</p>}
          <Button type="submit" size="sm" disabled={busy}>{busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Connecting…</> : 'Connect & subscribe'}</Button>
        </form>
      )}
    </div>
  )
}

function Resubscribe({ id }: { id: string }) {
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  async function run() {
    if (busy) return
    setBusy(true); setMsg(null)
    const fd = new FormData(); fd.set('id', id)
    const res = await resubscribeInstagramAction(fd)
    setBusy(false)
    setMsg(res.ok ? { ok: true, text: 'Subscribed ✓' } : { ok: false, text: res.error ?? 'Failed' })
  }
  return (
    <div className="flex flex-col items-end gap-0.5">
      <Button type="button" variant="outline" size="sm" onClick={run} disabled={busy}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Re-subscribe
      </Button>
      {msg && <span className={`text-[11px] ${msg.ok ? 'text-emerald-600' : 'text-destructive'}`}>{msg.text}</span>}
    </div>
  )
}
