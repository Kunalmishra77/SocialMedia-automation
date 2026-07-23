import { requirePlatformAdmin, can } from '@/lib/platform-admin/auth'
import { listAuditLog } from '@/lib/platform-admin/metrics'
import { notFound } from 'next/navigation'

export default async function AuditLogPage() {
  const ctx = await requirePlatformAdmin()
  if (!can(ctx, 'view_audit_log')) notFound()
  const entries = await listAuditLog()

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Audit log</h1>
        <p className="text-sm text-zinc-400">Every sensitive platform action, newest first.</p>
      </div>

      <div className="overflow-hidden rounded-lg border border-zinc-800">
        <table className="w-full text-sm">
          <thead className="bg-zinc-900 text-zinc-400">
            <tr>
              <th className="px-4 py-2 text-left font-medium">When</th>
              <th className="px-4 py-2 text-left font-medium">Admin</th>
              <th className="px-4 py-2 text-left font-medium">Action</th>
              <th className="px-4 py-2 text-left font-medium">Target</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800 bg-zinc-950">
            {entries.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-zinc-500">
                  No actions recorded yet.
                </td>
              </tr>
            )}
            {entries.map((e) => (
              <tr key={e.id}>
                <td className="px-4 py-3 text-zinc-400">{new Date(e.occurred_at).toLocaleString()}</td>
                <td className="px-4 py-3 text-zinc-300">{e.admin_email}</td>
                <td className="px-4 py-3">
                  <code className="rounded bg-zinc-800 px-1.5 py-0.5 text-xs text-emerald-400">
                    {e.action}
                  </code>
                </td>
                <td className="px-4 py-3 text-zinc-400">{e.target_label ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
