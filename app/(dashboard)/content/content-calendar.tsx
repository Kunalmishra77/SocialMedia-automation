interface Post {
  id: string
  type: string
  caption: string | null
  status: string
  scheduled_at: string | null
}

const STATUS_DOT: Record<string, string> = {
  scheduled: 'bg-sky-500',
  published: 'bg-emerald-500',
  draft: 'bg-zinc-400',
  failed: 'bg-red-500',
}

/** Month grid of scheduled/published posts (server-rendered, current month). */
export function ContentCalendar({ posts }: { posts: Post[] }) {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth()
  const first = new Date(year, month, 1)
  const startWeekday = first.getDay() // 0 = Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  const byDay: Record<number, Post[]> = {}
  for (const p of posts) {
    if (!p.scheduled_at) continue
    const d = new Date(p.scheduled_at)
    if (d.getFullYear() === year && d.getMonth() === month) {
      const day = d.getDate()
      ;(byDay[day] ??= []).push(p)
    }
  }

  const cells: (number | null)[] = []
  for (let i = 0; i < startWeekday; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)

  const monthName = first.toLocaleString('en-US', { month: 'long', year: 'numeric' })
  const today = now.getDate()

  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-[var(--shadow-card)]">
      <p className="mb-3 text-sm font-semibold">{monthName}</p>
      <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-medium text-muted-foreground">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => <div key={d} className="py-1">{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((day, i) => (
          <div key={i} className={`min-h-16 rounded-md border p-1 text-left ${day ? 'border-border' : 'border-transparent'} ${day === today ? 'bg-primary/5 ring-1 ring-primary/30' : ''}`}>
            {day && (
              <>
                <span className={`text-[11px] ${day === today ? 'font-bold text-primary' : 'text-muted-foreground'}`}>{day}</span>
                <div className="mt-0.5 space-y-0.5">
                  {(byDay[day] ?? []).slice(0, 3).map((p) => (
                    <div key={p.id} className="flex items-center gap-1 truncate rounded bg-muted/60 px-1 py-0.5 text-[10px]" title={p.caption ?? ''}>
                      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${STATUS_DOT[p.status] ?? 'bg-zinc-400'}`} />
                      <span className="truncate">{p.type}</span>
                    </div>
                  ))}
                  {(byDay[day]?.length ?? 0) > 3 && <span className="text-[10px] text-muted-foreground">+{byDay[day].length - 3}</span>}
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
