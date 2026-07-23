'use client'

import { endImpersonationAction } from '@/lib/actions/impersonation'

export function ImpersonationBanner({
  workspaceName,
  mode,
}: {
  workspaceName: string
  mode: 'read' | 'full'
}) {
  return (
    <div className="flex shrink-0 items-center justify-between gap-4 bg-red-600 px-6 py-2 text-sm text-white">
      <span>
        ⚠️ Platform support — viewing as <strong>{workspaceName}</strong>{' '}
        <span className="rounded bg-white/20 px-1.5 py-0.5 text-xs uppercase">
          {mode === 'full' ? 'full access' : 'read only'}
        </span>
      </span>
      <form action={endImpersonationAction}>
        <button type="submit" className="rounded bg-white/20 px-3 py-1 font-medium hover:bg-white/30">
          Exit impersonation
        </button>
      </form>
    </div>
  )
}
