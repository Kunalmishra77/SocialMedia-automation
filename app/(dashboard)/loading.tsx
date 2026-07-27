import { Skeleton, SkeletonCard, SkeletonTable } from '@/components/ui/skeleton'

/** Default loading skeleton for dashboard routes — keeps layout stable (no CLS). */
export default function DashboardLoading() {
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-7 w-52" />
        <Skeleton className="h-4 w-72" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
      </div>
      <SkeletonTable rows={6} cols={4} />
    </div>
  )
}
