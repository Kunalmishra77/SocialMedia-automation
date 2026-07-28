import { notFound } from 'next/navigation'
import { requirePlatformAdmin, can, PLATFORM_ROLE_PERMISSIONS, ALL_PLATFORM_PERMISSIONS, type PlatformRole } from '@/lib/platform-admin/auth'
import { listPlatformAdmins } from '@/lib/platform-admin/metrics'
import { setPlatformAdminActiveAction, setPlatformAdminRoleAction, setPlatformAdminPermissionsAction } from '@/lib/actions/platform-admins'
import { AddAdminForm } from './add-admin-form'

const ROLES: { key: PlatformRole; label: string; desc: string }[] = [
  { key: 'platform_owner', label: 'Owner', desc: 'Full control including managing other admins' },
  { key: 'platform_admin', label: 'Admin', desc: 'Everything except managing admins' },
  { key: 'platform_support', label: 'Support', desc: 'Clients, support, impersonation, audit' },
  { key: 'platform_billing', label: 'Billing', desc: 'Revenue, billing & plan changes' },
]

export default async function AdminsPage() {
  const ctx = await requirePlatformAdmin()
  if (!can(ctx, 'manage_platform_admins')) notFound()
  const admins = await listPlatformAdmins()

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Platform admins</h1>
        <p className="text-sm text-muted-foreground">Who can access this operator console.</p>
      </div>

      <AddAdminForm />

      <div className="overflow-hidden rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-card text-muted-foreground">
            <tr>
              <th className="px-4 py-2 text-left font-medium">Email</th>
              <th className="px-4 py-2 text-left font-medium">Role</th>
              <th className="px-4 py-2 text-left font-medium">2FA</th>
              <th className="px-4 py-2 text-left font-medium">Status</th>
              <th className="px-4 py-2 text-right font-medium">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border bg-background">
            {admins.map((a) => (
              <tr key={a.id}>
                <td className="px-4 py-3 text-foreground">{a.email}</td>
                <td className="px-4 py-3">
                  <form action={setPlatformAdminRoleAction} className="inline">
                    <input type="hidden" name="id" value={a.id} />
                    <select
                      name="role"
                      defaultValue={a.role}
                      className="h-8 rounded-md border border-input bg-background px-2 text-xs capitalize text-foreground"
                    >
                      {ROLES.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
                    </select>
                    <button className="ml-1 rounded-md bg-muted px-2 py-1 text-xs text-foreground hover:bg-muted">Set</button>
                  </form>
                </td>
                <td className="px-4 py-3">
                  {a.totp_enabled ? (
                    <span className="text-emerald-400">on</span>
                  ) : (
                    <span className="text-amber-400">off</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {a.is_active ? (
                    <span className="text-emerald-400">active</span>
                  ) : (
                    <span className="text-muted-foreground">disabled</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <form action={setPlatformAdminActiveAction} className="inline">
                    <input type="hidden" name="id" value={a.id} />
                    <input type="hidden" name="active" value={a.is_active ? 'false' : 'true'} />
                    <button
                      className={`rounded-md px-3 py-1 text-xs ${
                        a.is_active
                          ? 'bg-muted text-foreground hover:bg-muted'
                          : 'bg-[#ea6a24] text-white hover:brightness-110'
                      }`}
                    >
                      {a.is_active ? 'Disable' : 'Enable'}
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Granular per-admin permission overrides */}
      <div className="rounded-lg border border-border bg-card p-5">
        <h2 className="mb-1 text-sm font-semibold text-foreground">Granular permissions</h2>
        <p className="mb-3 text-xs text-muted-foreground">Role defaults are always applied (shown locked). Toggle extra grants beyond the role.</p>
        <div className="space-y-2">
          {admins.map((a) => {
            const roleDefaults = PLATFORM_ROLE_PERMISSIONS[a.role as PlatformRole] ?? []
            return (
              <details key={a.id} className="rounded-lg border border-border bg-background/50">
                <summary className="cursor-pointer px-3 py-2 text-sm text-foreground">{a.email} <span className="text-xs capitalize text-muted-foreground">· {a.role.replace('platform_', '')}</span></summary>
                <form action={setPlatformAdminPermissionsAction} className="border-t border-border p-3">
                  <input type="hidden" name="id" value={a.id} />
                  <div className="grid gap-1.5 sm:grid-cols-2">
                    {ALL_PLATFORM_PERMISSIONS.map((p) => {
                      const byRole = roleDefaults.includes(p)
                      const checked = byRole || a.permissions.includes(p)
                      return (
                        <label key={p} className={`flex items-center gap-2 text-xs ${byRole ? 'text-muted-foreground' : 'text-foreground'}`}>
                          <input type="checkbox" name={`perm_${p}`} defaultChecked={checked} disabled={byRole} className="accent-[#ea6a24]" />
                          {p.replace(/_/g, ' ')}{byRole && <span className="text-[10px] text-muted-foreground">(role)</span>}
                        </label>
                      )
                    })}
                  </div>
                  <button className="mt-3 rounded-md bg-[#ea6a24] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#ea6a24]">Save permissions</button>
                </form>
              </details>
            )
          })}
        </div>
      </div>

      {/* RBAC reference */}
      <div className="rounded-lg border border-border bg-card p-5">
        <h2 className="mb-3 text-sm font-semibold text-foreground">Role permissions</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {ROLES.map((r) => (
            <div key={r.key} className="rounded-lg border border-border bg-background/50 p-3">
              <p className="text-sm font-medium text-foreground">{r.label}</p>
              <p className="mb-2 text-xs text-muted-foreground">{r.desc}</p>
              <div className="flex flex-wrap gap-1">
                {(PLATFORM_ROLE_PERMISSIONS[r.key] ?? []).map((p) => (
                  <span key={p} className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{p.replace(/_/g, ' ')}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
