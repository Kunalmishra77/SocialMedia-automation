import { requirePlatformAdmin } from '@/lib/platform-admin/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { approveClientAction, rejectClientAction } from '@/lib/actions/onboarding'
import { planByKey } from '@/lib/plans'
import { getActivePlans } from '@/lib/plans-server'
import { platformByKey } from '@/lib/platforms'

export default async function ApprovalsPage() {
  await requirePlatformAdmin()
  const admin = createAdminClient()
  const planList = await getActivePlans()
  const planMap = Object.fromEntries(planList.map((p) => [p.key, p]))
  const { data: pending } = await admin
    .from('workspaces')
    .select('id, name, owner_email, owner_name, owner_phone, company, selected_plan, selected_platforms, payment_amount, submitted_at')
    .eq('status', 'pending_approval')
    .order('submitted_at', { ascending: true })

  // Recently activated (so admins can retrieve/share credentials if email isn't wired).
  const { data: recent } = await admin
    .from('workspaces')
    .select('id, name, onboarding_data, approved_at')
    .eq('status', 'active')
    .not('approved_at', 'is', null)
    .order('approved_at', { ascending: false })
    .limit(5)

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
          const plan = planMap[w.selected_plan ?? ''] ?? planByKey(w.selected_plan ?? '')
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
                  {w.selected_platforms && w.selected_platforms.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {(w.selected_platforms as string[]).map((pk) => {
                        const p = platformByKey(pk)
                        return <span key={pk} className="rounded-full px-2 py-0.5 text-[11px] text-white" style={{ background: p?.accent ?? '#555' }}>{p?.name ?? pk}</span>
                      })}
                    </div>
                  )}
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
                <form action={rejectClientAction}>
                  <input type="hidden" name="workspaceId" value={w.id} />
                  <button className="rounded-md border border-zinc-700 px-4 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800">
                    Reject
                  </button>
                </form>
              </div>
            </div>
          )
        })}
      </div>

      {recent && recent.some((r) => (r.onboarding_data as { activation?: unknown } | null)?.activation) && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-zinc-400">Recently activated — set-password link</h2>
          {recent.map((r) => {
            const a = (r.onboarding_data as { activation?: { email: string; setPasswordUrl: string | null } } | null)?.activation
            if (!a) return null
            return (
              <div key={r.id} className="rounded-lg border border-zinc-800 bg-zinc-950 p-4 text-sm">
                <p className="mb-2 font-medium">{r.name}</p>
                <div className="grid gap-1 text-xs text-zinc-300">
                  <span>Email: <span className="font-mono">{a.email}</span></span>
                  {a.setPasswordUrl
                    ? <span className="break-all">Set-password link: <span className="font-mono text-zinc-400">{a.setPasswordUrl}</span></span>
                    : <span className="text-amber-400">Link generation failed — ask the client to use “Forgot password?”.</span>}
                </div>
                <p className="mt-2 text-xs text-zinc-500">
                  A secure set-password email was sent. This one-time link expires — no password is stored. Share manually only if the email didn&apos;t arrive.
                </p>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
