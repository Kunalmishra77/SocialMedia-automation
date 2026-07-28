import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Plug, ArrowRight } from 'lucide-react'
import { requirePlatformAdmin, can } from '@/lib/platform-admin/auth'
import { getIntegrations } from '@/lib/platform-admin/ops'
import { PageHeader, Panel, StatusDot, timeAgo } from '../ui'

export default async function IntegrationsPage() {
  const ctx = await requirePlatformAdmin()
  if (!can(ctx, 'view_system_health')) notFound()
  const { rows, metaLastChecked } = await getIntegrations()

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title="Integrations" subtitle="Every external service the platform depends on." />

      <Panel>
        <div className="divide-y divide-border">
          {rows.map((r) => (
            <div key={r.name} className="flex items-center justify-between py-3">
              <div className="flex items-center gap-3">
                <Plug className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium text-foreground">{r.name}</p>
                  <p className="text-xs text-muted-foreground">{r.note}{r.usage ? ` · ${r.usage}` : ''}</p>
                </div>
              </div>
              <span className="flex items-center gap-2 text-sm">
                <StatusDot state={r.configured ? 'operational' : 'down'} />
                <span className={r.configured ? 'text-emerald-400' : 'text-muted-foreground'}>{r.configured ? 'Configured' : 'Not set'}</span>
              </span>
            </div>
          ))}
        </div>
      </Panel>

      <div className="flex flex-wrap gap-3 text-sm">
        <Link href="/platform-admin/meta" className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-foreground hover:bg-muted">Meta API monitor <ArrowRight className="h-4 w-4" /></Link>
        <Link href="/platform-admin/ai" className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-foreground hover:bg-muted">AI Infrastructure <ArrowRight className="h-4 w-4" /></Link>
        <Link href="/platform-admin/health" className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-foreground hover:bg-muted">System Health <ArrowRight className="h-4 w-4" /></Link>
      </div>

      <p className="text-xs text-muted-foreground">Meta health last probed {metaLastChecked ? timeAgo(metaLastChecked) : 'never'}. Secrets are never displayed — only configured/not-set status.</p>
    </div>
  )
}
