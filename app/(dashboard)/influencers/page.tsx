import { redirect } from 'next/navigation'
import { requireUser, getActiveMembership } from '@/lib/authz'
import { createAdminClient } from '@/lib/supabase/admin'
import { deleteInfluencerAction } from '@/lib/actions/influencers'
import { AddInfluencer } from './add-influencer'

export default async function InfluencersPage() {
  const user = await requireUser()
  const { active } = await getActiveMembership(user.id)
  if (!active) redirect('/workspace/new')
  if (active.role === 'agent') redirect('/')

  const admin = createAdminClient()
  const { data: influencers } = await admin
    .from('influencers')
    .select('id, name, ig_username, category, followers_count, rate_per_post, status')
    .eq('workspace_id', active.workspaceId)
    .order('created_at', { ascending: false })

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Influencers</h1>
          <p className="text-sm text-muted-foreground">{influencers?.length ?? 0} tracked</p>
        </div>
        <AddInfluencer />
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-muted-foreground">
            <tr>
              <th className="px-4 py-2 text-left font-medium">Name</th>
              <th className="px-4 py-2 text-left font-medium">Category</th>
              <th className="px-4 py-2 text-left font-medium">Followers</th>
              <th className="px-4 py-2 text-left font-medium">Rate/post</th>
              <th className="px-4 py-2 text-left font-medium">Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {(!influencers || influencers.length === 0) && (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">No influencers yet.</td></tr>
            )}
            {influencers?.map((i) => (
              <tr key={i.id} className="hover:bg-muted/40">
                <td className="px-4 py-3 font-medium">
                  {i.name || i.ig_username}
                  {i.ig_username && <span className="ml-1 text-xs text-muted-foreground">@{i.ig_username}</span>}
                </td>
                <td className="px-4 py-3 text-muted-foreground">{i.category ?? '—'}</td>
                <td className="px-4 py-3">{i.followers_count?.toLocaleString('en-IN') ?? '—'}</td>
                <td className="px-4 py-3">{i.rate_per_post ? `₹${Number(i.rate_per_post).toLocaleString('en-IN')}` : '—'}</td>
                <td className="px-4 py-3 capitalize text-muted-foreground">{i.status}</td>
                <td className="px-4 py-3 text-right">
                  <form action={deleteInfluencerAction}>
                    <input type="hidden" name="id" value={i.id} />
                    <button className="text-xs text-destructive hover:underline">Delete</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
