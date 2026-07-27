import { redirect } from 'next/navigation'
import { requireUser, getActiveMembership } from '@/lib/authz'
import { createAdminClient } from '@/lib/supabase/admin'
import { changePlanAction } from '@/lib/actions/billing'
import { getActivePlans } from '@/lib/plans-server'
import { planLimits } from '@/lib/plan-features'
import { getMonthlyAiUsage } from '@/lib/usage'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { PageHeader } from '@/components/dashboard/page-header'

export default async function BillingPage() {
  const user = await requireUser()
  const { active } = await getActiveMembership(user.id)
  if (!active) redirect('/workspace/new')

  const admin = createAdminClient()
  const [{ data: ws }, msgCount] = await Promise.all([
    admin.from('workspaces').select('plan, payment_amount, next_billing_date, subscription_status').eq('id', active.workspaceId).single(),
    admin.from('messages').select('id', { count: 'exact', head: true })
      .eq('workspace_id', active.workspaceId)
      .gte('created_at', new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString())
      .then((r) => r.count ?? 0),
  ])
  const plans = await getActivePlans()
  const aiUsage = await getMonthlyAiUsage(admin, active.workspaceId)
  const currentPlan = ws?.plan ?? 'free'
  const limits = planLimits(currentPlan)
  const msgPct = limits.maxMessages > 0 ? Math.min(100, Math.round((msgCount / limits.maxMessages) * 100)) : 0

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Billing & Subscription" subtitle="Manage your plan and see usage." />

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Current plan
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold uppercase text-primary">{currentPlan}</span>
          </CardTitle>
          <CardDescription>
            {ws?.payment_amount ? `₹${Number(ws.payment_amount).toLocaleString('en-IN')}/mo` : 'Free'} · {ws?.subscription_status ?? 'active'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-1">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Messages this month</span>
              <span className="font-medium">{msgCount.toLocaleString('en-IN')} / {limits.maxMessages.toLocaleString('en-IN')}</span>
            </div>
            <div className="h-2 rounded-full bg-muted">
              <div className="h-2 rounded-full bg-primary" style={{ width: `${msgPct}%` }} />
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between border-t pt-3 text-sm">
            <span className="text-muted-foreground">AI events this month</span>
            <span className="font-medium">{aiUsage.toLocaleString('en-IN')}</span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">AI replies + embeddings powering your chatbot &amp; automations.</p>
        </CardContent>
      </Card>

      <p className="mb-3 text-sm font-semibold">Change plan</p>
      <div className="grid gap-4 sm:grid-cols-3">
        {plans.map((p) => {
          const isCurrent = p.key === currentPlan
          return (
            <div key={p.key} className={`rounded-xl border p-4 ${p.highlight ? 'border-primary' : 'border-border'} bg-card shadow-[var(--shadow-card)]`}>
              <p className="font-semibold">{p.name}</p>
              <p className="mt-1 text-2xl font-bold">₹{p.price.toLocaleString('en-IN')}<span className="text-sm font-normal text-muted-foreground">/mo</span></p>
              <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
                {p.features.slice(0, 4).map((f) => <li key={f}>• {f}</li>)}
              </ul>
              {isCurrent ? (
                <div className="mt-4 rounded-md bg-muted px-3 py-1.5 text-center text-xs font-medium text-muted-foreground">Current plan</div>
              ) : (
                <form action={changePlanAction} className="mt-4">
                  <input type="hidden" name="plan" value={p.key} />
                  <button className="w-full rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:brightness-110">
                    Switch to {p.name}
                  </button>
                </form>
              )}
            </div>
          )
        })}
      </div>
      <p className="mt-4 text-center text-xs text-muted-foreground">Plan changes are instant (demo). Real gateway billing activates with Razorpay keys.</p>
    </div>
  )
}
