import { notFound } from 'next/navigation'
import { FileDown, Users, IndianRupee, LifeBuoy, Activity } from 'lucide-react'
import { requirePlatformAdmin, can } from '@/lib/platform-admin/auth'
import { PageHeader, Panel } from '../ui'

const REPORTS = [
  { type: 'clients', label: 'Clients', desc: 'All workspaces with owner, plan, status & payment.', icon: Users },
  { type: 'revenue', label: 'Revenue', desc: 'Active subscriptions with MRR and payments.', icon: IndianRupee },
  { type: 'tickets', label: 'Support tickets', desc: 'Every ticket with category, priority, status & first-response.', icon: LifeBuoy },
  { type: 'usage', label: 'Usage', desc: 'Per-client usage metrics (messages, AI, automations).', icon: Activity },
]

export default async function ReportsPage() {
  const ctx = await requirePlatformAdmin()
  if (!can(ctx, 'view_usage')) notFound()

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title="Reports" subtitle="Export platform data as CSV." />

      <Panel>
        <div className="grid gap-3 sm:grid-cols-2">
          {REPORTS.map((r) => {
            const Icon = r.icon
            return (
              <a
                key={r.type}
                href={`/api/platform-admin/reports/${r.type}`}
                className="group flex items-start justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-950/50 p-4 transition-colors hover:border-zinc-700 hover:bg-zinc-800/40"
              >
                <div className="flex gap-3">
                  <Icon className="mt-0.5 h-5 w-5 text-indigo-400" />
                  <div>
                    <p className="text-sm font-medium text-zinc-200">{r.label}</p>
                    <p className="text-xs text-zinc-500">{r.desc}</p>
                  </div>
                </div>
                <FileDown className="h-4 w-4 shrink-0 text-zinc-600 group-hover:text-indigo-400" />
              </a>
            )
          })}
        </div>
      </Panel>

      <p className="text-xs text-zinc-600">CSV exports open in Excel / Google Sheets. Each export is audit-logged. PDF export is on the roadmap.</p>
    </div>
  )
}
