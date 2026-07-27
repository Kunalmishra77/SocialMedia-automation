import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Activity, Zap, ListChecks, Repeat, AlertTriangle, Plug } from 'lucide-react'
import { requireUser, getActiveMembership } from '@/lib/authz'
import { createAdminClient } from '@/lib/supabase/admin'
import { PageHeader } from '@/components/dashboard/page-header'
import { Card, CardContent } from '@/components/ui/card'

const DAY = 86400_000

function timeAgo(iso: string | null): string {
  if (!iso) return 'never'
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

export default async function AutomationHealthPage() {
  const user = await requireUser()
  const { active } = await getActiveMembership(user.id)
  if (!active) redirect('/workspace/new')

  const admin = createAdminClient()
  const ws = active.workspaceId
  const [flowsRes, rulesRes, seqRes, chanRes] = await Promise.all([
    admin.from('workflow_automations').select('id, name, is_active, trigger_type, run_count, last_run_at, created_at').eq('workspace_id', ws).order('is_active', { ascending: false }),
    admin.from('inbox_rules').select('id, is_active').eq('workspace_id', ws),
    admin.from('follow_up_sequences').select('id, is_active').eq('workspace_id', ws),
    admin.from('channel_accounts').select('channel, handle, is_active, token_expires_at').eq('workspace_id', ws),
  ])

  const flows = flowsRes.data ?? []
  const rules = rulesRes.data ?? []
  const seqs = seqRes.data ?? []
  const channels = chanRes.data ?? []

  // Channel token issues affect any automation depending on that channel.
  const tokenIssues = channels.filter((c) => c.is_active && c.token_expires_at && new Date(c.token_expires_at).getTime() < Date.now() + 7 * DAY)

  const activeFlows = flows.filter((f) => f.is_active)
  // "Health" per flow (honest, from what we actually track):
  function flowHealth(f: (typeof flows)[number]): { dot: string; label: string; cls: string } {
    if (!f.is_active) return { dot: 'bg-zinc-400', label: 'Paused', cls: 'text-muted-foreground' }
    if (channels.length === 0) return { dot: 'bg-amber-500', label: 'No channel connected', cls: 'text-amber-600' }
    if (!f.last_run_at && new Date(f.created_at).getTime() < Date.now() - 3 * DAY) return { dot: 'bg-amber-500', label: 'Active · no runs yet', cls: 'text-amber-600' }
    return { dot: 'bg-emerald-500', label: 'Running', cls: 'text-emerald-600' }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Automation Health" subtitle="Know whether your automations are actually running." />

      {/* Summary */}
      <div className="mb-6 grid gap-3 sm:grid-cols-4">
        <Card><CardContent className="py-4"><p className="text-xs uppercase tracking-wide text-muted-foreground">Flows active</p><p className="text-2xl font-bold">{activeFlows.length}<span className="text-base font-normal text-muted-foreground">/{flows.length}</span></p></CardContent></Card>
        <Card><CardContent className="py-4"><p className="text-xs uppercase tracking-wide text-muted-foreground">Total runs</p><p className="text-2xl font-bold">{flows.reduce((s, f) => s + (f.run_count ?? 0), 0)}</p></CardContent></Card>
        <Card><CardContent className="py-4"><p className="text-xs uppercase tracking-wide text-muted-foreground">Inbox rules</p><p className="text-2xl font-bold">{rules.filter((r) => r.is_active).length}<span className="text-base font-normal text-muted-foreground">/{rules.length}</span></p></CardContent></Card>
        <Card><CardContent className="py-4"><p className="text-xs uppercase tracking-wide text-muted-foreground">Sequences</p><p className="text-2xl font-bold">{seqs.filter((s) => s.is_active).length}<span className="text-base font-normal text-muted-foreground">/{seqs.length}</span></p></CardContent></Card>
      </div>

      {/* Channel warnings */}
      {(channels.length === 0 || tokenIssues.length > 0) && (
        <Card className="mb-6 border-amber-200 bg-amber-50">
          <CardContent className="flex items-start gap-3 py-4">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            <div className="text-sm">
              {channels.length === 0 ? (
                <p className="text-amber-800">No channel connected — automations can&apos;t run yet. <Link href="/accounts" className="font-medium underline">Connect an account →</Link></p>
              ) : (
                <p className="text-amber-800">{tokenIssues.length} channel token(s) expiring/expired — reconnect to keep automations running. <Link href="/accounts" className="font-medium underline">Review accounts →</Link></p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Flows */}
      <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-muted-foreground"><Zap className="h-4 w-4" />Workflow automations</p>
      {flows.length === 0 ? (
        <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">No automations yet. <Link href="/automation/flows" className="font-medium text-primary hover:underline">Create one →</Link></CardContent></Card>
      ) : (
        <div className="space-y-2">
          {flows.map((f) => {
            const h = flowHealth(f)
            return (
              <Card key={f.id}>
                <CardContent className="flex items-center justify-between gap-4 py-3.5">
                  <div className="flex items-center gap-3">
                    <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${h.dot}`} />
                    <div>
                      <Link href={`/automation/flows/${f.id}`} className="text-sm font-medium hover:underline">{f.name}</Link>
                      <p className="text-xs text-muted-foreground">trigger: {f.trigger_type} · last run {timeAgo(f.last_run_at)}</p>
                    </div>
                  </div>
                  <div className="text-right text-xs">
                    <p className={`font-medium ${h.cls}`}>{h.label}</p>
                    <p className="text-muted-foreground">{f.run_count ?? 0} runs</p>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Other automations */}
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <Card><CardContent className="flex items-center gap-3 py-4"><ListChecks className="h-5 w-5 text-primary" /><div><p className="text-sm font-medium">Inbox rules</p><p className="text-xs text-muted-foreground">{rules.filter((r) => r.is_active).length} active · <Link href="/automation/rules" className="text-primary hover:underline">manage</Link></p></div></CardContent></Card>
        <Card><CardContent className="flex items-center gap-3 py-4"><Repeat className="h-5 w-5 text-primary" /><div><p className="text-sm font-medium">Drip sequences</p><p className="text-xs text-muted-foreground">{seqs.filter((s) => s.is_active).length} active · <Link href="/automation/sequences" className="text-primary hover:underline">manage</Link></p></div></CardContent></Card>
      </div>

      <p className="mt-6 flex items-center gap-1.5 text-xs text-muted-foreground"><Activity className="h-3.5 w-3.5" />Per-run success/failure history is a planned enhancement; today we track active state, run count, last run, and channel health.</p>
    </div>
  )
}
