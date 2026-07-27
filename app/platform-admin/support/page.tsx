import Link from 'next/link'
import { LifeBuoy, AlertTriangle, Inbox, UserX, TimerOff } from 'lucide-react'
import { requirePlatformAdmin } from '@/lib/platform-admin/auth'
import { listTickets, getTicketStats } from '@/lib/platform-admin/command-center'
import { slaStatus } from '@/lib/support-sla'
import { PageHeader, Panel, Stat, timeAgo } from '../ui'

const PRIORITY_STYLE: Record<string, string> = {
  urgent: 'bg-red-500/15 text-red-400',
  high: 'bg-amber-500/15 text-amber-400',
  normal: 'bg-zinc-700/50 text-zinc-300',
  low: 'bg-zinc-800 text-zinc-500',
}
const STATUS_STYLE: Record<string, string> = {
  open: 'text-emerald-400',
  in_progress: 'text-indigo-400',
  waiting_client: 'text-amber-400',
  escalated: 'text-red-400',
  resolved: 'text-zinc-400',
  closed: 'text-zinc-600',
}
const FILTERS = ['all', 'open', 'in_progress', 'waiting_client', 'escalated', 'resolved', 'closed']

export default async function SupportListPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  await requirePlatformAdmin()
  const { status } = await searchParams
  const active = status && status !== 'all' ? status : undefined
  const [tickets, stats] = await Promise.all([listTickets({ status: active }), getTicketStats()])

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader title="Support" subtitle="Client tickets across every workspace." />

      <div className="grid gap-4 sm:grid-cols-5">
        <Stat label="Open" value={stats.open} icon={Inbox} tone={stats.open ? 'positive' : 'default'} />
        <Stat label="In progress" value={stats.inProgress} icon={LifeBuoy} tone="brand" />
        <Stat label="Urgent" value={stats.urgent} icon={AlertTriangle} tone={stats.urgent ? 'critical' : 'default'} />
        <Stat label="Unassigned" value={stats.unassigned} icon={UserX} tone={stats.unassigned ? 'warning' : 'default'} />
        <Stat label="SLA breached" value={stats.slaBreached} icon={TimerOff} tone={stats.slaBreached ? 'critical' : 'default'} />
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Link
            key={f}
            href={f === 'all' ? '/platform-admin/support' : `/platform-admin/support?status=${f}`}
            className={`rounded-full border px-3 py-1 text-xs font-medium capitalize transition-colors ${
              (active ?? 'all') === f ? 'border-indigo-500 bg-indigo-500/15 text-indigo-300' : 'border-zinc-800 text-zinc-400 hover:border-zinc-700'
            }`}
          >
            {f.replace('_', ' ')}
          </Link>
        ))}
      </div>

      <Panel>
        {tickets.length === 0 ? (
          <div className="py-10 text-center text-sm text-zinc-500">
            <LifeBuoy className="mx-auto mb-2 h-6 w-6 text-zinc-700" />
            No tickets{active ? ` with status "${active.replace('_', ' ')}"` : ''}.
          </div>
        ) : (
          <div className="divide-y divide-zinc-800">
            {tickets.map((t) => {
              const sla = slaStatus(t.priority, t.created_at, t.first_response_at, ['resolved', 'closed'].includes(t.status))
              return (
              <Link key={t.id} href={`/platform-admin/support/${t.id}`} className="flex items-center justify-between gap-4 py-3 transition-colors hover:bg-zinc-800/40">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-zinc-200">{t.subject}</p>
                  <p className="text-xs text-zinc-500">{t.workspace_name} · <span className="capitalize">{t.category}</span> · {timeAgo(t.updated_at)}{!t.assigned_to && ' · unassigned'}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {sla.breached && <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-[11px] font-medium text-red-400">SLA</span>}
                  {!sla.responded && !sla.breached && t.status !== 'closed' && t.status !== 'resolved' && <span className="text-[11px] text-zinc-500">{sla.label}</span>}
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium capitalize ${PRIORITY_STYLE[t.priority]}`}>{t.priority}</span>
                  <span className={`text-xs font-medium capitalize ${STATUS_STYLE[t.status]}`}>{t.status.replace('_', ' ')}</span>
                </div>
              </Link>
              )
            })}
          </div>
        )}
      </Panel>
    </div>
  )
}
