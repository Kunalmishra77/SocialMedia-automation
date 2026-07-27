import { redirect } from 'next/navigation'
import { requireUser, getActiveMembership } from '@/lib/authz'
import { createAdminClient } from '@/lib/supabase/admin'
import { deletePostAction } from '@/lib/actions/content'
import Link from 'next/link'
import { PageHeader } from '@/components/dashboard/page-header'
import { CreatePost } from './create-post'
import { ContentCalendar } from './content-calendar'

const STATUS_COLOR: Record<string, string> = {
  draft: 'bg-muted text-muted-foreground',
  scheduled: 'bg-sky-500/15 text-sky-600',
  published: 'bg-emerald-500/15 text-emerald-600',
  failed: 'bg-red-500/15 text-red-600',
}

export default async function ContentPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const user = await requireUser()
  const { active } = await getActiveMembership(user.id)
  if (!active) redirect('/workspace/new')
  if (active.role === 'agent') redirect('/')
  const { view } = await searchParams
  const isCalendar = view === 'calendar'

  const admin = createAdminClient()
  const { data: posts } = await admin
    .from('content_posts')
    .select('id, type, caption, status, scheduled_at, hashtags, created_at')
    .eq('workspace_id', active.workspaceId)
    .order('created_at', { ascending: false })

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <PageHeader title="Content" subtitle="Plan, schedule and publish your posts — with AI captions." />

      <div className="flex items-center justify-between">
        <div className="flex gap-1 rounded-lg border border-border bg-muted/40 p-1 text-sm">
          <Link href="/content" className={`rounded-md px-3 py-1 ${!isCalendar ? 'bg-card font-medium shadow-[var(--shadow-sm)]' : 'text-muted-foreground'}`}>List</Link>
          <Link href="/content?view=calendar" className={`rounded-md px-3 py-1 ${isCalendar ? 'bg-card font-medium shadow-[var(--shadow-sm)]' : 'text-muted-foreground'}`}>Calendar</Link>
        </div>
        <CreatePost />
      </div>

      {isCalendar && <ContentCalendar posts={(posts ?? []) as never} />}

      {!isCalendar && (
      <div className="grid gap-3 sm:grid-cols-2">
        {(!posts || posts.length === 0) && (
          <p className="col-span-full py-10 text-center text-sm text-muted-foreground">
            No posts yet. Create a draft or schedule your first post.
          </p>
        )}
        {posts?.map((p) => (
          <div key={p.id} className="rounded-lg border border-border bg-card p-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs uppercase text-muted-foreground">{p.type}</span>
              <span className={`rounded-full px-2 py-0.5 text-xs capitalize ${STATUS_COLOR[p.status] ?? ''}`}>
                {p.status}
              </span>
            </div>
            <p className="line-clamp-3 whitespace-pre-wrap text-sm">{p.caption}</p>
            {p.hashtags?.length > 0 && (
              <p className="mt-2 line-clamp-1 text-xs text-primary">
                {p.hashtags.map((h: string) => `#${h}`).join(' ')}
              </p>
            )}
            <div className="mt-3 flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                {p.scheduled_at ? `Scheduled ${new Date(p.scheduled_at).toLocaleString()}` : 'Draft'}
              </span>
              <form action={deletePostAction}>
                <input type="hidden" name="id" value={p.id} />
                <button className="text-xs text-destructive hover:underline">Delete</button>
              </form>
            </div>
          </div>
        ))}
      </div>
      )}

      <p className="text-center text-xs text-muted-foreground">
        Scheduled posts publish automatically once Instagram is connected (Content Publishing API).
      </p>
    </div>
  )
}
