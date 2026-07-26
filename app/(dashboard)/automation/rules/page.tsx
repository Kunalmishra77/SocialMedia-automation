import { redirect } from 'next/navigation'
import { requireUser, getActiveMembership } from '@/lib/authz'
import { createAdminClient } from '@/lib/supabase/admin'
import { toggleRuleAction, deleteRuleAction } from '@/lib/actions/inbox-rules'
import { CreateRule } from './create-rule'

export default async function InboxRulesPage() {
  const user = await requireUser()
  const { active } = await getActiveMembership(user.id)
  if (!active) redirect('/workspace/new')
  if (active.role === 'agent') redirect('/')

  const admin = createAdminClient()
  const { data: rules } = await admin
    .from('inbox_rules')
    .select('id, name, is_active, conditions, actions')
    .eq('workspace_id', active.workspaceId)
    .order('created_at', { ascending: false })

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Inbox rules</h1>
        <p className="text-sm text-muted-foreground">
          Auto-reply, label, or assign incoming messages by keyword — before the AI runs.
        </p>
      </div>

      <CreateRule />

      <div className="space-y-2">
        {(!rules || rules.length === 0) && (
          <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            No rules yet. Add one to auto-respond to keywords like &quot;price&quot; or &quot;booking&quot;.
          </p>
        )}
        {rules?.map((r) => {
          const cond = r.conditions as { keywords?: string[]; match?: string }
          const acts = r.actions as { auto_reply?: string; add_label?: string }
          return (
            <div key={r.id} className="rounded-lg border border-border bg-card p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium">{r.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {cond.match === 'all' ? 'All of' : 'Any of'}: {(cond.keywords ?? []).join(', ')}
                  </p>
                  {acts.auto_reply && <p className="mt-1 text-xs text-muted-foreground">↳ Reply: &quot;{acts.auto_reply.slice(0, 60)}&quot;</p>}
                  {acts.add_label && <p className="text-xs text-muted-foreground">↳ Label: {acts.add_label}</p>}
                </div>
                <div className="flex items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs ${r.is_active ? 'bg-emerald-500/15 text-emerald-600' : 'bg-muted text-muted-foreground'}`}>
                    {r.is_active ? 'Active' : 'Off'}
                  </span>
                  <form action={toggleRuleAction}>
                    <input type="hidden" name="id" value={r.id} />
                    <input type="hidden" name="is_active" value={r.is_active ? 'false' : 'true'} />
                    <button className="rounded-md border border-input px-2 py-1 text-xs hover:bg-muted">{r.is_active ? 'Disable' : 'Enable'}</button>
                  </form>
                  <form action={deleteRuleAction}>
                    <input type="hidden" name="id" value={r.id} />
                    <button className="rounded-md px-2 py-1 text-xs text-destructive hover:bg-destructive/10">Delete</button>
                  </form>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
