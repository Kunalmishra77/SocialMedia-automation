'use client'

import { LogOut } from 'lucide-react'
import { logoutAction } from '@/lib/actions/auth'

export function Topbar({ email }: { email: string }) {
  return (
    <header className="flex h-14 shrink-0 items-center justify-end gap-4 border-b border-border bg-card px-6">
      <span className="text-sm text-muted-foreground">{email}</span>
      <form action={logoutAction}>
        <button
          type="submit"
          className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <LogOut className="h-4 w-4" />
          Log out
        </button>
      </form>
    </header>
  )
}
