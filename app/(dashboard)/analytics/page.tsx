import { redirect } from 'next/navigation'
import { requireUser, getActiveMembership } from '@/lib/authz'
import { createAdminClient } from '@/lib/supabase/admin'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

async function count(admin: ReturnType<typeof createAdminClient>, table: string, workspaceId: string, extra?: (q: any) => any) {
  let q = admin.from(table).select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId)
  if (extra) q = extra(q)
  const { count } = await q
  return count ?? 0
}

export default async function AnalyticsPage() {
  const user = await requireUser()
  const { active } = await getActiveMembership(user.id)
  if (!active) redirect('/workspace/new')
  if (active.role === 'agent') redirect('/')
  const ws = active.workspaceId

  const admin = createAdminClient()
  const [contacts, convOpen, convResolved, messages, campaignsSent] = await Promise.all([
    count(admin, 'contacts', ws),
    count(admin, 'conversations', ws, (q) => q.in('status', ['open', 'assigned', 'pending'])),
    count(admin, 'conversations', ws, (q) => q.eq('status', 'resolved')),
    count(admin, 'messages', ws),
    count(admin, 'campaign_recipients', ws, (q) => q.eq('status', 'sent')),
  ])

  // Leads by stage
  const { data: leads } = await admin.from('leads').select('stage, value').eq('workspace_id', ws)
  const stages = ['new', 'contacted', 'follow_up', 'interested', 'converted', 'lost']
  const byStage = stages.map((s) => ({ stage: s, count: (leads ?? []).filter((l) => l.stage === s).length }))
  const maxStage = Math.max(1, ...byStage.map((s) => s.count))
  const pipelineValue = (leads ?? [])
    .filter((l) => !['converted', 'lost'].includes(l.stage))
    .reduce((sum, l) => sum + (Number(l.value) || 0), 0)

  const kpis = [
    { label: 'Contacts', value: contacts },
    { label: 'Open conversations', value: convOpen },
    { label: 'Resolved', value: convResolved },
    { label: 'Messages', value: messages },
    { label: 'Campaign sends', value: campaignsSent },
    { label: 'Open pipeline', value: `₹${pipelineValue.toLocaleString('en-IN')}` },
  ]

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Analytics</h1>
        <p className="text-sm text-muted-foreground">A live snapshot of {active.name}.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {kpis.map((k) => (
          <Card key={k.label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{k.label}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{k.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Lead pipeline</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {byStage.map((s) => (
            <div key={s.stage} className="flex items-center gap-3">
              <span className="w-24 shrink-0 text-sm capitalize text-muted-foreground">
                {s.stage.replace('_', ' ')}
              </span>
              <div className="h-6 flex-1 rounded bg-muted">
                <div
                  className="h-6 rounded bg-primary/70"
                  style={{ width: `${(s.count / maxStage) * 100}%` }}
                />
              </div>
              <span className="w-8 text-right text-sm font-medium">{s.count}</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
