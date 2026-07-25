'use client'

import { useState } from 'react'
import { useActionState } from 'react'
import { createClientAction } from '@/lib/actions/platform-admin'

export function CreateClient() {
  const [open, setOpen] = useState(false)
  const [state, formAction, pending] = useActionState(createClientAction, {})

  return (
    <div>
      {!open ? (
        <button
          onClick={() => setOpen(true)}
          className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-500"
        >
          + Create client
        </button>
      ) : (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
          <h3 className="mb-3 text-sm font-semibold">Provision a new client</h3>
          {state.credentials ? (
            <div className="space-y-2 text-sm">
              <p className="text-emerald-400">✓ Client created. Share these credentials:</p>
              <div className="rounded-md bg-zinc-950 p-3 font-mono text-xs">
                <p>Login: {state.credentials.loginUrl}</p>
                <p>Email: {state.credentials.email}</p>
                <p>Password: {state.credentials.password}</p>
              </div>
              <button onClick={() => setOpen(false)} className="text-zinc-400 hover:text-white">
                Close
              </button>
            </div>
          ) : (
            <form action={formAction} className="space-y-3">
              <input
                name="workspaceName"
                required
                placeholder="Client / workspace name"
                className="h-9 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100 placeholder:text-zinc-600"
              />
              <input
                name="ownerEmail"
                type="email"
                required
                placeholder="Owner email"
                className="h-9 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100 placeholder:text-zinc-600"
              />
              <div className="flex gap-2">
                <input
                  name="password"
                  placeholder="Password (blank = auto-generate)"
                  className="h-9 flex-1 rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100 placeholder:text-zinc-600"
                />
                <select name="plan" defaultValue="starter" className="h-9 rounded-md border border-zinc-700 bg-zinc-950 px-2 text-sm text-zinc-100">
                  <option value="free">Free</option>
                  <option value="starter">Starter</option>
                  <option value="pro">Pro</option>
                  <option value="enterprise">Enterprise</option>
                </select>
              </div>
              {state.error && <p className="text-sm text-red-400">{state.error}</p>}
              <div className="flex gap-2">
                <button disabled={pending} className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50">
                  {pending ? 'Creating…' : 'Create client'}
                </button>
                <button type="button" onClick={() => setOpen(false)} className="px-3 py-1.5 text-sm text-zinc-400 hover:text-white">
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  )
}
