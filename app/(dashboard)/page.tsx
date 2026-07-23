import { MessagesSquare, Users, Target, TrendingUp } from 'lucide-react'
import { requireUser, getMemberships } from '@/lib/authz'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

/** Instagram glyph (lucide removed brand icons for trademark reasons). */
function InstagramGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="2" y="2" width="20" height="20" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
    </svg>
  )
}

const KPIS = [
  { label: 'Open conversations', value: '0', icon: MessagesSquare },
  { label: 'Contacts', value: '0', icon: Users },
  { label: 'Active leads', value: '0', icon: Target },
  { label: 'AI handle rate', value: '—', icon: TrendingUp },
]

export default async function DashboardHome() {
  const user = await requireUser()
  const memberships = await getMemberships(user.id)
  const active = memberships[0]
  const firstName = user.user_metadata?.full_name?.split(' ')[0] ?? 'there'

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Welcome back, {firstName} 👋</h1>
        <p className="text-sm text-muted-foreground">
          Here&apos;s what&apos;s happening in <span className="font-medium">{active?.name}</span>.
        </p>
      </div>

      {/* Connect a channel CTA */}
      <Card className="overflow-hidden">
        <div className="flex flex-col items-start gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <div className="brand-gradient flex h-12 w-12 items-center justify-center rounded-xl text-white">
              <InstagramGlyph className="h-6 w-6" />
            </div>
            <div>
              <p className="font-semibold">Connect a channel</p>
              <p className="text-sm text-muted-foreground">
                Link Instagram, Facebook or Telegram to start receiving DMs, comments and messages.
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {['Instagram', 'Facebook', 'Telegram', 'LinkedIn', 'YouTube'].map((c) => (
                  <span
                    key={c}
                    className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"
                  >
                    {c}
                  </span>
                ))}
              </div>
            </div>
          </div>
          <button
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground opacity-60"
            disabled
            title="Coming in the next step"
          >
            Connect (coming soon)
          </button>
        </div>
      </Card>

      {/* KPI grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {KPIS.map((kpi) => {
          const Icon = kpi.icon
          return (
            <Card key={kpi.label}>
              <CardHeader className="flex-row items-center justify-between gap-2 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {kpi.label}
                </CardTitle>
                <Icon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">{kpi.value}</p>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <p className="text-center text-sm text-muted-foreground">
        More modules (Inbox, CRM, Campaigns…) unlock as we build them out. 🚀
      </p>
    </div>
  )
}
