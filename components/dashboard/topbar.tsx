'use client'

import Link from 'next/link'
import { Bell, LogOut } from 'lucide-react'
import { logoutAction } from '@/lib/actions/auth'

export function Topbar({ email, unread = 0 }: { email: string; unread?: number }) {
  return (
    <header className="flex h-14 shrink-0 items-center justify-end gap-4 border-b border-border bg-card px-6">
      <Link href="/notifications" className="relative rounded-md p-2 hover:bg-muted" title="Notifications">
        <Bell className="h-4 w-4 text-muted-foreground" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </Link>
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
