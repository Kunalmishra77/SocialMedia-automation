import Link from 'next/link'
import { ShieldCheck, LayoutDashboard, Building2, ScrollText, Flag, Users } from 'lucide-react'
import { requirePlatformAdmin } from '@/lib/platform-admin/auth'
import { logoutAction } from '@/lib/actions/auth'

export default async function PlatformAdminLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requirePlatformAdmin()

  const nav = [
    { label: 'Overview', href: '/platform-admin', icon: LayoutDashboard },
    { label: 'Workspaces', href: '/platform-admin/workspaces', icon: Building2 },
    { label: 'Feature flags', href: '/platform-admin/feature-flags', icon: Flag },
    { label: 'Admins', href: '/platform-admin/admins', icon: Users },
    { label: 'Audit log', href: '/platform-admin/audit', icon: ScrollText },
  ]

  return (
    <div className="flex h-screen overflow-hidden bg-zinc-950 text-zinc-100">
      <aside className="flex w-60 shrink-0 flex-col border-r border-zinc-800 bg-zinc-900">
        <div className="flex h-14 items-center gap-2 border-b border-zinc-800 px-4">
          <ShieldCheck className="h-5 w-5 text-emerald-400" />
          <span className="text-sm font-bold">Platform Console</span>
        </div>
        <nav className="flex-1 space-y-1 p-2">
          {nav.map((item) => {
            const Icon = item.icon
            return (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-white"
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            )
          })}
        </nav>
        <div className="border-t border-zinc-800 p-3 text-xs text-zinc-400">
          <p className="truncate font-medium text-zinc-200">{ctx.email}</p>
          <p className="capitalize">{ctx.role.replace('_', ' ')}</p>
          <Link href="/" className="mt-2 inline-block text-emerald-400 hover:underline">
            ← Back to app
          </Link>
        </div>
      </aside>

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-zinc-800 bg-zinc-900 px-6">
          <span className="text-sm text-zinc-400">
            ⚠️ Operator console — actions here affect real customers and are audit-logged.
          </span>
          <form action={logoutAction}>
            <button type="submit" className="text-sm text-zinc-400 hover:text-white">
              Log out
            </button>
          </form>
        </header>
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  )
}
