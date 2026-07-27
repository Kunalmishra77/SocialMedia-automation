'use client'

import Link from 'next/link'
import { Bell, LogOut } from 'lucide-react'
import { logoutAction } from '@/lib/actions/auth'

export function Topbar({ email, unread = 0 }: { email: string; unread?: number }) {
  const initial = (email || '?').charAt(0).toUpperCase()
  return (
    <header className="flex h-16 shrink-0 items-center justify-end gap-3 border-b border-border bg-card/60 px-6 backdrop-blur">
      <Link href="/notifications" className="relative rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" title="Notifications">
        <Bell className="h-[18px] w-[18px]" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </Link>

      <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 py-1 pl-1 pr-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-md brand-gradient text-xs font-bold text-white">{initial}</span>
        <span className="hidden text-sm text-muted-foreground sm:inline">{email}</span>
        <form action={logoutAction}>
          <button type="submit" className="rounded-md p-1 text-muted-foreground transition-colors hover:text-destructive" title="Log out">
            <LogOut className="h-4 w-4" />
          </button>
        </form>
      </div>
    </header>
  )
}
