'use client'

import { useActionState } from 'react'
import { inviteMemberAction } from '@/lib/actions/workspace'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export function InviteForm({ workspaceId }: { workspaceId: string }) {
  const [state, formAction, pending] = useActionState<
    { error?: string; inviteUrl?: string },
    FormData
  >(async (_prev, fd) => inviteMemberAction(fd), {})

  return (
    <div className="space-y-3">
      <form action={formAction} className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="workspaceId" value={workspaceId} />
        <div className="flex-1">
          <Input name="email" type="email" required placeholder="teammate@company.com" />
        </div>
        <select name="role" defaultValue="agent" className="h-10 rounded-md border border-input bg-background px-3 text-sm">
          <option value="agent">Agent</option>
          <option value="manager">Manager</option>
          <option value="admin">Admin</option>
        </select>
        <Button type="submit" disabled={pending}>
          {pending ? 'Creating…' : 'Invite'}
        </Button>
      </form>

      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      {state.inviteUrl && (
        <div className="rounded-md border border-emerald-600/30 bg-emerald-600/10 p-3 text-sm">
          <p className="mb-1 font-medium text-emerald-700">Invite created — share this link:</p>
          <code className="block break-all text-xs text-emerald-800">{state.inviteUrl}</code>
        </div>
      )}
    </div>
  )
}
