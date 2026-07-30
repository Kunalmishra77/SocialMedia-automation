'use client'

import { useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { reschedulePostAction } from '@/lib/actions/content'

interface Post {
  id: string
  type: string
  caption: string | null
  status: string
  scheduled_at: string | null
}

const STATUS_DOT: Record<string, string> = {
  draft: 'bg-zinc-400',
  pending_approval: 'bg-amber-500',
  approved: 'bg-violet-500',
  scheduled: 'bg-sky-500',
  publishing: 'bg-sky-500',
  published: 'bg-emerald-500',
  failed: 'bg-red-500',
  rejected: 'bg-red-400',
}
const LEGEND = [
  ['scheduled', 'Scheduled'], ['published', 'Published'], ['approved', 'Approved'],
  ['pending_approval', 'Awaiting'], ['failed', 'Failed'], ['draft', 'Draft'],
]
const FIXED = new Set(['published', 'publishing'])
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** Interactive month calendar: navigate months and drag posts to reschedule. */
export function ContentCalendar({ posts }: { posts: Post[] }) {
  const now = new Date()
  const [items, setItems] = useState(posts)
  const [view, setView] = useState({ y: now.getFullYear(), m: now.getMonth() })
  const [busy, setBusy] = useState(false)
  const dragId = useRef<string | null>(null)

  const { y, m } = view
  const first = new Date(y, m, 1)
  const startWeekday = first.getDay()
  const daysInMonth = new Date(y, m + 1, 0).getDate()

  const byDay: Record<number, Post[]> = {}
  for (const p of items) {
    if (!p.scheduled_at) continue
    const d = new Date(p.scheduled_at)
    if (d.getFullYear() === y && d.getMonth() === m) (byDay[d.getDate()] ??= []).push(p)
  }

  const cells: (number | null)[] = []
  for (let i = 0; i < startWeekday; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)

  const isToday = (day: number) => y === now.getFullYear() && m === now.getMonth() && day === now.getDate()
  const monthName = first.toLocaleString('en-US', { month: 'long', year: 'numeric' })
  const shift = (delta: number) => setView(({ y, m }) => { const d = new Date(y, m + delta, 1); return { y: d.getFullYear(), m: d.getMonth() } })

  async function drop(day: number) {
    const id = dragId.current
    dragId.current = null
    if (!id || busy) return
    const post = items.find((p) => p.id === id)
    if (!post || FIXED.has(post.status)) return

    // Preserve the existing time-of-day; default to 9:00 AM local for undated posts.
    const prev = post.scheduled_at ? new Date(post.scheduled_at) : null
    const target = new Date(y, m, day, prev?.getHours() ?? 9, prev?.getMinutes() ?? 0, 0, 0)
    const iso = target.toISOString()

    const snapshot = items
    setItems((list) => list.map((p) => (p.id === id ? { ...p, scheduled_at: iso, status: p.status === 'rejected' ? p.status : 'scheduled' } : p)))
    setBusy(true)
    const res = await reschedulePostAction(id, iso)
    setBusy(false)
    if (res.error) { setItems(snapshot); alert(res.error) }
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-[var(--shadow-card)]">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-semibold">{monthName}</p>
        <div className="flex items-center gap-1">
          <button onClick={() => shift(-1)} className="rounded-md border border-border p-1 hover:bg-muted"><ChevronLeft className="h-4 w-4" /></button>
          <button onClick={() => setView({ y: now.getFullYear(), m: now.getMonth() })} className="rounded-md border border-border px-2 py-1 text-xs hover:bg-muted">Today</button>
          <button onClick={() => shift(1)} className="rounded-md border border-border p-1 hover:bg-muted"><ChevronRight className="h-4 w-4" /></button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-medium text-muted-foreground">
        {WEEKDAYS.map((d) => <div key={d} className="py-1">{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((day, i) => (
          <div
            key={i}
            onDragOver={(e) => { if (day) e.preventDefault() }}
            onDrop={() => day && drop(day)}
            className={`min-h-16 rounded-md border p-1 text-left ${day ? 'border-border' : 'border-transparent'} ${day && isToday(day) ? 'bg-primary/5 ring-1 ring-primary/30' : ''}`}
          >
            {day && (
              <>
                <span className={`text-[11px] ${isToday(day) ? 'font-bold text-primary' : 'text-muted-foreground'}`}>{day}</span>
                <div className="mt-0.5 space-y-0.5">
                  {(byDay[day] ?? []).slice(0, 3).map((p) => {
                    const movable = !FIXED.has(p.status)
                    return (
                      <div
                        key={p.id}
                        draggable={movable}
                        onDragStart={(e) => { dragId.current = p.id; e.dataTransfer.effectAllowed = 'move' }}
                        className={`flex items-center gap-1 truncate rounded bg-muted/60 px-1 py-0.5 text-[10px] ${movable ? 'cursor-grab active:cursor-grabbing' : 'cursor-default'}`}
                        title={`${p.status.replace('_', ' ')} · ${p.caption ?? p.type}`}
                      >
                        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${STATUS_DOT[p.status] ?? 'bg-zinc-400'}`} />
                        <span className="truncate">{p.caption?.slice(0, 24) || p.type}</span>
                      </div>
                    )
                  })}
                  {(byDay[day]?.length ?? 0) > 3 && <span className="text-[10px] text-muted-foreground">+{byDay[day].length - 3}</span>}
                </div>
              </>
            )}
          </div>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1">
        {LEGEND.map(([key, label]) => (
          <span key={key} className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[key]}`} />{label}
          </span>
        ))}
        <span className="ml-auto text-[10px] text-muted-foreground">Drag a post to reschedule</span>
      </div>
    </div>
  )
}
