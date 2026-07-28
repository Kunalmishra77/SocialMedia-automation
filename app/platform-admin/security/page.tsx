import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ShieldCheck, Eye, ScrollText, Users } from 'lucide-react'
import { requirePlatformAdmin, can } from '@/lib/platform-admin/auth'
import { listAuditLog, listPlatformAdmins } from '@/lib/platform-admin/metrics'
import { listImpersonationSessions, listFailedLogins } from '@/lib/platform-admin/command-center'
import { ShieldAlert } from 'lucide-react'
import { PageHeader, Panel, Stat, StatusDot, timeAgo } from '../ui'

export default async function SecurityPage() {
  const ctx = await requirePlatformAdmin()
  if (!can(ctx, 'view_audit_log')) notFound()

  const [audit, sessions, admins, logins] = await Promise.all([
    listAuditLog(40),
    listImpersonationSessions(20),
    listPlatformAdmins(),
    listFailedLogins(20),
  ])
  const now = Date.now()
  const activeSessions = sessions.filter((s) => !s.ended_at && new Date(s.expires_at).getTime() > now).length
  const withTotp = admins.filter((a) => a.totp_enabled).length

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title="Security center"
        subtitle="Audit trail, impersonation sessions and operator access."
        action={<Link href="/platform-admin/security/2fa" className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground hover:bg-muted"><ShieldAlert className="h-4 w-4" />Manage your 2FA</Link>}
      />

      <div className="grid gap-4 sm:grid-cols-4">
        <Stat label="Platform admins" value={admins.length} icon={Users} sub={`${withTotp} with 2FA`} />
        <Stat label="Active impersonations" value={activeSessions} icon={Eye} tone={activeSessions ? 'warning' : 'default'} />
        <Stat label="Failed logins (24h)" value={logins.failed24h} icon={ShieldAlert} tone={logins.failed24h > 5 ? 'critical' : logins.failed24h ? 'warning' : 'default'} />
        <Stat label="Audit events shown" value={audit.length} icon={ScrollText} />
      </div>

      {logins.rows.length > 0 && (
        <Panel title="Recent failed logins">
          <div className="divide-y divide-border">
            {logins.rows.map((l, i) => (
              <div key={i} className="flex items-center justify-between py-2 text-sm">
                <span className="text-foreground">{l.email ?? 'unknown'} <span className="text-xs text-muted-foreground">{l.ip ?? ''}</span></span>
                <span className="text-xs text-muted-foreground">{l.reason ?? 'failed'} · {timeAgo(l.attempted_at)}</span>
              </div>
            ))}
          </div>
        </Panel>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Operators" right={<Link href="/platform-admin/admins" className="text-xs text-[#ea6a24] hover:underline">Manage</Link>}>
          <div className="divide-y divide-border">
            {admins.map((a) => (
              <div key={a.id} className="flex items-center justify-between py-2.5 text-sm">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-emerald-400" />
                  <div>
                    <p className="text-foreground">{a.email}</p>
                    <p className="text-xs capitalize text-muted-foreground">{a.role.replace('_', ' ')} · last login {timeAgo(a.last_login_at)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <StatusDot state={a.is_active ? 'operational' : 'down'} />
                  {a.totp_enabled ? <span className="text-emerald-400">2FA</span> : <span className="text-muted-foreground">no 2FA</span>}
                </div>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Impersonation sessions">
          {sessions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No impersonation sessions recorded.</p>
          ) : (
            <div className="divide-y divide-border">
              {sessions.map((s) => {
                const active = !s.ended_at && new Date(s.expires_at).getTime() > now
                return (
                  <div key={s.id} className="flex items-center justify-between py-2.5 text-sm">
                    <div>
                      <p className="text-foreground">{s.workspace_name} <span className="text-xs uppercase text-muted-foreground">· {s.mode}</span></p>
                      <p className="text-xs text-muted-foreground">{s.reason ?? 'no reason'} · {timeAgo(s.started_at)}</p>
                    </div>
                    <span className={`text-xs ${active ? 'text-amber-400' : 'text-muted-foreground'}`}>{active ? 'active' : 'ended'}</span>
                  </div>
                )
              })}
            </div>
          )}
        </Panel>
      </div>

      <Panel title="Audit log" right={<Link href="/platform-admin/audit" className="text-xs text-[#ea6a24] hover:underline">Full log</Link>}>
        <div className="divide-y divide-border">
          {audit.map((e) => (
            <div key={e.id} className="flex items-center justify-between py-2 text-sm">
              <span className="text-foreground">
                <span className="font-mono text-xs text-[#ea6a24]">{e.action}</span>{' '}
                {e.target_label ?? ''}
              </span>
              <span className="text-xs text-muted-foreground">{e.admin_email.split('@')[0]} · {timeAgo(e.occurred_at)}</span>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  )
}
