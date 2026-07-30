import { redirect } from 'next/navigation'
import { requireUser, getActiveMembership } from '@/lib/authz'
import { createAdminClient } from '@/lib/supabase/admin'
import { deletePostAction } from '@/lib/actions/content'
import Link from 'next/link'
import { CalendarDays, Wand2 } from 'lucide-react'
import { PageHeader } from '@/components/dashboard/page-header'
import { EmptyState } from '@/components/ui/empty-state'
import { LocalTime } from '@/components/ui/local-time'
import { Button } from '@/components/ui/button'
import { CreatePost } from './create-post'
import { ContentCalendar } from './content-calendar'
import { ApprovalQueue, type PendingPost } from './approval-queue'

const STATUS_COLOR: Record<string, string> = {
  draft: 'bg-muted text-muted-foreground',
  pending_approval: 'bg-amber-500/15 text-amber-600',
  approved: 'bg-violet-500/15 text-violet-600',
  scheduled: 'bg-sky-500/15 text-sky-600',
  publishing: 'bg-sky-500/15 text-sky-600',
  published: 'bg-emerald-500/15 text-emerald-600',
  failed: 'bg-red-500/15 text-red-600',
  rejected: 'bg-red-500/10 text-red-500',
}

export default async function ContentPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const user = await requireUser()
  const { active } = await getActiveMembership(user.id)
  if (!active) redirect('/workspace/new')
  if (active.role === 'agent') redirect('/')
  const { view } = await searchParams
  const isCalendar = view === 'calendar'

  const admin = createAdminClient()
  const { data: allPosts } = await admin
    .from('content_posts')
    .select('id, type, caption, brief, status, scheduled_at, hashtags, media_urls, target_platforms, rejection_note, created_at')
    .eq('workspace_id', active.workspaceId)
    .order('created_at', { ascending: false })

  const pending: PendingPost[] = (allPosts ?? [])
    .filter((p) => p.status === 'pending_approval')
    .map((p) => ({
      id: p.id,
      brief: p.brief ?? null,
      caption: p.caption ?? null,
      media_url: (p.media_urls as string[] | null)?.[0] ?? null,
      target_platforms: (p.target_platforms as string[] | null) ?? ['instagram'],
    }))
  // The awaiting-approval posts show in their own queue, not the main grid.
  const posts = (allPosts ?? []).filter((p) => p.status !== 'pending_approval')

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <PageHeader title="Content" subtitle="Plan, schedule and publish your posts — with AI captions." />

      <div className="flex items-center justify-between">
        <div className="flex gap-1 rounded-lg border border-border bg-muted/40 p-1 text-sm">
          <Link href="/content" className={`rounded-md px-3 py-1 ${!isCalendar ? 'bg-card font-medium shadow-[var(--shadow-sm)]' : 'text-muted-foreground'}`}>List</Link>
          <Link href="/content?view=calendar" className={`rounded-md px-3 py-1 ${isCalendar ? 'bg-card font-medium shadow-[var(--shadow-sm)]' : 'text-muted-foreground'}`}>Calendar</Link>
        </div>
        <div className="flex gap-2">
          <Link href="/content/studio"><Button variant="outline"><Wand2 className="h-4 w-4" /> New with AI</Button></Link>
          <CreatePost />
        </div>
      </div>

      {!isCalendar && <ApprovalQueue posts={pending} />}

      {isCalendar && <ContentCalendar posts={(posts ?? []) as never} />}

      {!isCalendar && posts.length === 0 && pending.length === 0 && (
        <EmptyState
          icon={CalendarDays}
          title="No content yet"
          description="Try “New with AI” — enter a topic and let AI write the post & design a visual. Or draft one manually with “New post”."
        />
      )}

      {!isCalendar && posts && posts.length > 0 && (
      <div className="grid gap-3 sm:grid-cols-2">
        {posts.map((p) => (
          <div key={p.id} className="overflow-hidden rounded-lg border border-border bg-card">
            {(p.media_urls as string[] | null)?.[0] && (
              /\.(mp4|mov|webm)(\?|$)/i.test((p.media_urls as string[])[0])
                ? <video src={(p.media_urls as string[])[0]} className="h-40 w-full bg-muted object-cover" muted />
                // eslint-disable-next-line @next/next/no-img-element
                : <img src={(p.media_urls as string[])[0]} alt="" className="h-40 w-full bg-muted object-cover" />
            )}
            <div className="p-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs uppercase text-muted-foreground">{p.type}</span>
              <span className={`rounded-full px-2 py-0.5 text-xs capitalize ${STATUS_COLOR[p.status] ?? ''}`}>
                {p.status}
              </span>
            </div>
            {p.status === 'failed' && p.rejection_note && (
              <p className="mb-2 rounded-md bg-red-50 px-2 py-1 text-xs text-red-700">{p.rejection_note}</p>
            )}
            <p className="line-clamp-3 whitespace-pre-wrap text-sm">{p.caption}</p>
            {p.hashtags?.length > 0 && (
              <p className="mt-2 line-clamp-1 text-xs text-primary">
                {p.hashtags.map((h: string) => `#${h}`).join(' ')}
              </p>
            )}
            <div className="mt-3 flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                {p.scheduled_at ? <LocalTime iso={p.scheduled_at} prefix="Scheduled " /> : 'Draft'}
              </span>
              <form action={deletePostAction}>
                <input type="hidden" name="id" value={p.id} />
                <button className="text-xs text-destructive hover:underline">Delete</button>
              </form>
            </div>
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
