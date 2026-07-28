import Link from 'next/link'
import {
  LayoutDashboard, Building2, ScrollText, Flag, Users, BadgeCheck,
  IndianRupee, BarChart3, Activity, Radio, Lock, LifeBuoy, Settings, Package,
  Search, FileDown, Network, CreditCard, GitBranch, Sparkles, Zap, Plug,
} from 'lucide-react'
import { requirePlatformAdmin } from '@/lib/platform-admin/auth'
import { logoutAction } from '@/lib/actions/auth'
import { BrandLogo } from '@/components/brand-logo'
import { CommandPalette } from './command-palette'

const NAV_GROUPS = [
  {
    label: '',
    items: [{ label: 'Command center', href: '/platform-admin', icon: LayoutDashboard }],
  },
  {
    label: 'Clients',
    items: [
      { label: 'Approvals', href: '/platform-admin/approvals', icon: BadgeCheck },
      { label: 'Onboarding', href: '/platform-admin/onboarding', icon: GitBranch },
      { label: 'Workspaces', href: '/platform-admin/workspaces', icon: Building2 },
    ],
  },
  {
    label: 'Business',
    items: [
      { label: 'Revenue', href: '/platform-admin/revenue', icon: IndianRupee },
      { label: 'Payments', href: '/platform-admin/payments', icon: CreditCard },
      { label: 'Plans', href: '/platform-admin/plans', icon: Package },
      { label: 'Analytics', href: '/platform-admin/analytics', icon: BarChart3 },
      { label: 'Reports', href: '/platform-admin/reports', icon: FileDown },
    ],
  },
  {
    label: 'Operations',
    items: [
      { label: 'Support', href: '/platform-admin/support', icon: LifeBuoy },
      { label: 'System health', href: '/platform-admin/health', icon: Activity },
      { label: 'Integrations', href: '/platform-admin/integrations', icon: Plug },
      { label: 'Meta API', href: '/platform-admin/meta', icon: Network },
      { label: 'AI infrastructure', href: '/platform-admin/ai', icon: Sparkles },
      { label: 'Automation engine', href: '/platform-admin/automation', icon: Zap },
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
    <div className="flex h-screen overflow-hidden bg-[#fafaf4] text-foreground">
      <CommandPalette />
      <aside className="flex w-60 shrink-0 flex-col border-r border-border bg-card">
        <div className="flex h-16 flex-col justify-center gap-0.5 border-b border-border px-4">
          <BrandLogo tone="light" size="sm" product={false} />
          <span className="pl-7 text-[10px] font-semibold uppercase tracking-[0.14em] text-primary">Platform Console</span>
        </div>
        <nav className="flex-1 space-y-4 overflow-y-auto p-2">
          {NAV_GROUPS.map((g, gi) => (
            <div key={gi}>
              {g.label && <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{g.label}</p>}
              <div className="space-y-0.5">
                {g.items.map((item) => {
                  const Icon = item.icon
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted hover:text-foreground"
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
        <div className="border-t border-border p-3 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/15 text-xs font-bold text-primary">{(ctx.email || '?').charAt(0).toUpperCase()}</span>
            <div className="min-w-0">
              <p className="truncate font-medium text-foreground">{ctx.email}</p>
              <p className="capitalize text-muted-foreground">{ctx.role.replace('_', ' ')}</p>
            </div>
          </div>
        </div>
      </aside>

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-border bg-card px-6">
          <form method="GET" action="/platform-admin/search" className="relative max-w-md flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" />
            <input
              name="q"
              placeholder="Search clients, tickets, operators…"
              className="h-8 w-full rounded-md border border-border bg-background pl-8 pr-12 text-sm text-foreground placeholder:text-muted-foreground focus:border-input focus:outline-none"
            />
            <kbd className="pointer-events-none absolute right-2 top-1.5 rounded border border-input px-1.5 py-0.5 text-[10px] text-muted-foreground">⌘K</kbd>
          </form>
          <form action={logoutAction}>
            <button type="submit" className="shrink-0 text-sm text-muted-foreground hover:text-foreground">
              Log out
            </button>
          </form>
        </header>
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  )
}
