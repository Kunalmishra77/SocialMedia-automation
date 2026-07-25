import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { requireUser, getActiveMembership } from '@/lib/authz'
import { createAdminClient } from '@/lib/supabase/admin'
import { runCampaignAction, deleteCampaignAction } from '@/lib/actions/campaigns'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default async function CampaignDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser()
  const { active } = await getActiveMembership(user.id)
  if (!active) redirect('/workspace/new')
  const { id } = await params

  const admin = createAdminClient()
  const { data: c } = await admin
    .from('campaigns')
    .select('*')
    .eq('id', id)
    .eq('workspace_id', active.workspaceId)
    .maybeSingle()
  if (!c) notFound()

  const funnel = [
    { label: 'Targeted', value: c.total_recipients ?? 0 },
    { label: 'Sent', value: c.sent_count ?? 0 },
    { label: 'Failed', value: c.failed_count ?? 0 },
    { label: 'Filtered', value: c.filtered_count ?? 0 },
  ]

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link href="/campaigns" className="text-sm text-primary hover:underline">← All campaigns</Link>

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{c.name}</h1>
          <p className="text-sm capitalize text-muted-foreground">
            {c.type.replace(/_/g, ' ')} · {c.status}
          </p>
        </div>
        <div className="flex gap-2">
          {c.status !== 'running' && (
            <form action={runCampaignAction}>
              <input type="hidden" name="id" value={c.id} />
              <button className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90">
                {c.status === 'completed' ? 'Re-run' : 'Run campaign'}
              </button>
            </form>
          )}
          <form action={deleteCampaignAction}>
            <input type="hidden" name="id" value={c.id} />
            <button className="rounded-md border border-input px-3 py-1.5 text-sm text-destructive hover:bg-destructive/10">
              Delete
            </button>
          </form>
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Message</CardTitle></CardHeader>
        <CardContent>
          <p className="whitespace-pre-wrap rounded-md bg-muted/40 p-3 text-sm">{c.message_text}</p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {funnel.map((f) => (
          <Card key={f.label}>
            <CardContent className="pt-6">
              <p className="text-xs text-muted-foreground">{f.label}</p>
              <p className="text-2xl font-bold">{f.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <p className="text-center text-xs text-muted-foreground">
        Delivers live over connected channels (Telegram now; Instagram/Facebook once connected).
        Window-type campaigns skip contacts outside the 24-hour window.
      </p>
    </div>
  )
}
