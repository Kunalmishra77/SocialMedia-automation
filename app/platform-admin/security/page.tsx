import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ShieldCheck, Eye, ScrollText, Users } from 'lucide-react'
import { requirePlatformAdmin, can } from '@/lib/platform-admin/auth'
import { listAuditLog, listPlatformAdmins } from '@/lib/platform-admin/metrics'
import { listImpersonationSessions } from '@/lib/platform-admin/command-center'
import { PageHeader, Panel, Stat, StatusDot, timeAgo } from '../ui'

export default async function SecurityPage() {
  const ctx = await requirePlatformAdmin()
  if (!can(ctx, 'view_audit_log')) notFound()

  const [audit, sessions, admins] = await Promise.all([
    listAuditLog(40),
    listImpersonationSessions(20),
    listPlatformAdmins(),
  ])
  const now = Date.now()
  const activeSessions = sessions.filter((s) => !s.ended_at && new Date(s.expires_at).getTime() > now).length
  const withTotp = admins.filter((a) => a.totp_enabled).length

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader title="Security center" subtitle="Audit trail, impersonation sessions and operator access." />

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Platform admins" value={admins.length} icon={Users} sub={`${withTotp} with 2FA`} />
        <Stat label="Active impersonations" value={activeSessions} icon={Eye} tone={activeSessions ? 'warning' : 'default'} />
        <Stat label="Audit events shown" value={audit.length} icon={ScrollText} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Operators" right={<Link href="/platform-admin/admins" className="text-xs text-indigo-400 hover:underline">Manage</Link>}>
          <div className="divide-y divide-zinc-800">
            {admins.map((a) => (
              <div key={a.id} className="flex items-center justify-between py-2.5 text-sm">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-emerald-400" />
                  <div>
                    <p className="text-zinc-200">{a.email}</p>
                    <p className="text-xs capitalize text-zinc-500">{a.role.replace('_', ' ')} · last login {timeAgo(a.last_login_at)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <StatusDot state={a.is_active ? 'operational' : 'down'} />
                  {a.totp_enabled ? <span className="text-emerald-400">2FA</span> : <span className="text-zinc-600">no 2FA</span>}
                </div>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Impersonation sessions">
          {sessions.length === 0 ? (
            <p className="text-sm text-zinc-500">No impersonation sessions recorded.</p>
          ) : (
            <div className="divide-y divide-zinc-800">
              {sessions.map((s) => {
                const active = !s.ended_at && new Date(s.expires_at).getTime() > now
                return (
                  <div key={s.id} className="flex items-center justify-between py-2.5 text-sm">
                    <div>
                      <p className="text-zinc-200">{s.workspace_name} <span className="text-xs uppercase text-zinc-500">· {s.mode}</span></p>
                      <p className="text-xs text-zinc-500">{s.reason ?? 'no reason'} · {timeAgo(s.started_at)}</p>
                    </div>
                    <span className={`text-xs ${active ? 'text-amber-400' : 'text-zinc-600'}`}>{active ? 'active' : 'ended'}</span>
                  </div>
                )
              })}
            </div>
          )}
        </Panel>
      </div>

      <Panel title="Audit log" right={<Link href="/platform-admin/audit" className="text-xs text-indigo-400 hover:underline">Full log</Link>}>
        <div className="divide-y divide-zinc-800">
          {audit.map((e) => (
            <div key={e.id} className="flex items-center justify-between py-2 text-sm">
              <span className="text-zinc-300">
                <span className="font-mono text-xs text-indigo-400">{e.action}</span>{' '}
                {e.target_label ?? ''}
              </span>
              <span className="text-xs text-zinc-500">{e.admin_email.split('@')[0]} · {timeAgo(e.occurred_at)}</span>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  )
}
