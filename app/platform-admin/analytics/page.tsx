import { MessagesSquare, Workflow, Sparkles, Users, Target, MessageCircle, CalendarCheck } from 'lucide-react'
import { requirePlatformAdmin } from '@/lib/platform-admin/auth'
import { getAnalytics } from '@/lib/platform-admin/command-center'
import { PageHeader, Panel, Stat, Bar } from '../ui'

export default async function AnalyticsPage() {
  await requirePlatformAdmin()
  const a = await getAnalytics()
  const maxChannel = Math.max(...a.byChannel.map((c) => c.count), 1)
  const maxMetric = Math.max(...a.ai.byMetric.map((m) => m.qty), 1)
  const maxClient = Math.max(...a.mostActiveClients.map((c) => c.messages), 1)

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader title="Analytics" subtitle="Product, platform and usage intelligence across all workspaces." />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Messages total" value={a.messages.total.toLocaleString('en-IN')} icon={MessagesSquare} />
        <Stat label="Messages (30d)" value={a.messages.last30d.toLocaleString('en-IN')} icon={MessagesSquare} tone="brand" />
        <Stat label="Automations active" value={`${a.automations.active}/${a.automations.total}`} icon={Workflow} tone="positive" />
        <Stat label="Automation runs" value={a.automations.totalRuns.toLocaleString('en-IN')} icon={Workflow} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Messages by channel">
          {a.byChannel.length === 0 ? (
            <p className="text-sm text-muted-foreground">No conversations yet.</p>
          ) : (
            <div className="space-y-3">
              {a.byChannel.map((c) => (
                <Bar key={c.channel} label={c.channel} value={c.count} max={maxChannel} tone="brand" />
              ))}
            </div>
          )}
          <div className="mt-4 flex gap-4 border-t border-border pt-3 text-sm">
            <span className="text-muted-foreground">Inbound <span className="font-semibold text-foreground">{a.messages.inbound.toLocaleString('en-IN')}</span></span>
            <span className="text-muted-foreground">Outbound <span className="font-semibold text-foreground">{a.messages.outbound.toLocaleString('en-IN')}</span></span>
          </div>
        </Panel>

        <Panel title="AI usage · last 30 days" right={<span className="text-xs text-muted-foreground">{a.ai.events30d.toLocaleString('en-IN')} events</span>}>
          {a.ai.byMetric.length === 0 ? (
            <p className="text-sm text-muted-foreground">No AI usage logged yet.</p>
          ) : (
            <div className="space-y-3">
              {a.ai.byMetric.map((m) => (
                <Bar key={m.metric} label={m.metric} value={m.qty} max={maxMetric} tone="emerald" />
              ))}
            </div>
          )}
        </Panel>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Contacts" value={a.engagement.contacts.toLocaleString('en-IN')} icon={Users} />
        <Stat label="Leads" value={a.engagement.leads.toLocaleString('en-IN')} icon={Target} />
        <Stat label="Conversations" value={a.engagement.conversations.toLocaleString('en-IN')} icon={MessageCircle} />
        <Stat label="Bookings" value={a.engagement.bookings.toLocaleString('en-IN')} icon={CalendarCheck} />
      </div>

      <Panel title="Most active clients · 30 days">
        {a.mostActiveClients.length === 0 ? (
          <p className="text-sm text-muted-foreground">No activity yet.</p>
        ) : (
          <div className="space-y-3">
            {a.mostActiveClients.map((c, i) => (
              <Bar key={i} label={c.name} value={c.messages} max={maxClient} suffix={`${c.messages} msgs`} />
            ))}
          </div>
        )}
      </Panel>
      <p className="text-xs text-muted-foreground"><Sparkles className="mr-1 inline h-3 w-3" />Sampled from the latest 5,000 messages for per-client ranking.</p>
    </div>
  )
}
