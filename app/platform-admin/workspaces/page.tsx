import Link from 'next/link'
import { requirePlatformAdmin } from '@/lib/platform-admin/auth'
import { listWorkspaces } from '@/lib/platform-admin/metrics'

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    active: 'bg-emerald-500/15 text-emerald-400',
    suspended: 'bg-amber-500/15 text-amber-400',
    deleted: 'bg-red-500/15 text-red-400',
  }
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs capitalize ${styles[status] ?? 'bg-zinc-700 text-zinc-300'}`}>
      {status}
    </span>
  )
}

export default async function WorkspacesListPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string }>
}) {
  await requirePlatformAdmin()
  const { search } = await searchParams
  const workspaces = await listWorkspaces(search)

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Workspaces</h1>
        <p className="text-sm text-zinc-400">{workspaces.length} shown</p>
      </div>

      <form className="flex gap-2">
        <input
          name="search"
          defaultValue={search ?? ''}
          placeholder="Search by name, slug, or owner email…"
          className="h-10 flex-1 rounded-md border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-600"
        />
        <button className="rounded-md bg-zinc-800 px-4 text-sm hover:bg-zinc-700">Search</button>
      </form>

      <div className="overflow-hidden rounded-lg border border-zinc-800">
        <table className="w-full text-sm">
          <thead className="bg-zinc-900 text-zinc-400">
            <tr>
              <th className="px-4 py-2 text-left font-medium">Workspace</th>
              <th className="px-4 py-2 text-left font-medium">Plan</th>
              <th className="px-4 py-2 text-left font-medium">Status</th>
              <th className="px-4 py-2 text-left font-medium">Members</th>
              <th className="px-4 py-2 text-left font-medium">Owner</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800 bg-zinc-950">
            {workspaces.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-zinc-500">
                  No workspaces found.
                </td>
              </tr>
            )}
            {workspaces.map((w) => (
              <tr key={w.id} className="hover:bg-zinc-900">
                <td className="px-4 py-3">
                  <Link
                    href={`/platform-admin/workspaces/${w.id}`}
                    className="font-medium text-emerald-400 hover:underline"
                  >
                    {w.name}
                  </Link>
                  <div className="text-xs text-zinc-500">/{w.slug}</div>
                </td>
                <td className="px-4 py-3 capitalize text-zinc-300">{w.plan}</td>
                <td className="px-4 py-3"><StatusBadge status={w.status} /></td>
                <td className="px-4 py-3 text-zinc-300">{w.memberCount}</td>
                <td className="px-4 py-3 text-zinc-400">{w.owner_email ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
