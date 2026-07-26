import { redirect } from 'next/navigation'
import { requireUser, getActiveMembership } from '@/lib/authz'
import { createAdminClient } from '@/lib/supabase/admin'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default async function AdsPage() {
  const user = await requireUser()
  const { active } = await getActiveMembership(user.id)
  if (!active) redirect('/workspace/new')
  if (active.role === 'agent') redirect('/')

  const admin = createAdminClient()
  const { data: leads } = await admin
    .from('meta_ads_leads')
    .select('id, form_id, campaign_id, field_data, created_time')
    .eq('workspace_id', active.workspaceId)
    .order('created_time', { ascending: false })
    .limit(100)

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Ads</h1>
        <p className="text-sm text-muted-foreground">Meta Lead Ads synced to your CRM.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Lead form submissions</CardTitle>
        </CardHeader>
        <CardContent>
          {(!leads || leads.length === 0) ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No ad leads yet. Connect Instagram/Facebook and run Lead Ads — submissions sync here
              automatically via webhook and become contacts.
            </p>
          ) : (
            <div className="space-y-2">
              {leads.map((l) => {
                const fields = (l.field_data as Record<string, string>) ?? {}
                return (
                  <div key={l.id} className="rounded-md border border-border p-3 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{fields.full_name || fields.name || 'Lead'}</span>
                      <span className="text-xs text-muted-foreground">
                        {l.created_time ? new Date(l.created_time).toLocaleDateString() : ''}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {fields.email ?? ''} {fields.phone ? `· ${fields.phone}` : ''}
                    </p>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
