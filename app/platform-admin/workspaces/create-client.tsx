'use client'

import { useState } from 'react'
import { useActionState } from 'react'
import { createClientOnboardingAction } from '@/lib/actions/onboarding'

export function CreateClient() {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const [state, formAction, pending] = useActionState(createClientOnboardingAction, {})

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
        <div className="w-80 rounded-lg border border-zinc-800 bg-zinc-900 p-4">
          <h3 className="mb-3 text-sm font-semibold">New client</h3>
          {state.onboardUrl ? (
            <div className="space-y-3 text-sm">
              <p className="text-emerald-400">✓ Client created. Share this onboarding link:</p>
              <div className="rounded-md bg-zinc-950 p-2 font-mono text-xs break-all text-zinc-300">
                {state.onboardUrl}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => { navigator.clipboard.writeText(state.onboardUrl!); setCopied(true) }}
                  className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-500"
                >
                  {copied ? 'Copied!' : 'Copy link'}
                </button>
                <button onClick={() => setOpen(false)} className="px-3 py-1.5 text-xs text-zinc-400 hover:text-white">Close</button>
              </div>
              <p className="text-xs text-zinc-500">Client opens it → learns the platform → picks a plan → demo-pays → appears in Approvals.</p>
            </div>
          ) : (
            <form action={formAction} className="space-y-2">
              <input name="workspaceName" required placeholder="Client / workspace name" className="h-9 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100 placeholder:text-zinc-600" />
              <input name="ownerEmail" type="email" required placeholder="Owner email" className="h-9 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100 placeholder:text-zinc-600" />
              <input name="ownerName" placeholder="Owner name (optional)" className="h-9 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100 placeholder:text-zinc-600" />
              <div className="flex gap-2">
                <input name="ownerPhone" placeholder="Phone" className="h-9 flex-1 rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100 placeholder:text-zinc-600" />
                <input name="company" placeholder="Company" className="h-9 flex-1 rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100 placeholder:text-zinc-600" />
              </div>
              {state.error && <p className="text-sm text-red-400">{state.error}</p>}
              <div className="flex gap-2 pt-1">
                <button disabled={pending} className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50">
                  {pending ? 'Creating…' : 'Generate link'}
                </button>
                <button type="button" onClick={() => setOpen(false)} className="px-3 py-1.5 text-sm text-zinc-400 hover:text-white">Cancel</button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  )
}
