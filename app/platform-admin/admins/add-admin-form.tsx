'use client'

import { useActionState } from 'react'
import { addPlatformAdminAction } from '@/lib/actions/platform-admins'

const ROLES = ['platform_owner', 'platform_admin', 'platform_support', 'platform_billing']

export function AddAdminForm() {
  const [state, formAction, pending] = useActionState<{ error?: string }, FormData>(
    async (_prev, fd) => addPlatformAdminAction(fd),
    {},
  )

  return (
    <form action={formAction} className="space-y-3 rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex-1">
          <label className="mb-1 block text-xs text-muted-foreground">User email (must have signed up)</label>
          <input
            name="email"
            type="email"
            required
            placeholder="teammate@company.com"
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">Role</label>
          <select name="role" defaultValue="platform_support" className="h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground">
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r.replace('platform_', '')}
              </option>
            ))}
          </select>
        </div>
        <button disabled={pending} className="h-10 rounded-md bg-[#ea6a24] px-4 text-sm font-medium text-white hover:brightness-110 disabled:opacity-50">
          {pending ? 'Adding…' : 'Grant access'}
        </button>
      </div>
      {state.error && <p className="text-sm text-red-400">{state.error}</p>}
    </form>
  )
}
