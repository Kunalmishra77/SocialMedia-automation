'use client'

import { useState } from 'react'
import { useActionState } from 'react'
import { createApiKeyAction } from '@/lib/actions/api-keys'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export function CreateKey() {
  const [copied, setCopied] = useState(false)
  const [state, formAction, pending] = useActionState<{ error?: string; key?: string }, FormData>(
    createApiKeyAction,
    {},
  )

  return (
    <div className="space-y-3">
      <form action={formAction} className="flex gap-2">
        <Input name="name" placeholder="Key name (e.g. Zapier)" className="flex-1" />
        <Button type="submit" disabled={pending}>{pending ? 'Creating…' : 'Create key'}</Button>
      </form>
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      {state.key && (
        <div className="rounded-md border border-emerald-600/30 bg-emerald-600/10 p-3 text-sm">
          <p className="mb-1 font-medium text-emerald-700">Copy your key now — it won&apos;t be shown again:</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 break-all rounded bg-card px-2 py-1 text-xs">{state.key}</code>
            <button onClick={() => { navigator.clipboard.writeText(state.key!); setCopied(true) }} className="rounded-md bg-emerald-600 px-2 py-1 text-xs text-white">
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
