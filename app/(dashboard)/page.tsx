import Link from 'next/link'
import { MessagesSquare, Users, Target, TrendingUp, Plus, Megaphone, Sparkles, Plug } from 'lucide-react'
import { requireUser, getActiveMembership } from '@/lib/authz'
import { createAdminClient } from '@/lib/supabase/admin'
import { platformByKey } from '@/lib/platforms'

async function count(admin: ReturnType<typeof createAdminClient>, table: string, ws: string, extra?: (q: any) => any) {
  let q = admin.from(table).select('id', { count: 'exact', head: true }).eq('workspace_id', ws)
  if (extra) q = extra(q)
  const { count } = await q
  return count ?? 0
}

export default async function DashboardHome() {
  const user = await requireUser()
  const { active } = await getActiveMembership(user.id)
  const ws = active?.workspaceId ?? ''
  const firstName = user.user_metadata?.full_name?.split(' ')[0] ?? 'there'

  const admin = createAdminClient()
  const [convOpen, contacts, leads, messages, { data: channels }] = await Promise.all([
    count(admin, 'conversations', ws, (q) => q.in('status', ['open', 'assigned', 'pending'])),
    count(admin, 'contacts', ws),
    count(admin, 'leads', ws, (q) => q.not('stage', 'in', '("converted","lost")')),
    count(admin, 'messages', ws),
    admin.from('channel_accounts').select('channel, handle, is_active').eq('workspace_id', ws),
  ])

  const kpis = [
    { label: 'Open conversations', value: convOpen, icon: MessagesSquare, accent: 'text-rose-600 bg-rose-500/10' },
    { label: 'Contacts', value: contacts, icon: Users, accent: 'text-blue-600 bg-blue-500/10' },
    { label: 'Active leads', value: leads, icon: Target, accent: 'text-amber-600 bg-amber-500/10' },
    { label: 'Messages', value: messages, icon: TrendingUp, accent: 'text-emerald-600 bg-emerald-500/10' },
  ]
  const actions = [
    { label: 'Connect a channel', href: '/settings/channels', icon: Plug },
    { label: 'New campaign', href: '/campaigns', icon: Megaphone },
    { label: 'Add contact', href: '/contacts', icon: Plus },
    { label: 'AI settings', href: '/knowledge-base', icon: Sparkles },
  ]

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Welcome back, {firstName} 👋</h1>
        <p className="text-sm text-muted-foreground">
          Here&apos;s what&apos;s happening in <span className="font-medium">{active?.name}</span>.
        </p>
      </div>

      {/* Connected channels */}
      <div className="rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-card)]">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-semibold">Connected channels</p>
          <Link href="/settings/channels" className="text-xs font-medium text-primary hover:underline">Manage →</Link>
        </div>
        {channels && channels.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {channels.map((c, i) => {
              const p = platformByKey(c.channel)
              return (
                <span key={i} className="flex items-center gap-2 rounded-full border border-border bg-muted/40 px-3 py-1 text-sm">
                  <span className="h-2 w-2 rounded-full" style={{ background: c.is_active ? (p?.accent ?? '#10b981') : '#9ca3af' }} />
                  {p?.name ?? c.channel}{c.handle ? ` · @${c.handle}` : ''}
                </span>
              )
            })}
          </div>
        ) : (
          <div className="flex items-center justify-between rounded-xl bg-muted/30 p-4">
            <p className="text-sm text-muted-foreground">No channels connected yet. Connect Instagram or Telegram to start automating.</p>
            <Link href="/settings/channels" className="shrink-0 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:brightness-110">Connect</Link>
          </div>
        )}
      </div>

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((k) => {
          const Icon = k.icon
          return (
            <div key={k.label} className="rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-card)]">
              <div className={`mb-3 flex h-10 w-10 items-center justify-center rounded-xl ${k.accent}`}>
                <Icon className="h-5 w-5" />
              </div>
              <p className="text-3xl font-bold">{k.value.toLocaleString('en-IN')}</p>
              <p className="text-sm text-muted-foreground">{k.label}</p>
            </div>
          )
        })}
      </div>

      {/* Quick actions */}
      <div>
        <p className="mb-3 text-sm font-semibold">Quick actions</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {actions.map((a) => {
            const Icon = a.icon
            return (
              <Link key={a.label} href={a.href} className="group flex items-center gap-3 rounded-xl border border-border bg-card p-4 shadow-[var(--shadow-card)] transition-all hover:border-primary/40 hover:shadow-[var(--shadow-elevated)]">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                  <Icon className="h-[18px] w-[18px]" />
                </span>
                <span className="text-sm font-medium">{a.label}</span>
              </Link>
            )
          })}
        </div>
      </div>
    </div>
  )
}
