import { notFound } from 'next/navigation'
import { Database, Plug, KeyRound, Cpu, MemoryStick, ListChecks } from 'lucide-react'
import { requirePlatformAdmin, can } from '@/lib/platform-admin/auth'
import { getHealth } from '@/lib/platform-admin/command-center'
import { getServerMetrics, getQueueDepth } from '@/lib/platform-admin/infra'
import { PageHeader, Panel, Stat, StatusDot, Bar } from '../ui'

export default async function HealthPage() {
  const ctx = await requirePlatformAdmin()
  if (!can(ctx, 'view_system_health')) notFound()
  const [h, srv, queues] = await Promise.all([getHealth(), Promise.resolve(getServerMetrics()), getQueueDepth()])

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader title="System health" subtitle="Live status of the database, integrations and channel tokens." />

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Database" value={h.db.status === 'operational' ? 'Operational' : 'Down'} icon={Database} tone={h.db.status === 'operational' ? 'positive' : 'critical'} sub={`${h.db.latencyMs}ms round-trip`} />
        <Stat label="Workspaces" value={h.counts.workspaces} icon={Database} />
        <Stat label="Messages" value={h.counts.messages.toLocaleString('en-IN')} icon={Database} />
      </div>

      {/* Server (real os/process) */}
      <Panel title="Server">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <div className="mb-2 flex items-center gap-2 text-sm text-zinc-300"><Cpu className="h-4 w-4 text-zinc-500" />CPU load ({srv.cpu.cores} cores)</div>
            <Bar label={`1m load ${srv.cpu.load1}`} value={srv.cpu.loadPct} max={100} suffix={`${srv.cpu.loadPct}%`} tone={srv.cpu.loadPct > 85 ? 'amber' : 'emerald'} />
            <p className="mt-1 text-xs text-zinc-600">5m {srv.cpu.load5} · 15m {srv.cpu.load15}{srv.cpu.load1 === 0 && ' · (load avg unavailable on this OS)'}</p>
          </div>
          <div>
            <div className="mb-2 flex items-center gap-2 text-sm text-zinc-300"><MemoryStick className="h-4 w-4 text-zinc-500" />Memory</div>
            <Bar label={`Host RAM ${srv.memory.osTotalMb - srv.memory.osFreeMb}/${srv.memory.osTotalMb} MB`} value={srv.memory.osUsedPct} max={100} suffix={`${srv.memory.osUsedPct}%`} tone={srv.memory.osUsedPct > 85 ? 'amber' : 'emerald'} />
            <p className="mt-1 text-xs text-zinc-600">Process RSS {srv.memory.rssMb} MB · heap {srv.memory.heapUsedMb}/{srv.memory.heapTotalMb} MB</p>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-4 border-t border-zinc-800 pt-3 text-xs text-zinc-500">
          <span>Uptime <span className="text-zinc-300">{srv.process.uptimeH}h</span></span>
          <span>Node <span className="text-zinc-300">{srv.process.node}</span></span>
          <span>Host <span className="text-zinc-300">{srv.process.platform}</span></span>
          <span>PID <span className="text-zinc-300">{srv.process.pid}</span></span>
        </div>
      </Panel>

      {/* Queues (real DB-backed job queues) */}
      <Panel title="Job queues" right={<ListChecks className="h-4 w-4 text-zinc-600" />}>
        <div className="divide-y divide-zinc-800">
          {queues.map((q) => (
            <div key={q.name} className="flex items-center justify-between py-2.5 text-sm">
              <span className="flex items-center gap-2 text-zinc-300">
                <StatusDot state={q.tone === 'error' ? 'down' : q.tone === 'busy' ? 'warning' : 'ok'} />
                {q.name}
                <span className="text-xs text-zinc-600">{q.cron}</span>
              </span>
              <span className="text-xs">
                <span className="text-zinc-200">{q.pending} pending</span>
                {q.failed !== undefined && <span className={q.failed > 0 ? 'ml-2 text-red-400' : 'ml-2 text-zinc-600'}>{q.failed} failed</span>}
              </span>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-zinc-600">These queues are database-backed and drained by pg_cron-scheduled workers — no external broker needed.</p>
      </Panel>

      <Panel title="Integrations">
        <div className="divide-y divide-zinc-800">
          {h.integrations.map((i) => (
            <div key={i.name} className="flex items-center justify-between py-3">
              <div className="flex items-center gap-3">
                <Plug className="h-4 w-4 text-zinc-600" />
                <div>
                  <p className="text-sm font-medium text-zinc-200">{i.name}</p>
                  <p className="text-xs text-zinc-500">{i.note}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <StatusDot state={i.configured ? 'operational' : 'down'} />
                <span className={i.configured ? 'text-emerald-400' : 'text-zinc-500'}>{i.configured ? 'Configured' : 'Not set'}</span>
              </div>
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="Channel access tokens" right={<KeyRound className="h-4 w-4 text-zinc-600" />}>
        {h.tokens.length === 0 ? (
          <p className="text-sm text-zinc-500">No channel tokens with an expiry are stored.</p>
        ) : (
          <div className="divide-y divide-zinc-800">
            {h.tokens.map((t, i) => (
              <div key={i} className="flex items-center justify-between py-2.5 text-sm">
                <span className="flex items-center gap-2 text-zinc-300">
                  <StatusDot state={t.state} />
                  <span className="capitalize">{t.channel}</span>
                  {t.handle && <span className="text-zinc-500">@{t.handle}</span>}
                </span>
                <span className={t.state === 'expired' ? 'text-red-400' : t.state === 'expiring' ? 'text-amber-400' : 'text-zinc-500'}>
                  {t.state === 'expired' ? 'Expired' : `expires ${new Date(t.expires_at as string).toLocaleDateString()}`}
                </span>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <p className="text-xs text-zinc-600">
        Server + queue stats are read live from the running container; the app-level health endpoint <span className="font-mono text-zinc-500">/api/health</span> feeds Coolify&apos;s container healthcheck.
      </p>
    </div>
  )
}
