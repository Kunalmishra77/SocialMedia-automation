import { requireUser } from '@/lib/authz'
import { createAdminClient } from '@/lib/supabase/admin'
import { markAllReadAction } from '@/lib/actions/notifications'

export default async function NotificationsPage() {
  const user = await requireUser()
  const admin = createAdminClient()
  const { data: notifications } = await admin
    .from('notifications')
    .select('id, type, title, body, is_read, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(100)

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Notifications</h1>
        <form action={markAllReadAction}>
          <button className="rounded-md border border-input px-3 py-1.5 text-sm hover:bg-muted">
            Mark all read
          </button>
        </form>
      </div>

      <div className="space-y-2">
        {(!notifications || notifications.length === 0) && (
          <p className="py-10 text-center text-sm text-muted-foreground">No notifications yet.</p>
        )}
        {notifications?.map((n) => (
          <div
            key={n.id}
            className={`rounded-lg border border-border p-3 ${n.is_read ? 'bg-card' : 'bg-primary/5'}`}
          >
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">{n.title}</p>
              <span className="text-xs text-muted-foreground">
                {new Date(n.created_at).toLocaleString()}
              </span>
            </div>
            {n.body && <p className="mt-0.5 text-sm text-muted-foreground">{n.body}</p>}
          </div>
        ))}
      </div>
    </div>
  )
}
