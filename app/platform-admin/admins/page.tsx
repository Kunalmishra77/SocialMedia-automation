import { notFound } from 'next/navigation'
import { requirePlatformAdmin, can } from '@/lib/platform-admin/auth'
import { listPlatformAdmins } from '@/lib/platform-admin/metrics'
import { setPlatformAdminActiveAction } from '@/lib/actions/platform-admins'
import { AddAdminForm } from './add-admin-form'

export default async function AdminsPage() {
  const ctx = await requirePlatformAdmin()
  if (!can(ctx, 'manage_platform_admins')) notFound()
  const admins = await listPlatformAdmins()

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Platform admins</h1>
        <p className="text-sm text-zinc-400">Who can access this operator console.</p>
      </div>

      <AddAdminForm />

      <div className="overflow-hidden rounded-lg border border-zinc-800">
        <table className="w-full text-sm">
          <thead className="bg-zinc-900 text-zinc-400">
            <tr>
              <th className="px-4 py-2 text-left font-medium">Email</th>
              <th className="px-4 py-2 text-left font-medium">Role</th>
              <th className="px-4 py-2 text-left font-medium">2FA</th>
              <th className="px-4 py-2 text-left font-medium">Status</th>
              <th className="px-4 py-2 text-right font-medium">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800 bg-zinc-950">
            {admins.map((a) => (
              <tr key={a.id}>
                <td className="px-4 py-3 text-zinc-200">{a.email}</td>
                <td className="px-4 py-3 capitalize text-zinc-400">{a.role.replace('platform_', '')}</td>
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
                    <span className="text-zinc-500">disabled</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <form action={setPlatformAdminActiveAction} className="inline">
                    <input type="hidden" name="id" value={a.id} />
                    <input type="hidden" name="active" value={a.is_active ? 'false' : 'true'} />
                    <button
                      className={`rounded-md px-3 py-1 text-xs ${
                        a.is_active
                          ? 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                          : 'bg-emerald-600 text-white hover:bg-emerald-500'
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
    </div>
  )
}
