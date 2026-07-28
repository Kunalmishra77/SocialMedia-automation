'use client'

import { useActionState } from 'react'
import { confirmEnrollAction, disable2faAction, type TwoFactorState } from '@/lib/actions/platform-2fa'

const input = 'h-10 w-40 rounded-md border border-input bg-background px-3 text-center text-lg tracking-[0.3em] text-foreground'

export function EnrollForm({ secret }: { secret: string }) {
  const [state, action, pending] = useActionState<TwoFactorState, FormData>(confirmEnrollAction, {})
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="secret" value={secret} />
      <div>
        <label className="mb-1 block text-xs text-muted-foreground">Enter the 6-digit code from your authenticator</label>
        <input name="code" inputMode="numeric" autoComplete="one-time-code" placeholder="000000" className={input} />
      </div>
      {state.error && <p className="text-sm text-red-400">{state.error}</p>}
      <button disabled={pending} className="h-10 rounded-md bg-[#ea6a24] px-4 text-sm font-medium text-white hover:brightness-110 disabled:opacity-50">
        {pending ? 'Verifying…' : 'Enable 2FA'}
      </button>
    </form>
  )
}

export function DisableForm() {
  const [state, action, pending] = useActionState<TwoFactorState, FormData>(disable2faAction, {})
  return (
    <form action={action} className="space-y-3">
      <div>
        <label className="mb-1 block text-xs text-muted-foreground">Enter a current code to turn 2FA off</label>
        <input name="code" inputMode="numeric" autoComplete="one-time-code" placeholder="000000" className={input} />
      </div>
      {state.error && <p className="text-sm text-red-400">{state.error}</p>}
      <button disabled={pending} className="h-10 rounded-md bg-muted px-4 text-sm text-foreground hover:bg-muted disabled:opacity-50">
        {pending ? 'Disabling…' : 'Disable 2FA'}
      </button>
    </form>
  )
}
