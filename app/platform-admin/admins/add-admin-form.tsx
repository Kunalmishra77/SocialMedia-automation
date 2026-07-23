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
    <form action={formAction} className="space-y-3 rounded-lg border border-zinc-800 bg-zinc-900 p-4">
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex-1">
          <label className="mb-1 block text-xs text-zinc-400">User email (must have signed up)</label>
          <input
            name="email"
            type="email"
            required
            placeholder="teammate@company.com"
            className="h-10 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100 placeholder:text-zinc-600"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-zinc-400">Role</label>
          <select name="role" defaultValue="platform_support" className="h-10 rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100">
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r.replace('platform_', '')}
              </option>
            ))}
          </select>
        </div>
        <button disabled={pending} className="h-10 rounded-md bg-emerald-600 px-4 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50">
          {pending ? 'Adding…' : 'Grant access'}
        </button>
      </div>
      {state.error && <p className="text-sm text-red-400">{state.error}</p>}
    </form>
  )
}
