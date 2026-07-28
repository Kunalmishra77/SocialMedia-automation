import { notFound } from 'next/navigation'
import { Sparkles, Cpu, Layers, Building2 } from 'lucide-react'
import { requirePlatformAdmin, can } from '@/lib/platform-admin/auth'
import { getAiInfra } from '@/lib/platform-admin/ops'
import { PageHeader, Panel, Stat, Bar, StatusDot } from '../ui'

export default async function AiInfraPage() {
  const ctx = await requirePlatformAdmin()
  if (!can(ctx, 'view_system_health') && !can(ctx, 'view_usage')) notFound()
  const a = await getAiInfra()
  const maxMetric = Math.max(...a.byMetric.map((m) => m.qty), 1)
  const maxWs = Math.max(...a.topWorkspaces.map((w) => w.qty), 1)

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader title="AI Infrastructure" subtitle="AI providers, models and platform-wide usage." />

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="AI events (30d)" value={a.events30d.toLocaleString('en-IN')} icon={Sparkles} tone="brand" />
        <Stat label="Default model" value={a.defaultModel} icon={Cpu} />
        <Stat label="Fallback model" value={a.fallbackModel} icon={Layers} />
      </div>

      <Panel title="Providers">
        <div className="divide-y divide-border">
          {a.providers.map((p) => (
            <div key={p.name} className="flex items-center justify-between py-3 text-sm">
              <span className="flex items-center gap-2 text-foreground"><Cpu className="h-4 w-4 text-muted-foreground" />{p.name}</span>
              <span className="flex items-center gap-2">
                <StatusDot state={p.configured ? 'operational' : 'down'} />
                <span className={p.configured ? 'text-emerald-400' : 'text-muted-foreground'}>{p.configured ? 'Configured' : 'Not set'}</span>
              </span>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">Requests use the default model, then fall back to OpenRouter free models on failure. Token/cost accounting requires provider billing APIs (not yet wired) — event counts shown instead of fabricated costs.</p>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Usage by type · 30 days">
          {a.byMetric.length === 0 ? (
            <p className="text-sm text-muted-foreground">No AI usage logged yet.</p>
          ) : (
            <div className="space-y-3">
              {a.byMetric.map((m) => <Bar key={m.metric} label={m.metric} value={m.qty} max={maxMetric} tone="brand" />)}
            </div>
          )}
        </Panel>
        <Panel title="Top consumers · 30 days" right={<Building2 className="h-4 w-4 text-muted-foreground" />}>
          {a.topWorkspaces.length === 0 ? (
            <p className="text-sm text-muted-foreground">No usage yet.</p>
          ) : (
            <div className="space-y-3">
              {a.topWorkspaces.map((w, i) => <Bar key={i} label={w.name} value={w.qty} max={maxWs} suffix={w.qty.toLocaleString('en-IN')} tone="emerald" />)}
            </div>
          )}
        </Panel>
      </div>
    </div>
  )
}
