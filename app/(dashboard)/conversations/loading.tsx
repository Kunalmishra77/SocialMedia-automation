import { Skeleton } from '@/components/ui/skeleton'

/** Two-pane inbox loading skeleton. */
export default function InboxLoading() {
  return (
    <div className="flex h-[calc(100vh-8rem)] gap-4">
      {/* Conversation list */}
      <div className="w-80 shrink-0 space-y-2 rounded-lg border border-border bg-card p-3">
        <Skeleton className="mb-2 h-8 w-full" />
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 rounded-lg p-2">
            <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3.5 w-2/3" />
              <Skeleton className="h-3 w-full" />
            </div>
          </div>
        ))}
      </div>
      {/* Thread */}
      <div className="flex flex-1 flex-col rounded-lg border border-border bg-card">
        <div className="border-b border-border p-3"><Skeleton className="h-6 w-40" /></div>
        <div className="flex-1 space-y-3 p-4">
          <Skeleton className="h-10 w-1/2 rounded-2xl" />
          <div className="flex justify-end"><Skeleton className="h-10 w-2/5 rounded-2xl" /></div>
          <Skeleton className="h-10 w-1/3 rounded-2xl" />
        </div>
        <div className="border-t border-border p-3"><Skeleton className="h-10 w-full" /></div>
      </div>
    </div>
  )
}
