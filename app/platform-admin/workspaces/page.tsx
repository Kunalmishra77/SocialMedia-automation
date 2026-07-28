import Link from 'next/link'
import { requirePlatformAdmin } from '@/lib/platform-admin/auth'
import { listWorkspaces } from '@/lib/platform-admin/metrics'
import { CreateClient } from './create-client'

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    active: 'bg-emerald-500/15 text-emerald-400',
    suspended: 'bg-amber-500/15 text-amber-400',
    deleted: 'bg-red-500/15 text-red-400',
  }
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs capitalize ${styles[status] ?? 'bg-muted text-foreground'}`}>
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
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Workspaces</h1>
          <p className="text-sm text-muted-foreground">{workspaces.length} shown</p>
        </div>
        <CreateClient />
      </div>

      <form className="flex gap-2">
        <input
          name="search"
          defaultValue={search ?? ''}
          placeholder="Search by name, slug, or owner email…"
          className="h-10 flex-1 rounded-md border border-input bg-card px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-emerald-600"
        />
        <button className="rounded-md bg-muted px-4 text-sm hover:bg-muted">Search</button>
      </form>

      <div className="overflow-hidden rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-card text-muted-foreground">
            <tr>
              <th className="px-4 py-2 text-left font-medium">Workspace</th>
              <th className="px-4 py-2 text-left font-medium">Plan</th>
              <th className="px-4 py-2 text-left font-medium">Status</th>
              <th className="px-4 py-2 text-left font-medium">Members</th>
              <th className="px-4 py-2 text-left font-medium">Owner</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border bg-background">
            {workspaces.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                  No workspaces found.
                </td>
              </tr>
            )}
            {workspaces.map((w) => (
              <tr key={w.id} className="hover:bg-card">
                <td className="px-4 py-3">
                  <Link
                    href={`/platform-admin/workspaces/${w.id}`}
                    className="font-medium text-emerald-400 hover:underline"
                  >
                    {w.name}
                  </Link>
                  <div className="text-xs text-muted-foreground">/{w.slug}</div>
                </td>
                <td className="px-4 py-3 capitalize text-foreground">{w.plan}</td>
                <td className="px-4 py-3"><StatusBadge status={w.status} /></td>
                <td className="px-4 py-3 text-foreground">{w.memberCount}</td>
                <td className="px-4 py-3 text-muted-foreground">{w.owner_email ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
