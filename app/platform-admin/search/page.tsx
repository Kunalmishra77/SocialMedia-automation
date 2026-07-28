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
        <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
        <input
          name="q"
          defaultValue={q}
          autoFocus
          placeholder="Search name, email, company, ticket…"
          className="h-11 w-full rounded-lg border border-input bg-background pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground"
        />
      </form>

      {q.trim().length < 2 && <p className="text-sm text-muted-foreground">Type at least 2 characters.</p>}
      {empty && <p className="text-sm text-muted-foreground">No matches for “{q}”.</p>}

      {r.workspaces.length > 0 && (
        <Panel title="Clients">
          <div className="divide-y divide-border">
            {r.workspaces.map((w) => (
              <Link key={w.id} href={`/platform-admin/workspaces/${w.id}`} className="flex items-center justify-between py-2.5 text-sm hover:bg-muted/40">
                <span className="flex items-center gap-2 text-foreground"><Building2 className="h-4 w-4 text-muted-foreground" />{w.name}<span className="text-xs text-muted-foreground">{w.owner_email}</span></span>
                <span className="text-xs capitalize text-muted-foreground">{w.plan} · {w.status}</span>
              </Link>
            ))}
          </div>
        </Panel>
      )}

      {r.tickets.length > 0 && (
        <Panel title="Tickets">
          <div className="divide-y divide-border">
            {r.tickets.map((t) => (
              <Link key={t.id} href={`/platform-admin/support/${t.id}`} className="flex items-center justify-between py-2.5 text-sm hover:bg-muted/40">
                <span className="flex items-center gap-2 text-foreground"><LifeBuoy className="h-4 w-4 text-muted-foreground" />{t.subject}<span className="text-xs text-muted-foreground">{t.workspace_name}</span></span>
                <span className="text-xs capitalize text-muted-foreground">{t.status.replace('_', ' ')}</span>
              </Link>
            ))}
          </div>
        </Panel>
      )}

      {r.audit.length > 0 && (
        <Panel title="Audit log">
          <div className="divide-y divide-border">
            {r.audit.map((a, i) => (
              <Link key={i} href="/platform-admin/audit" className="flex items-center justify-between py-2 text-sm hover:bg-muted/40">
                <span className="flex items-center gap-2 text-foreground"><ScrollText className="h-4 w-4 text-muted-foreground" /><span className="font-mono text-xs text-[#ea6a24]">{a.action}</span> {a.label ?? ''}</span>
                <span className="text-xs text-muted-foreground">{a.email.split('@')[0]}</span>
              </Link>
            ))}
          </div>
        </Panel>
      )}

      {r.admins.length > 0 && (
        <Panel title="Operators">
          <div className="divide-y divide-border">
            {r.admins.map((a, i) => (
              <Link key={i} href="/platform-admin/admins" className="flex items-center justify-between py-2.5 text-sm hover:bg-muted/40">
                <span className="flex items-center gap-2 text-foreground"><ShieldCheck className="h-4 w-4 text-emerald-400" />{a.email}</span>
                <span className="text-xs capitalize text-muted-foreground">{a.role.replace('platform_', '')}</span>
              </Link>
            ))}
          </div>
        </Panel>
      )}
    </div>
  )
}
