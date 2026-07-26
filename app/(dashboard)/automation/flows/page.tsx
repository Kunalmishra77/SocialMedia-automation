import { redirect } from 'next/navigation'
import { requireUser, getActiveMembership } from '@/lib/authz'
import { createAdminClient } from '@/lib/supabase/admin'
import { activateTemplateAction, toggleWorkflowAction, deleteWorkflowAction } from '@/lib/actions/workflows'
import { WORKFLOW_TEMPLATES } from '@/lib/workflow-templates'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export default async function AutomationPage() {
  const user = await requireUser()
  const { active } = await getActiveMembership(user.id)
  if (!active) redirect('/workspace/new')
  if (active.role === 'agent') redirect('/')

  const admin = createAdminClient()
  const { data: workflows } = await admin
    .from('workflow_automations')
    .select('id, name, trigger_type, is_active, run_count')
    .eq('workspace_id', active.workspaceId)
    .order('created_at', { ascending: false })

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Automation</h1>
        <p className="text-sm text-muted-foreground">
          Event-driven workflows — trigger → action, running in the background.
        </p>
        <div className="mt-2 flex gap-3 text-sm">
          <span className="font-medium text-primary">Workflows</span>
          <a href="/automation/rules" className="text-muted-foreground hover:text-foreground hover:underline">Inbox rules →</a>
        </div>
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold text-muted-foreground">Your workflows</h2>
        <div className="space-y-2">
          {(!workflows || workflows.length === 0) && (
            <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              No workflows yet. Activate a template below to get started.
            </p>
          )}
          {workflows?.map((w) => (
            <div key={w.id} className="flex items-center justify-between rounded-lg border border-border bg-card p-4">
              <div>
                <p className="text-sm font-medium">{w.name}</p>
                <p className="text-xs text-muted-foreground">
                  Trigger: {w.trigger_type.replace(/_/g, ' ')} · {w.run_count} runs
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-xs ${w.is_active ? 'bg-emerald-500/15 text-emerald-600' : 'bg-muted text-muted-foreground'}`}>
                  {w.is_active ? 'Active' : 'Paused'}
                </span>
                <form action={toggleWorkflowAction}>
                  <input type="hidden" name="id" value={w.id} />
                  <input type="hidden" name="is_active" value={w.is_active ? 'false' : 'true'} />
                  <button className="rounded-md border border-input px-2 py-1 text-xs hover:bg-muted">
                    {w.is_active ? 'Pause' : 'Activate'}
                  </button>
                </form>
                <form action={deleteWorkflowAction}>
                  <input type="hidden" name="id" value={w.id} />
                  <button className="rounded-md px-2 py-1 text-xs text-destructive hover:bg-destructive/10">Delete</button>
                </form>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold text-muted-foreground">Templates</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {WORKFLOW_TEMPLATES.map((t) => (
            <Card key={t.key}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{t.name}</CardTitle>
                <CardDescription>{t.desc}</CardDescription>
              </CardHeader>
              <CardContent>
                <form action={activateTemplateAction}>
                  <input type="hidden" name="key" value={t.key} />
                  <button className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90">
                    Activate
                  </button>
                </form>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <p className="text-center text-xs text-muted-foreground">
        The visual node editor (drag-and-drop canvas) builds on this — templates activate the
        engine now; full builder is on the roadmap.
      </p>
    </div>
  )
}
