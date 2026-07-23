import { notFound } from 'next/navigation'
import Link from 'next/link'
import { requirePlatformAdmin, can } from '@/lib/platform-admin/auth'
import { getWorkspaceDetail } from '@/lib/platform-admin/metrics'
import {
  suspendWorkspaceAction,
  activateWorkspaceAction,
  changePlanAction,
} from '@/lib/actions/platform-admin'

const PLANS = ['free', 'starter', 'pro', 'enterprise']

export default async function WorkspaceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const ctx = await requirePlatformAdmin()
  const { id } = await params
  const ws = await getWorkspaceDetail(id)
  if (!ws) notFound()

  const manageWs = can(ctx, 'manage_workspaces')
  const manageBilling = can(ctx, 'manage_billing') || manageWs

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link href="/platform-admin/workspaces" className="text-sm text-emerald-400 hover:underline">
          ← All workspaces
        </Link>
        <h1 className="mt-1 text-2xl font-bold">{ws.name}</h1>
        <p className="text-sm text-zinc-400">
          /{ws.slug} · <span className="capitalize">{ws.plan}</span> plan ·{' '}
          <span className="capitalize">{ws.status}</span>
        </p>
      </div>

      {ws.status === 'suspended' && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
          Suspended{ws.suspended_reason ? ` — ${ws.suspended_reason}` : ''}.
        </div>
      )}

      {/* Info */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Info label="Owner email" value={ws.owner_email ?? '—'} />
        <Info label="Industry" value={ws.industry ?? '—'} />
        <Info label="Members" value={String(ws.memberCount)} />
        <Info label="Created" value={new Date(ws.created_at).toLocaleDateString()} />
      </div>

      {/* Members */}
      <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-5">
        <h2 className="mb-3 text-sm font-semibold text-zinc-300">Team</h2>
        <div className="space-y-2">
          {ws.members.map((m, i) => (
            <div key={i} className="flex items-center justify-between text-sm">
              <span className="text-zinc-300">{m.email}</span>
              <span className="capitalize text-zinc-500">{m.role.replace('_', ' ')}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Actions */}
      {(manageWs || manageBilling) && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-5">
          <h2 className="mb-4 text-sm font-semibold text-zinc-300">Actions</h2>
          <div className="space-y-5">
            {manageBilling && (
              <form action={changePlanAction} className="flex items-end gap-2">
                <input type="hidden" name="workspaceId" value={ws.id} />
                <div className="flex-1">
                  <label className="mb-1 block text-xs text-zinc-400">Change plan</label>
                  <select
                    name="plan"
                    defaultValue={ws.plan}
                    className="h-10 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100"
                  >
                    {PLANS.map((p) => (
                      <option key={p} value={p} className="capitalize">
                        {p}
                      </option>
                    ))}
                  </select>
                </div>
                <button className="h-10 rounded-md bg-zinc-700 px-4 text-sm hover:bg-zinc-600">
                  Update
                </button>
              </form>
            )}

            {manageWs &&
              (ws.status === 'active' ? (
                <form action={suspendWorkspaceAction} className="flex items-end gap-2">
                  <input type="hidden" name="workspaceId" value={ws.id} />
                  <div className="flex-1">
                    <label className="mb-1 block text-xs text-zinc-400">Suspend (reason)</label>
                    <input
                      name="reason"
                      placeholder="e.g. non-payment, ToS violation"
                      className="h-10 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100 placeholder:text-zinc-600"
                    />
                  </div>
                  <button className="h-10 rounded-md bg-amber-600 px-4 text-sm font-medium text-white hover:bg-amber-500">
                    Suspend
                  </button>
                </form>
              ) : (
                <form action={activateWorkspaceAction}>
                  <input type="hidden" name="workspaceId" value={ws.id} />
                  <button className="h-10 rounded-md bg-emerald-600 px-4 text-sm font-medium text-white hover:bg-emerald-500">
                    Reactivate workspace
                  </button>
                </form>
              ))}
          </div>
        </div>
      )}
    </div>
  )
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className="mt-1 text-sm text-zinc-200">{value}</p>
    </div>
  )
}
