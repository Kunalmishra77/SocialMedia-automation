'use client'

import { useState } from 'react'
import { Loader2, CalendarClock, Check, X, Wand2 } from 'lucide-react'
import { approvePostAction, rejectPostAction } from '@/lib/actions/content'
import { Button } from '@/components/ui/button'

export interface PendingPost {
  id: string
  brief: string | null
  caption: string | null
  media_url: string | null
  target_platforms: string[]
}

const area = 'w-full rounded-md border border-input bg-background px-3 py-2 text-sm'

export function ApprovalQueue({ posts }: { posts: PendingPost[] }) {
  if (!posts.length) return null
  return (
    <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50/60 p-4">
      <div className="flex items-center gap-2">
        <Wand2 className="h-4 w-4 text-amber-700" />
        <h2 className="text-sm font-semibold text-amber-900">Awaiting your approval ({posts.length})</h2>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {posts.map((p) => <ApprovalCard key={p.id} post={p} />)}
      </div>
    </div>
  )
}

function ApprovalCard({ post }: { post: PendingPost }) {
  const [when, setWhen] = useState('')
  const [busy, setBusy] = useState<'' | 'schedule' | 'approve' | 'reject'>('')
  const [err, setErr] = useState<string | null>(null)
  const [gone, setGone] = useState<string | null>(null)

  async function approve(schedule: boolean) {
    if (busy) return
    if (schedule && !when) { setErr('Pick a date & time.'); return }
    setBusy(schedule ? 'schedule' : 'approve'); setErr(null)
    const fd = new FormData()
    fd.set('id', post.id)
    if (schedule) fd.set('scheduled_at', new Date(when).toISOString())
    ;(post.target_platforms ?? ['instagram']).forEach((t) => fd.append('target_platforms', t))
    const res = await approvePostAction(fd)
    setBusy('')
    if (res.error) { setErr(res.error); return }
    setGone(schedule ? 'Scheduled ✓' : 'Approved ✓')
  }

  async function reject() {
    if (busy) return
    const note = window.prompt('Reason (optional):') ?? ''
    setBusy('reject')
    const fd = new FormData()
    fd.set('id', post.id); fd.set('note', note)
    await rejectPostAction(fd)
    setBusy('')
    setGone('Rejected ✓')
  }

  if (gone) return <div className="flex items-center rounded-lg border border-border bg-card px-3 py-4 text-sm text-emerald-600">{gone}</div>

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="flex gap-3 p-3">
        {post.media_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={post.media_url} alt="" className="h-20 w-20 shrink-0 rounded-md object-cover" />
        )}
        <div className="min-w-0">
          {post.brief && <p className="truncate text-xs font-medium text-muted-foreground">{post.brief}</p>}
          <p className="line-clamp-3 text-sm">{post.caption}</p>
        </div>
      </div>
      <div className="space-y-2 border-t border-border p-3">
        <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className={`${area} h-9`} />
        {err && <p className="text-xs text-destructive">{err}</p>}
        <div className="flex flex-wrap gap-1.5">
          <Button size="sm" onClick={() => approve(true)} disabled={!!busy}>
            {busy === 'schedule' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarClock className="h-4 w-4" />} Schedule
          </Button>
          <Button size="sm" variant="outline" onClick={() => approve(false)} disabled={!!busy}><Check className="h-4 w-4" /> Approve</Button>
          <Button size="sm" variant="ghost" onClick={reject} disabled={!!busy} className="text-destructive"><X className="h-4 w-4" /> Reject</Button>
        </div>
      </div>
    </div>
  )
}
