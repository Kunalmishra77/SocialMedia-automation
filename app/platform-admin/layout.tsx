import Link from 'next/link'
import {
  ShieldCheck, LayoutDashboard, Building2, ScrollText, Flag, Users, BadgeCheck,
  IndianRupee, BarChart3, Activity, Radio, Lock, LifeBuoy, Settings, Package,
} from 'lucide-react'
import { requirePlatformAdmin } from '@/lib/platform-admin/auth'
import { logoutAction } from '@/lib/actions/auth'

const NAV_GROUPS = [
  {
    label: '',
    items: [{ label: 'Command center', href: '/platform-admin', icon: LayoutDashboard }],
  },
  {
    label: 'Clients',
    items: [
      { label: 'Approvals', href: '/platform-admin/approvals', icon: BadgeCheck },
      { label: 'Workspaces', href: '/platform-admin/workspaces', icon: Building2 },
    ],
  },
  {
    label: 'Business',
    items: [
      { label: 'Revenue', href: '/platform-admin/revenue', icon: IndianRupee },
      { label: 'Plans', href: '/platform-admin/plans', icon: Package },
      { label: 'Analytics', href: '/platform-admin/analytics', icon: BarChart3 },
    ],
  },
  {
    label: 'Operations',
    items: [
      { label: 'Support', href: '/platform-admin/support', icon: LifeBuoy },
      { label: 'System health', href: '/platform-admin/health', icon: Activity },
      { label: 'Communication', href: '/platform-admin/communication', icon: Radio },
      { label: 'Feature flags', href: '/platform-admin/feature-flags', icon: Flag },
    ],
  },
  {
    label: 'Governance',
    items: [
      { label: 'Security', href: '/platform-admin/security', icon: Lock },
      { label: 'Admins', href: '/platform-admin/admins', icon: Users },
      { label: 'Audit log', href: '/platform-admin/audit', icon: ScrollText },
      { label: 'Settings', href: '/platform-admin/settings', icon: Settings },
    ],
  },
]

export default async function PlatformAdminLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requirePlatformAdmin()

  return (
    <div className="flex h-screen overflow-hidden bg-zinc-950 text-zinc-100">
      <aside className="flex w-60 shrink-0 flex-col border-r border-zinc-800 bg-zinc-900">
        <div className="flex h-14 items-center gap-2 border-b border-zinc-800 px-4">
          <ShieldCheck className="h-5 w-5 text-emerald-400" />
          <span className="text-sm font-bold">Platform Console</span>
        </div>
        <nav className="flex-1 space-y-4 overflow-y-auto p-2">
          {NAV_GROUPS.map((g, gi) => (
            <div key={gi}>
              {g.label && <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-wider text-zinc-600">{g.label}</p>}
              <div className="space-y-0.5">
                {g.items.map((item) => {
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
              </div>
            </div>
          ))}
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
