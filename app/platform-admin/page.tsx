import Link from 'next/link'
import {
  Building2, CheckCircle2, Clock, PauseCircle, Users, MessagesSquare,
  Workflow, IndianRupee, Sparkles, Radio, BadgeCheck, ArrowRight, Bell,
} from 'lucide-react'
import { requirePlatformAdmin } from '@/lib/platform-admin/auth'
import { getCommandCenter } from '@/lib/platform-admin/command-center'
import { PageHeader, Panel, Stat, Bar, Sparkline, inr, timeAgo } from './ui'

const QUICK_ACTIONS = [
  { label: 'Add client', href: '/platform-admin/workspaces', icon: Building2 },
  { label: 'Approvals', href: '/platform-admin/approvals', icon: BadgeCheck },
  { label: 'Revenue', href: '/platform-admin/revenue', icon: IndianRupee },
  { label: 'Announce', href: '/platform-admin/communication', icon: Radio },
  { label: 'Health', href: '/platform-admin/health', icon: Sparkles },
]

const ALERT_STYLES: Record<string, string> = {
  critical: 'border-red-900/50 bg-red-950/30 text-red-300',
  warning: 'border-amber-900/50 bg-amber-950/30 text-amber-300',
  info: 'border-zinc-800 bg-zinc-900/60 text-zinc-400',
}

export default async function PlatformOverview() {
  await requirePlatformAdmin()
  const m = await getCommandCenter()
  const maxPlanMrr = Math.max(...m.planDistribution.map((p) => p.mrr), 1)

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader title="Command center" subtitle="Real-time control across every workspace, plan and integration." />

      {/* Quick actions */}
      <div className="flex flex-wrap gap-2">
        {QUICK_ACTIONS.map((a) => {
          const Icon = a.icon
          return (
            <Link key={a.href} href={a.href} className="inline-flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm font-medium text-zinc-200 transition-colors hover:border-zinc-700 hover:bg-zinc-800">
              <Icon className="h-4 w-4 text-indigo-400" />
              {a.label}
            </Link>
          )
        })}
      </div>

      {/* Alerts */}
      <div className="space-y-2">
        {m.alerts.map((a, i) => (
          <div key={i} className={`flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm ${ALERT_STYLES[a.level]}`}>
            <Bell className="h-4 w-4 shrink-0" />
            {a.text}
          </div>
        ))}
      </div>

      {/* Client KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Total clients" value={m.clients.total} icon={Building2} sub={`+${m.clients.new30d} in 30 days`} />
        <Stat label="Active" value={m.clients.active} icon={CheckCircle2} tone="positive" />
        <Stat label="Pending approval" value={m.clients.pending} icon={Clock} tone={m.clients.pending ? 'warning' : 'default'} />
        <Stat label="Suspended" value={m.clients.suspended} icon={PauseCircle} tone={m.clients.suspended ? 'critical' : 'default'} />
      </div>

      {/* Revenue KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="MRR" value={inr(m.revenue.mrr)} icon={IndianRupee} tone="brand" sub="active subscriptions" />
        <Stat label="ARR" value={inr(m.revenue.arr)} icon={IndianRupee} tone="brand" />
        <Stat label="Collected" value={inr(m.revenue.collected)} icon={CheckCircle2} tone="positive" />
        <Stat label="Total users" value={m.usage.users} icon={Users} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Growth sparkline */}
        <Panel title="New clients · 14 days" className="lg:col-span-2">
          <div className="text-indigo-400">
            <Sparkline points={m.growth.map((g) => g.count)} />
          </div>
          <div className="mt-2 flex justify-between text-xs text-zinc-500">
            <span>{m.growth[0]?.day.slice(5)}</span>
            <span>{m.clients.new7d} in last 7 days</span>
            <span>{m.growth[m.growth.length - 1]?.day.slice(5)}</span>
          </div>
        </Panel>

        {/* Platform usage */}
        <Panel title="Platform usage">
          <div className="space-y-3 text-sm">
            <Row icon={MessagesSquare} label="Messages processed" value={m.usage.messages.toLocaleString('en-IN')} />
            <Row icon={MessagesSquare} label="Messages (30d)" value={m.usage.messages30d.toLocaleString('en-IN')} />
            <Row icon={Workflow} label="Automations active" value={`${m.usage.activeAutomations}/${m.usage.automations}`} />
            <Row icon={Radio} label="Channels connected" value={m.usage.channels} />
            <Row icon={Sparkles} label="AI events (30d)" value={m.usage.aiEvents30d.toLocaleString('en-IN')} />
          </div>
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Revenue by plan */}
        <Panel title="MRR by plan">
          <div className="space-y-3">
            {m.planDistribution.map((p) => (
              <Bar key={p.plan} label={`${p.plan} · ${p.count}`} value={p.mrr} max={maxPlanMrr} suffix={inr(p.mrr)} />
            ))}
          </div>
        </Panel>

        {/* Pending approvals */}
        <Panel title="Pending approvals" right={<Link href="/platform-admin/approvals" className="text-xs text-indigo-400 hover:underline">View all</Link>}>
          {m.pendingApprovals.length === 0 ? (
            <p className="text-sm text-zinc-500">No clients awaiting approval.</p>
          ) : (
            <div className="space-y-2">
              {m.pendingApprovals.slice(0, 5).map((p) => (
                <div key={p.id} className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-950/50 px-3 py-2 text-sm">
                  <div>
                    <p className="font-medium text-zinc-200">{p.name}</p>
                    <p className="text-xs text-zinc-500">{p.plan ?? '—'} · {p.amount ? inr(Number(p.amount)) : 'unpaid'} · {timeAgo(p.submitted_at)}</p>
                  </div>
                  <Link href="/platform-admin/approvals" className="text-indigo-400 hover:text-indigo-300"><ArrowRight className="h-4 w-4" /></Link>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>

      {/* Recent activity */}
      <Panel title="Recent operator activity" right={<Link href="/platform-admin/security" className="text-xs text-indigo-400 hover:underline">Audit log</Link>}>
        {m.recentActivity.length === 0 ? (
          <p className="text-sm text-zinc-500">No recent actions.</p>
        ) : (
          <div className="divide-y divide-zinc-800">
            {m.recentActivity.map((a, i) => (
              <div key={i} className="flex items-center justify-between py-2 text-sm">
                <span className="text-zinc-300"><span className="font-mono text-xs text-indigo-400">{a.action}</span> {a.label ?? ''}</span>
                <span className="text-xs text-zinc-500">{a.email.split('@')[0]} · {timeAgo(a.at)}</span>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  )
}

function Row({ icon: Icon, label, value }: { icon: typeof Users; label: string; value: string | number }) {
  return (
    <div className="flex items-center justify-between">
      <span className="flex items-center gap-2 text-zinc-400"><Icon className="h-4 w-4 text-zinc-600" />{label}</span>
      <span className="font-semibold text-zinc-100">{value}</span>
    </div>
  )
}
