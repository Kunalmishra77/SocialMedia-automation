import { notFound } from 'next/navigation'
import Link from 'next/link'
import { requirePlatformAdmin, can } from '@/lib/platform-admin/auth'
import { getWorkspaceDetail } from '@/lib/platform-admin/metrics'
import { getClient360 } from '@/lib/platform-admin/command-center'
import {
  suspendWorkspaceAction,
  activateWorkspaceAction,
  changePlanAction,
} from '@/lib/actions/platform-admin'
import { startImpersonationAction } from '@/lib/actions/impersonation'
import { inr, timeAgo } from '../../ui'

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
  const c = await getClient360(id)

  const manageWs = can(ctx, 'manage_workspaces')
  const manageBilling = can(ctx, 'manage_billing') || manageWs
  const canImpersonate = can(ctx, 'impersonate')
  const canImpersonateFull = can(ctx, 'impersonate_full')

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

      {/* 360° — Usage */}
      <div>
        <h2 className="mb-3 text-sm font-semibold text-zinc-300">Usage (360°)</h2>
        <div className="grid gap-3 sm:grid-cols-4">
          <Metric label="Messages" value={c.usage.messages.toLocaleString('en-IN')} sub={`${c.usage.messages30d} in 30d`} />
          <Metric label="Conversations" value={c.usage.conversations} />
          <Metric label="Contacts" value={c.usage.contacts} />
          <Metric label="Leads" value={c.usage.leads} />
          <Metric label="Automations" value={c.usage.automations} />
          <Metric label="Content posts" value={c.usage.content} />
          <Metric label="AI events (30d)" value={c.usage.aiEvents30d} />
          <Metric label="Open tickets" value={c.tickets.open} sub={`${c.tickets.total} total`} />
        </div>
      </div>

      {/* Channels + Onboarding */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-5">
          <h2 className="mb-3 text-sm font-semibold text-zinc-300">Connected channels</h2>
          {c.channels.length === 0 ? (
            <p className="text-sm text-zinc-500">No channels connected.</p>
          ) : (
            <div className="space-y-2">
              {c.channels.map((ch, i) => (
                <div key={i} className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 text-zinc-300">
                    <span className={`h-2 w-2 rounded-full ${ch.is_active ? 'bg-emerald-500' : 'bg-zinc-600'}`} />
                    <span className="capitalize">{ch.channel}</span>
                    {ch.handle && <span className="text-zinc-500">@{ch.handle}</span>}
                  </span>
                  <span className="text-xs text-zinc-500">{ch.token_expires_at ? `expires ${new Date(ch.token_expires_at).toLocaleDateString()}` : 'no expiry'}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-5">
          <h2 className="mb-3 text-sm font-semibold text-zinc-300">Billing & onboarding</h2>
          <div className="space-y-2 text-sm">
            <Line label="Selected plan" value={c.payment.selected_plan ?? '—'} />
            <Line label="Payment status" value={(c.payment.status ?? 'unpaid').replace('_', ' ')} />
            <Line label="Amount" value={c.payment.amount ? inr(Number(c.payment.amount)) : '—'} />
            <Line label="Submitted" value={c.payment.submitted_at ? timeAgo(c.payment.submitted_at) : '—'} />
            <Line label="Approved" value={c.payment.approved_at ? timeAgo(c.payment.approved_at) : '—'} />
            <Line label="Last impersonation" value={c.lastImpersonation ? timeAgo(c.lastImpersonation) : 'never'} />
          </div>
        </div>
      </div>

      {/* Activity */}
      {c.activity.length > 0 && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-5">
          <h2 className="mb-3 text-sm font-semibold text-zinc-300">Recent activity</h2>
          <div className="divide-y divide-zinc-800">
            {c.activity.map((a, i) => (
              <div key={i} className="flex items-center justify-between py-2 text-sm">
                <span className="text-zinc-300"><span className="font-mono text-xs text-indigo-400">{a.action}</span> {a.label ?? ''}</span>
                <span className="text-xs text-zinc-500">{timeAgo(a.at)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

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

      {/* Impersonation */}
      {canImpersonate && (
        <div className="rounded-lg border border-red-900/40 bg-red-950/20 p-5">
          <h2 className="mb-1 text-sm font-semibold text-red-300">Impersonate (login as)</h2>
          <p className="mb-4 text-xs text-zinc-500">
            View and act inside this workspace for support. Time-limited (30 min) and audit-logged.
          </p>
          <form action={startImpersonationAction} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="workspaceId" value={ws.id} />
            <div>
              <label className="mb-1 block text-xs text-zinc-400">Mode</label>
              <select
                name="mode"
                defaultValue="read"
                className="h-10 rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100"
              >
                <option value="read">Read only</option>
                {canImpersonateFull && <option value="full">Full access</option>}
              </select>
            </div>
            <div className="flex-1">
              <label className="mb-1 block text-xs text-zinc-400">Reason</label>
              <input
                name="reason"
                placeholder="e.g. debugging support ticket #123"
                className="h-10 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100 placeholder:text-zinc-600"
              />
            </div>
            <button className="h-10 rounded-md bg-red-600 px-4 text-sm font-medium text-white hover:bg-red-500">
              Start
            </button>
          </form>
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

function Metric({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
      <p className="text-xs uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-1 text-xl font-bold text-zinc-100">{value}</p>
      {sub && <p className="text-xs text-zinc-600">{sub}</p>}
    </div>
  )
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-zinc-500">{label}</span>
      <span className="capitalize text-zinc-200">{value}</span>
    </div>
  )
}
