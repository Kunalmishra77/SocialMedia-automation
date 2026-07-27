import { notFound } from 'next/navigation'
import { Database, Plug, KeyRound } from 'lucide-react'
import { requirePlatformAdmin, can } from '@/lib/platform-admin/auth'
import { getHealth } from '@/lib/platform-admin/command-center'
import { PageHeader, Panel, Stat, StatusDot } from '../ui'

export default async function HealthPage() {
  const ctx = await requirePlatformAdmin()
  if (!can(ctx, 'view_system_health')) notFound()
  const h = await getHealth()

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader title="System health" subtitle="Live status of the database, integrations and channel tokens." />

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Database" value={h.db.status === 'operational' ? 'Operational' : 'Down'} icon={Database} tone={h.db.status === 'operational' ? 'positive' : 'critical'} sub={`${h.db.latencyMs}ms round-trip`} />
        <Stat label="Workspaces" value={h.counts.workspaces} icon={Database} />
        <Stat label="Messages" value={h.counts.messages.toLocaleString('en-IN')} icon={Database} />
      </div>

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
        Server CPU/memory and queue depth are managed by Coolify; the app-level health endpoint <span className="font-mono text-zinc-500">/api/health</span> feeds the container healthcheck.
      </p>
    </div>
  )
}
