import { notFound } from 'next/navigation'
import { Zap, ListChecks, Repeat, AlertTriangle } from 'lucide-react'
import { requirePlatformAdmin, can } from '@/lib/platform-admin/auth'
import { getAutomationEngine } from '@/lib/platform-admin/ops'
import { PageHeader, Panel, Stat, StatusDot, timeAgo } from '../ui'

export default async function AutomationEnginePage() {
  const ctx = await requirePlatformAdmin()
  if (!can(ctx, 'view_system_health')) notFound()
  const e = await getAutomationEngine()

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader title="Automation Engine" subtitle="Platform-wide automation health and job queues." />

      <div className="grid gap-4 sm:grid-cols-4">
        <Stat label="Flows active" value={`${e.flows.active}/${e.flows.total}`} icon={Zap} tone="positive" />
        <Stat label="Total runs" value={e.flows.totalRuns.toLocaleString('en-IN')} icon={Zap} />
        <Stat label="Active but no runs" value={e.flows.neverRun} icon={AlertTriangle} tone={e.flows.neverRun ? 'warning' : 'default'} />
        <Stat label="Rules · sequences" value={`${e.rules.active} · ${e.sequences.active}`} icon={ListChecks} />
      </div>

      {/* Queues */}
      <Panel title="Job queues" right={<Repeat className="h-4 w-4 text-zinc-600" />}>
        <div className="divide-y divide-zinc-800">
          {e.queues.map((q) => (
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
        <p className="mt-3 text-xs text-zinc-600">Queues are DB-backed and drained by pg_cron workers. Retries are idempotent (dedup on external message id) so re-runs never double-send.</p>
      </Panel>

      {/* Recent flow activity */}
      <Panel title="Recent flow activity">
        {e.recent.length === 0 ? (
          <p className="text-sm text-zinc-500">No automations yet.</p>
        ) : (
          <div className="divide-y divide-zinc-800">
            {e.recent.map((f, i) => (
              <div key={i} className="flex items-center justify-between py-2.5 text-sm">
                <span className="flex items-center gap-2 text-zinc-300">
                  <StatusDot state={f.is_active ? 'operational' : 'down'} />
                  {f.name}
                  <span className="text-xs text-zinc-600">{f.workspace}</span>
                </span>
                <span className="text-xs text-zinc-500">{f.run_count} runs · last {timeAgo(f.last_run_at)}</span>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  )
}
