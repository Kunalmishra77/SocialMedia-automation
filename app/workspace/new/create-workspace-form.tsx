'use client'

import { useActionState } from 'react'
import { createWorkspaceAction, type ActionState } from '@/lib/actions/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function CreateWorkspaceForm() {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    createWorkspaceAction,
    {},
  )

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="name">Workspace name</Label>
        <Input id="name" name="name" required placeholder="Acme Studios" autoFocus />
      </div>
      <div className="space-y-2">
        <Label htmlFor="industry">
          Industry <span className="text-muted-foreground">(optional)</span>
        </Label>
        <Input id="industry" name="industry" placeholder="D2C, Agency, Coaching…" />
      </div>

      {state.error && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {state.error}
        </p>
      )}

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? 'Creating…' : 'Create workspace'}
      </Button>
    </form>
  )
}
