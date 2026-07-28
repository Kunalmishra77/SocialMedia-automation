import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Wallet, Clock, CheckCircle2, CreditCard } from 'lucide-react'
import { requirePlatformAdmin, can } from '@/lib/platform-admin/auth'
import { getPayments } from '@/lib/platform-admin/command-center'
import { PageHeader, Panel, Stat, inr, timeAgo } from '../ui'

const STATUS_STYLE: Record<string, string> = {
  success: 'text-emerald-400',
  pending: 'text-amber-400',
  unpaid: 'text-muted-foreground',
}
const FILTERS = ['all', 'success', 'pending']

export default async function PaymentsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const ctx = await requirePlatformAdmin()
  if (!can(ctx, 'manage_billing') && !can(ctx, 'view_usage')) notFound()
  const { status } = await searchParams
  const active = status && status !== 'all' ? status : undefined
  const p = await getPayments(active)

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader title="Payments" subtitle="Every transaction across the platform. Provider-agnostic." />

      <div className="grid gap-4 sm:grid-cols-4">
        <Stat label="Collected" value={inr(p.collected)} icon={Wallet} tone="positive" />
        <Stat label="Pending" value={inr(p.pendingAmount)} icon={Clock} tone={p.pendingAmount ? 'warning' : 'default'} />
        <Stat label="Successful" value={p.successCount} icon={CheckCircle2} tone="positive" />
        <Stat label="Awaiting" value={p.pendingCount} icon={Clock} />
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Link
            key={f}
            href={f === 'all' ? '/platform-admin/payments' : `/platform-admin/payments?status=${f}`}
            className={`rounded-full border px-3 py-1 text-xs font-medium capitalize transition-colors ${
              (active ?? 'all') === f ? 'border-[#ea6a24] bg-[#ea6a24]/15 text-[#ea6a24]' : 'border-border text-muted-foreground hover:border-input'
            }`}
          >
            {f}
          </Link>
        ))}
      </div>

      <Panel>
        {p.transactions.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            <CreditCard className="mx-auto mb-2 h-6 w-6 text-muted-foreground/50" />
            No transactions{active ? ` (${active})` : ''} yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="pb-2 font-medium">Client</th>
                  <th className="pb-2 font-medium">Plan</th>
                  <th className="pb-2 font-medium">Amount</th>
                  <th className="pb-2 font-medium">Provider</th>
                  <th className="pb-2 font-medium">Status</th>
                  <th className="pb-2 text-right font-medium">When</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {p.transactions.map((t, i) => (
                  <tr key={i}>
                    <td className="py-2.5 text-foreground">{t.name}</td>
                    <td className="py-2.5 capitalize text-muted-foreground">{t.plan ?? '—'}</td>
                    <td className="py-2.5 text-foreground">{t.amount ? inr(Number(t.amount)) : '—'}</td>
                    <td className="py-2.5 capitalize text-muted-foreground">{t.provider}</td>
                    <td className={`py-2.5 capitalize ${STATUS_STYLE[t.status] ?? 'text-muted-foreground'}`}>{t.status}</td>
                    <td className="py-2.5 text-right text-muted-foreground">{timeAgo(t.at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <p className="text-xs text-muted-foreground">
        Payments are derived from each workspace&apos;s recorded transaction. When Razorpay is connected, live charges, failures and refunds will appear here with their gateway transaction IDs.
      </p>
    </div>
  )
}
