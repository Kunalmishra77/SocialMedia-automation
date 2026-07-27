import { redirect } from 'next/navigation'
import { requireUser, getActiveMembership } from '@/lib/authz'
import { createAdminClient } from '@/lib/supabase/admin'
import { toggleSequenceAction, deleteSequenceAction } from '@/lib/actions/sequences'
import { PageHeader } from '@/components/dashboard/page-header'
import { CreateSequence } from './create-sequence'

export default async function SequencesPage() {
  const user = await requireUser()
  const { active } = await getActiveMembership(user.id)
  if (!active) redirect('/workspace/new')
  if (active.role === 'agent') redirect('/')

  const admin = createAdminClient()
  const { data: sequences } = await admin
    .from('follow_up_sequences')
    .select('id, name, is_active, steps')
    .eq('workspace_id', active.workspaceId)
    .order('created_at', { ascending: false })

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader title="Sequences" subtitle="Automated drip follow-ups sent over time." action={<CreateSequence />} />
      <div className="mt-2 flex gap-3 text-sm">
        <a href="/automation/flows" className="text-muted-foreground hover:text-foreground hover:underline">Workflows</a>
        <a href="/automation/rules" className="text-muted-foreground hover:text-foreground hover:underline">Inbox rules</a>
        <span className="font-medium text-primary">Sequences</span>
      </div>

      <div className="space-y-2">
        {(!sequences || sequences.length === 0) && (
          <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            No sequences yet. Create a drip to nurture leads automatically.
          </p>
        )}
        {sequences?.map((s) => {
          const steps = (s.steps as { delay_hours: number; message: string }[]) ?? []
          return (
            <div key={s.id} className="rounded-lg border border-border bg-card p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium">{s.name}</p>
                  <p className="text-xs text-muted-foreground">{steps.length} step{steps.length > 1 ? 's' : ''}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs ${s.is_active ? 'bg-emerald-500/15 text-emerald-600' : 'bg-muted text-muted-foreground'}`}>{s.is_active ? 'Active' : 'Off'}</span>
                  <form action={toggleSequenceAction}>
                    <input type="hidden" name="id" value={s.id} />
                    <input type="hidden" name="is_active" value={s.is_active ? 'false' : 'true'} />
                    <button className="rounded-md border border-input px-2 py-1 text-xs hover:bg-muted">{s.is_active ? 'Disable' : 'Enable'}</button>
                  </form>
                  <form action={deleteSequenceAction}>
                    <input type="hidden" name="id" value={s.id} />
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
