'use client'

import { useActionState } from 'react'
import { acceptInviteAction } from '@/lib/actions/invite'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function AcceptForm({ token, loggedIn }: { token: string; loggedIn: boolean }) {
  const [state, formAction, pending] = useActionState<{ error?: string }, FormData>(
    acceptInviteAction,
    {},
  )

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      {!loggedIn && (
        <div className="space-y-2">
          <Label htmlFor="password">Create a password</Label>
          <Input id="password" name="password" type="password" placeholder="At least 8 characters" />
          <p className="text-xs text-muted-foreground">
            If you already have an account, you&apos;ll be asked to log in instead.
          </p>
        </div>
      )}
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? 'Joining…' : 'Accept invite'}
      </Button>
    </form>
  )
}
