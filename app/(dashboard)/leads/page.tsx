import { redirect } from 'next/navigation'
import { requireUser, getActiveMembership } from '@/lib/authz'
import { createAdminClient } from '@/lib/supabase/admin'
import { moveLeadStageAction } from '@/lib/actions/crm'
import { AddLead } from './add-lead'
import { AutoSubmitSelect } from '@/components/ui/auto-submit-select'

const STAGES: { key: string; label: string }[] = [
  { key: 'new', label: 'New' },
  { key: 'contacted', label: 'Contacted' },
  { key: 'follow_up', label: 'Follow up' },
  { key: 'interested', label: 'Interested' },
  { key: 'converted', label: 'Converted' },
  { key: 'lost', label: 'Lost' },
]

const TEMP_COLOR: Record<string, string> = {
  hot: 'bg-red-500/15 text-red-600',
  warm: 'bg-amber-500/15 text-amber-600',
  cold: 'bg-sky-500/15 text-sky-600',
}

export default async function LeadsPage() {
  const user = await requireUser()
  const { active } = await getActiveMembership(user.id)
  if (!active) redirect('/workspace/new')

  const admin = createAdminClient()
  const { data: leads } = await admin
    .from('leads')
    .select('id, title, stage, value, temperature, currency')
    .eq('workspace_id', active.workspaceId)
    .order('created_at', { ascending: false })
    .limit(500)

  const byStage = (stage: string) => (leads ?? []).filter((l) => l.stage === stage)

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Leads</h1>
          <p className="text-sm text-muted-foreground">{leads?.length ?? 0} total</p>
        </div>
        <AddLead />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        {STAGES.map((s) => {
          const items = byStage(s.key)
          return (
            <div key={s.key} className="rounded-lg bg-muted/40 p-2">
              <div className="mb-2 flex items-center justify-between px-1">
                <span className="text-sm font-semibold">{s.label}</span>
                <span className="text-xs text-muted-foreground">{items.length}</span>
              </div>
              <div className="space-y-2">
                {items.map((l) => (
                  <div key={l.id} className="rounded-md border border-border bg-card p-2.5 shadow-sm">
                    <p className="text-sm font-medium">{l.title}</p>
                    <div className="mt-1 flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">
                        {l.value ? `₹${Number(l.value).toLocaleString('en-IN')}` : '—'}
                      </span>
                      <span className={`rounded-full px-1.5 py-0.5 text-[10px] capitalize ${TEMP_COLOR[l.temperature] ?? ''}`}>
                        {l.temperature}
                      </span>
                    </div>
                    <form action={moveLeadStageAction} className="mt-2">
                      <input type="hidden" name="leadId" value={l.id} />
                      <AutoSubmitSelect
                        name="stage"
                        defaultValue={l.stage}
                        options={STAGES.map((st) => ({ value: st.key, label: st.label }))}
                        className="w-full rounded border border-input bg-background px-1 py-0.5 text-xs"
                      />
                    </form>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
