'use client'

import { useActionState, useState } from 'react'
import { KeyRound, LinkIcon, Copy, Check } from 'lucide-react'
import { setClientPasswordAction, generateLoginLinkAction, type ClientAccessState } from '@/lib/actions/platform-admin'
import { PasswordInput } from '@/components/ui/password-input'

function Copyable({ value }: { value: string }) {
  const [done, setDone] = useState(false)
  return (
    <button
      type="button"
      onClick={() => { navigator.clipboard.writeText(value); setDone(true); setTimeout(() => setDone(false), 1500) }}
      className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-1 text-xs font-medium text-primary hover:bg-primary/20"
    >
      {done ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}{done ? 'Copied' : 'Copy'}
    </button>
  )
}

export function ClientAccess({ workspaceId, ownerEmail }: { workspaceId: string; ownerEmail: string }) {
  const [pwState, setPw, pwPending] = useActionState<ClientAccessState, FormData>(setClientPasswordAction, {})
  const [linkState, genLink, linkPending] = useActionState<ClientAccessState, FormData>(generateLoginLinkAction, {})

  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <h2 className="mb-1 text-sm font-semibold">Client access</h2>
      <p className="mb-4 text-xs text-muted-foreground">Owner login: <span className="font-mono text-foreground">{ownerEmail}</span></p>

      <div className="grid gap-5 sm:grid-cols-2">
        {/* Set password directly */}
        <form action={setPw} className="space-y-2">
          <input type="hidden" name="workspaceId" value={workspaceId} />
          <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><KeyRound className="h-3.5 w-3.5" />Set a password</label>
          <PasswordInput name="password" placeholder="Min 8 characters" autoComplete="new-password" />
          <button disabled={pwPending} className="h-9 w-full rounded-md bg-primary text-sm font-medium text-primary-foreground hover:brightness-110 disabled:opacity-50">
            {pwPending ? 'Setting…' : 'Set password'}
          </button>
          {pwState.error && <p className="text-xs text-red-600">{pwState.error}</p>}
          {pwState.password && (
            <div className="rounded-md border border-emerald-200 bg-emerald-50 p-2 text-xs text-emerald-800">
              ✓ Password set. Share with the client:
              <div className="mt-1 flex items-center justify-between gap-2">
                <code className="font-mono text-emerald-900">{ownerEmail} / {pwState.password}</code>
                <Copyable value={`Login: ${window.location.origin}/login\nEmail: ${ownerEmail}\nPassword: ${pwState.password}`} />
              </div>
            </div>
          )}
        </form>

        {/* Generate / email set-password link */}
        <form action={genLink} className="space-y-2">
          <input type="hidden" name="workspaceId" value={workspaceId} />
          <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><LinkIcon className="h-3.5 w-3.5" />Or send a secure link</label>
          <p className="text-xs text-muted-foreground">Emails the client a one-time “set your password” link and shows it here to copy.</p>
          <button disabled={linkPending} className="h-9 w-full rounded-md border border-input bg-card text-sm font-medium hover:bg-muted disabled:opacity-50">
            {linkPending ? 'Generating…' : 'Generate login link'}
          </button>
          {linkState.error && <p className="text-xs text-red-600">{linkState.error}</p>}
          {linkState.link && (
            <div className="rounded-md border border-border bg-muted/40 p-2 text-xs">
              <p className="mb-1 text-muted-foreground">{linkState.emailed ? '✓ Emailed to client.' : '⚠ Email not sent (SMTP) — share this link manually:'}</p>
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-mono text-[10px] text-foreground">{linkState.link}</span>
                <Copyable value={linkState.link} />
              </div>
            </div>
          )}
        </form>
      </div>
    </div>
  )
}
