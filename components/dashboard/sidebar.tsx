'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, MessagesSquare, Users, Target, Megaphone, CalendarDays,
  Workflow, BarChart3, BookOpen, Sparkles, ShoppingBag, Megaphone as AdsIcon,
  UserCog, Settings, ChevronsUpDown, LifeBuoy, CalendarCheck, Rocket, Plug,
  Activity, Wand2, type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { BrandLogo } from '@/components/brand-logo'
import type { MembershipRole, WorkspaceMembership } from '@/lib/authz'
import { switchWorkspaceAction } from '@/lib/actions/workspace'

interface NavItem {
  label: string
  href: string
  icon: LucideIcon
  agentVisible?: boolean
}
interface NavGroup {
  label: string
  items: NavItem[]
}

const GROUPS: NavGroup[] = [
  {
    label: '',
    items: [
      { label: 'Dashboard', href: '/', icon: LayoutDashboard, agentVisible: true },
      { label: 'Setup Center', href: '/setup', icon: Rocket },
      { label: 'Connected Accounts', href: '/accounts', icon: Plug },
    ],
  },
  {
    label: 'Engage',
    items: [
      { label: 'Inbox', href: '/conversations', icon: MessagesSquare, agentVisible: true },
      { label: 'Contacts', href: '/contacts', icon: Users, agentVisible: true },
      { label: 'Leads', href: '/leads', icon: Target, agentVisible: true },
      { label: 'Bookings', href: '/bookings', icon: CalendarCheck, agentVisible: true },
    ],
  },
  {
    label: 'Grow',
    items: [
      { label: 'Campaigns', href: '/campaigns', icon: Megaphone },
      { label: 'AI Studio', href: '/content/studio', icon: Wand2 },
      { label: 'Content', href: '/content', icon: CalendarDays },
      { label: 'Analytics', href: '/analytics', icon: BarChart3 },
    ],
  },
  {
    label: 'Automate',
    items: [
      { label: 'Automation', href: '/automation/flows', icon: Workflow },
      { label: 'Automation Health', href: '/automation/health', icon: Activity },
      { label: 'Knowledge', href: '/knowledge-base', icon: BookOpen },
    ],
  },
  {
    label: 'Manage',
    items: [
      { label: 'Influencers', href: '/influencers', icon: Sparkles },
      { label: 'Commerce', href: '/commerce/products', icon: ShoppingBag },
      { label: 'Ads', href: '/ads', icon: AdsIcon },
    ],
  },
  {
    label: '',
    items: [
      { label: 'Team', href: '/team', icon: UserCog },
      { label: 'Settings', href: '/settings', icon: Settings },
      { label: 'Help', href: '/help', icon: LifeBuoy, agentVisible: true },
    ],
  },
]

export function Sidebar({
  workspaceName, plan, role, memberships = [], activeWorkspaceId,
}: {
  workspaceName: string
  plan: string
  role: MembershipRole
  memberships?: WorkspaceMembership[]
  activeWorkspaceId?: string
}) {
  const pathname = usePathname()
  const canSwitch = memberships.length > 1
  const isAgent = role === 'agent'

  const filterGroup = (g: NavGroup) => ({
    ...g,
    items: isAgent ? g.items.filter((i) => i.agentVisible) : g.items,
  })
  const groups = GROUPS.map(filterGroup).filter((g) => g.items.length > 0)

  return (
    <aside className="flex h-screen w-64 shrink-0 flex-col border-r border-border bg-card">
      {/* Brand */}
      <div className="flex h-16 items-center px-5">
        <BrandLogo size="md" />
      </div>

      {/* Workspace card */}
      <div className="mx-3 mb-2 rounded-xl border border-border bg-muted/40 p-3">
        {canSwitch ? (
          <form action={switchWorkspaceAction} className="relative">
            <select
              name="workspaceId"
              defaultValue={activeWorkspaceId}
              onChange={(e) => e.currentTarget.form?.requestSubmit()}
              className="w-full cursor-pointer appearance-none truncate bg-transparent pr-5 text-sm font-semibold outline-none"
            >
              {memberships.map((m) => (
                <option key={m.workspaceId} value={m.workspaceId}>{m.name}</option>
              ))}
            </select>
            <ChevronsUpDown className="pointer-events-none absolute right-0 top-0.5 h-4 w-4 text-muted-foreground" />
          </form>
        ) : (
          <p className="truncate text-sm font-semibold">{workspaceName}</p>
        )}
        <div className="mt-1 flex items-center gap-1.5">
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">{plan}</span>
          <span className="text-[11px] capitalize text-muted-foreground">{role.replace('_', ' ')}</span>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-4 overflow-y-auto px-3 py-2">
        {groups.map((g, gi) => (
          <div key={gi}>
            {g.label && <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">{g.label}</p>}
            <div className="space-y-0.5">
              {g.items.map((item) => {
                const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href)
                const Icon = item.icon
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      'group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                      active
                        ? 'bg-primary/10 text-primary'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                    )}
                  >
                    <Icon className={cn('h-[18px] w-[18px]', active ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground')} />
                    {item.label}
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
      </nav>
    </aside>
  )
}
