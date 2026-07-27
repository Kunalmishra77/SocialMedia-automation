import { IndianRupee, TrendingUp, Wallet, Clock } from 'lucide-react'
import { requirePlatformAdmin, can } from '@/lib/platform-admin/auth'
import { notFound } from 'next/navigation'
import { getRevenue } from '@/lib/platform-admin/command-center'
import { PageHeader, Panel, Stat, Bar, inr, timeAgo } from '../ui'

const STATUS_STYLE: Record<string, string> = {
  demo_paid: 'text-emerald-400',
  unpaid: 'text-zinc-500',
}

export default async function RevenuePage() {
  const ctx = await requirePlatformAdmin()
  if (!can(ctx, 'manage_billing') && !can(ctx, 'view_usage')) notFound()
  const r = await getRevenue()
  const maxMrr = Math.max(...r.byPlan.map((p) => p.mrr), 1)
  const maxClient = Math.max(...r.topClients.map((c) => c.mrr), 1)

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader title="Revenue & billing" subtitle="Subscription revenue derived from active plans + collected payments." />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="MRR" value={inr(r.mrr)} icon={IndianRupee} tone="brand" sub="monthly recurring" />
        <Stat label="ARR" value={inr(r.arr)} icon={TrendingUp} tone="brand" sub="annual run-rate" />
        <Stat label="Collected" value={inr(r.collected)} icon={Wallet} tone="positive" />
        <Stat label="Pending" value={inr(r.pendingAmount)} icon={Clock} tone={r.pendingAmount ? 'warning' : 'default'} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="MRR by plan">
          <div className="space-y-4">
            {r.byPlan.map((p) => (
              <div key={p.plan}>
                <Bar label={`${p.plan} · ${p.active} active · ${inr(p.price)}/mo`} value={p.mrr} max={maxMrr} suffix={`${inr(p.mrr)} (${p.share}%)`} />
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Top clients by MRR">
          {r.topClients.length === 0 ? (
            <p className="text-sm text-zinc-500">No paying clients yet.</p>
          ) : (
            <div className="space-y-3">
              {r.topClients.map((c, i) => (
                <Bar key={i} label={`${c.name} · ${c.plan}`} value={c.mrr} max={maxClient} suffix={inr(c.mrr)} tone="emerald" />
              ))}
            </div>
          )}
        </Panel>
      </div>

      <Panel title="Recent payments">
        {r.payments.length === 0 ? (
          <p className="text-sm text-zinc-500">No payments recorded yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800 text-left text-xs uppercase tracking-wide text-zinc-500">
                  <th className="pb-2 font-medium">Client</th>
                  <th className="pb-2 font-medium">Amount</th>
                  <th className="pb-2 font-medium">Status</th>
                  <th className="pb-2 text-right font-medium">When</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {r.payments.map((p, i) => (
                  <tr key={i}>
                    <td className="py-2.5 text-zinc-200">{p.name}</td>
                    <td className="py-2.5 text-zinc-300">{p.amount ? inr(Number(p.amount)) : '—'}</td>
                    <td className={`py-2.5 capitalize ${STATUS_STYLE[p.status] ?? 'text-zinc-400'}`}>{p.status.replace('_', ' ')}</td>
                    <td className="py-2.5 text-right text-zinc-500">{timeAgo(p.at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <p className="text-xs text-zinc-600">
        MRR is computed from active workspaces × their plan price. When Razorpay is connected, real charges and refunds will replace demo payments here.
      </p>
    </div>
  )
}
