'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  MessagesSquare,
  Users,
  Target,
  Megaphone,
  CalendarDays,
  Workflow,
  BarChart3,
  BookOpen,
  UserCog,
  Settings,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { MembershipRole, WorkspaceMembership } from '@/lib/authz'
import { switchWorkspaceAction } from '@/lib/actions/workspace'

interface NavItem {
  label: string
  href: string
  icon: LucideIcon
  /** Hidden for the `agent` role (assignment-isolated). */
  agentVisible?: boolean
}

const NAV: NavItem[] = [
  { label: 'Dashboard', href: '/', icon: LayoutDashboard, agentVisible: true },
  { label: 'Inbox', href: '/conversations', icon: MessagesSquare, agentVisible: true },
  { label: 'Contacts', href: '/contacts', icon: Users, agentVisible: true },
  { label: 'Leads', href: '/leads', icon: Target, agentVisible: true },
  { label: 'Campaigns', href: '/campaigns', icon: Megaphone },
  { label: 'Content', href: '/content', icon: CalendarDays },
  { label: 'Automation', href: '/automation/flows', icon: Workflow },
  { label: 'Analytics', href: '/analytics', icon: BarChart3 },
  { label: 'Knowledge', href: '/knowledge-base', icon: BookOpen },
  { label: 'Team', href: '/team', icon: UserCog },
  { label: 'Settings', href: '/settings', icon: Settings },
]

export function Sidebar({
  workspaceName,
  plan,
  role,
  memberships = [],
  activeWorkspaceId,
}: {
  workspaceName: string
  plan: string
  role: MembershipRole
  memberships?: WorkspaceMembership[]
  activeWorkspaceId?: string
}) {
  const pathname = usePathname()
  const items = role === 'agent' ? NAV.filter((i) => i.agentVisible) : NAV
  const canSwitch = memberships.length > 1

  return (
    <aside className="flex h-screen w-60 shrink-0 flex-col border-r border-border bg-card">
      <div className="flex h-14 items-center gap-2 border-b border-border px-4">
        <span className="brand-gradient-text text-base font-bold">◐ Socialflow</span>
      </div>

      <div className="border-b border-border px-4 py-3">
        {canSwitch ? (
          <form action={switchWorkspaceAction}>
            <select
              name="workspaceId"
              defaultValue={activeWorkspaceId}
              onChange={(e) => e.currentTarget.form?.requestSubmit()}
              className="w-full truncate rounded-md border border-border bg-background px-2 py-1 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {memberships.map((m) => (
                <option key={m.workspaceId} value={m.workspaceId}>
                  {m.name}
                </option>
              ))}
            </select>
          </form>
        ) : (
          <p className="truncate text-sm font-semibold">{workspaceName}</p>
        )}
        <p className="mt-1 text-xs capitalize text-muted-foreground">
          {plan} plan · {role.replace('_', ' ')}
        </p>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto p-2">
        {items.map((item) => {
          const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href)
          const Icon = item.icon
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                active
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          )
        })}
      </nav>
    </aside>
  )
}
