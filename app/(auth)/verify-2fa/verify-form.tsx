'use client'

import { useActionState } from 'react'
import { verifyLoginAction, type TwoFactorState } from '@/lib/actions/platform-2fa'
import { Button } from '@/components/ui/button'

export function VerifyForm() {
  const [state, action, pending] = useActionState<TwoFactorState, FormData>(verifyLoginAction, {})
  return (
    <form action={action} className="space-y-4">
      <div className="space-y-2">
        <label htmlFor="code" className="text-sm font-medium">Authentication code</label>
        <input
          id="code"
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
          placeholder="000000"
          className="h-11 w-full rounded-md border border-input bg-background text-center text-lg tracking-[0.4em] outline-none"
        />
      </div>
      {state.error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{state.error}</p>}
      <Button type="submit" className="w-full" disabled={pending}>{pending ? 'Verifying…' : 'Verify & continue'}</Button>
    </form>
  )
}
