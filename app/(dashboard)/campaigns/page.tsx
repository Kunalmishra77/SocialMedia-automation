import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireUser, getActiveMembership } from '@/lib/authz'
import { createAdminClient } from '@/lib/supabase/admin'
import { CreateCampaign } from './create-campaign'

const STATUS_COLOR: Record<string, string> = {
  draft: 'bg-muted text-muted-foreground',
  running: 'bg-sky-500/15 text-sky-600',
  completed: 'bg-emerald-500/15 text-emerald-600',
  failed: 'bg-red-500/15 text-red-600',
}

export default async function CampaignsPage() {
  const user = await requireUser()
  const { active } = await getActiveMembership(user.id)
  if (!active) redirect('/workspace/new')
  if (active.role === 'agent') redirect('/')

  const admin = createAdminClient()
  const { data: campaigns } = await admin
    .from('campaigns')
    .select('id, name, type, status, sent_count, total_recipients, created_at')
    .eq('workspace_id', active.workspaceId)
    .order('created_at', { ascending: false })

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Campaigns</h1>
          <p className="text-sm text-muted-foreground">{campaigns?.length ?? 0} total</p>
        </div>
      </div>

      <CreateCampaign />

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-muted-foreground">
            <tr>
              <th className="px-4 py-2 text-left font-medium">Name</th>
              <th className="px-4 py-2 text-left font-medium">Type</th>
              <th className="px-4 py-2 text-left font-medium">Status</th>
              <th className="px-4 py-2 text-left font-medium">Sent</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {(!campaigns || campaigns.length === 0) && (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-muted-foreground">
                  No campaigns yet. Create one to broadcast to your contacts.
                </td>
              </tr>
            )}
            {campaigns?.map((c) => (
              <tr key={c.id} className="hover:bg-muted/40">
                <td className="px-4 py-3">
                  <Link href={`/campaigns/${c.id}`} className="font-medium text-primary hover:underline">
                    {c.name}
                  </Link>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{c.type.replace(/_/g, ' ')}</td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs capitalize ${STATUS_COLOR[c.status] ?? ''}`}>
                    {c.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {c.sent_count ?? 0}{c.total_recipients ? ` / ${c.total_recipients}` : ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
