import { requirePlatformAdmin } from '@/lib/platform-admin/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { approveClientAction } from '@/lib/actions/onboarding'
import { planByKey } from '@/lib/plans'

export default async function ApprovalsPage() {
  await requirePlatformAdmin()
  const admin = createAdminClient()
  const { data: pending } = await admin
    .from('workspaces')
    .select('id, name, owner_email, owner_name, owner_phone, company, selected_plan, payment_amount, submitted_at')
    .eq('status', 'pending_approval')
    .order('submitted_at', { ascending: true })

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Approvals</h1>
        <p className="text-sm text-zinc-400">
          Clients who paid and are waiting to be activated. Approving creates their account and emails
          their credentials.
        </p>
      </div>

      {(!pending || pending.length === 0) && (
        <div className="rounded-lg border border-dashed border-zinc-800 p-10 text-center text-sm text-zinc-500">
          No pending approvals. When a client completes onboarding + demo payment, they appear here.
        </div>
      )}

      <div className="space-y-3">
        {pending?.map((w) => {
          const plan = planByKey(w.selected_plan ?? '')
          return (
            <div key={w.id} className="rounded-lg border border-zinc-800 bg-zinc-900 p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-lg font-semibold">{w.name}</p>
                  <p className="text-sm text-zinc-400">
                    {w.owner_name ? `${w.owner_name} · ` : ''}{w.owner_email}
                    {w.owner_phone ? ` · ${w.owner_phone}` : ''}
                  </p>
                  {w.company && <p className="text-xs text-zinc-500">{w.company}</p>}
                </div>
                <div className="text-right">
                  <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs text-emerald-400">
                    {plan?.name ?? w.selected_plan} · ₹{Number(w.payment_amount ?? 0).toLocaleString('en-IN')}/mo · demo-paid
                  </span>
                  <p className="mt-1 text-xs text-zinc-500">
                    {w.submitted_at ? new Date(w.submitted_at).toLocaleString() : ''}
                  </p>
                </div>
              </div>
              <div className="mt-4 flex gap-2">
                <form action={approveClientAction}>
                  <input type="hidden" name="workspaceId" value={w.id} />
                  <button className="rounded-md bg-emerald-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-emerald-500">
                    Approve &amp; activate
                  </button>
                </form>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
