import Link from 'next/link'
import { Search, Building2, LifeBuoy, ShieldCheck, ScrollText } from 'lucide-react'
import { requirePlatformAdmin } from '@/lib/platform-admin/auth'
import { globalSearch } from '@/lib/platform-admin/command-center'
import { PageHeader, Panel } from '../ui'

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requirePlatformAdmin()
  const { q = '' } = await searchParams
  const r = await globalSearch(q)
  const empty = q.trim().length >= 2 && !r.workspaces.length && !r.tickets.length && !r.admins.length && !r.audit.length

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title="Search" subtitle="Find clients, tickets and operators across the platform." />

      <form method="GET" className="relative">
        <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-zinc-500" />
        <input
          name="q"
          defaultValue={q}
          autoFocus
          placeholder="Search name, email, company, ticket…"
          className="h-11 w-full rounded-lg border border-zinc-700 bg-zinc-950 pl-9 pr-3 text-sm text-zinc-100 placeholder:text-zinc-600"
        />
      </form>

      {q.trim().length < 2 && <p className="text-sm text-zinc-500">Type at least 2 characters.</p>}
      {empty && <p className="text-sm text-zinc-500">No matches for “{q}”.</p>}

      {r.workspaces.length > 0 && (
        <Panel title="Clients">
          <div className="divide-y divide-zinc-800">
            {r.workspaces.map((w) => (
              <Link key={w.id} href={`/platform-admin/workspaces/${w.id}`} className="flex items-center justify-between py-2.5 text-sm hover:bg-zinc-800/40">
                <span className="flex items-center gap-2 text-zinc-200"><Building2 className="h-4 w-4 text-zinc-500" />{w.name}<span className="text-xs text-zinc-500">{w.owner_email}</span></span>
                <span className="text-xs capitalize text-zinc-500">{w.plan} · {w.status}</span>
              </Link>
            ))}
          </div>
        </Panel>
      )}

      {r.tickets.length > 0 && (
        <Panel title="Tickets">
          <div className="divide-y divide-zinc-800">
            {r.tickets.map((t) => (
              <Link key={t.id} href={`/platform-admin/support/${t.id}`} className="flex items-center justify-between py-2.5 text-sm hover:bg-zinc-800/40">
                <span className="flex items-center gap-2 text-zinc-200"><LifeBuoy className="h-4 w-4 text-zinc-500" />{t.subject}<span className="text-xs text-zinc-500">{t.workspace_name}</span></span>
                <span className="text-xs capitalize text-zinc-500">{t.status.replace('_', ' ')}</span>
              </Link>
            ))}
          </div>
        </Panel>
      )}

      {r.audit.length > 0 && (
        <Panel title="Audit log">
          <div className="divide-y divide-zinc-800">
            {r.audit.map((a, i) => (
              <Link key={i} href="/platform-admin/audit" className="flex items-center justify-between py-2 text-sm hover:bg-zinc-800/40">
                <span className="flex items-center gap-2 text-zinc-300"><ScrollText className="h-4 w-4 text-zinc-500" /><span className="font-mono text-xs text-indigo-400">{a.action}</span> {a.label ?? ''}</span>
                <span className="text-xs text-zinc-500">{a.email.split('@')[0]}</span>
              </Link>
            ))}
          </div>
        </Panel>
      )}

      {r.admins.length > 0 && (
        <Panel title="Operators">
          <div className="divide-y divide-zinc-800">
            {r.admins.map((a, i) => (
              <Link key={i} href="/platform-admin/admins" className="flex items-center justify-between py-2.5 text-sm hover:bg-zinc-800/40">
                <span className="flex items-center gap-2 text-zinc-200"><ShieldCheck className="h-4 w-4 text-emerald-400" />{a.email}</span>
                <span className="text-xs capitalize text-zinc-500">{a.role.replace('platform_', '')}</span>
              </Link>
            ))}
          </div>
        </Panel>
      )}
    </div>
  )
}
