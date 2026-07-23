import Link from 'next/link'
import { Building2, Users, CheckCircle2, PauseCircle } from 'lucide-react'
import { requirePlatformAdmin } from '@/lib/platform-admin/auth'
import { getPlatformMetrics } from '@/lib/platform-admin/metrics'

function Stat({
  label,
  value,
  icon: Icon,
}: {
  label: string
  value: string | number
  icon: typeof Building2
}) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-5">
      <div className="flex items-center justify-between">
        <span className="text-sm text-zinc-400">{label}</span>
        <Icon className="h-4 w-4 text-zinc-500" />
      </div>
      <p className="mt-2 text-3xl font-bold">{value}</p>
    </div>
  )
}

export default async function PlatformOverview() {
  await requirePlatformAdmin()
  const m = await getPlatformMetrics()

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Platform overview</h1>
        <p className="text-sm text-zinc-400">Everything across every workspace.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Total workspaces" value={m.workspaces.total} icon={Building2} />
        <Stat label="Active" value={m.workspaces.active} icon={CheckCircle2} />
        <Stat label="Suspended" value={m.workspaces.suspended} icon={PauseCircle} />
        <Stat label="Total users" value={m.users} icon={Users} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-5">
          <h2 className="mb-3 text-sm font-semibold text-zinc-300">Plan distribution</h2>
          <div className="space-y-2">
            {Object.keys(m.planDistribution).length === 0 && (
              <p className="text-sm text-zinc-500">No workspaces yet.</p>
            )}
            {Object.entries(m.planDistribution).map(([plan, count]) => (
              <div key={plan} className="flex items-center justify-between text-sm">
                <span className="capitalize text-zinc-300">{plan}</span>
                <span className="font-semibold">{count}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-5">
          <h2 className="mb-3 text-sm font-semibold text-zinc-300">Growth</h2>
          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-zinc-300">New in last 7 days</span>
              <span className="font-semibold">{m.newWorkspaces7d}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-zinc-300">New in last 30 days</span>
              <span className="font-semibold">{m.newWorkspaces30d}</span>
            </div>
          </div>
        </div>
      </div>

      <Link
        href="/platform-admin/workspaces"
        className="inline-block rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500"
      >
        Manage workspaces →
      </Link>
    </div>
  )
}
