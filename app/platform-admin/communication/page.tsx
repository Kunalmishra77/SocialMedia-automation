import { notFound } from 'next/navigation'
import { Radio, Send } from 'lucide-react'
import { requirePlatformAdmin, can } from '@/lib/platform-admin/auth'
import { listAnnouncements } from '@/lib/platform-admin/command-center'
import { createAnnouncementAction } from '@/lib/actions/platform-admin'
import { PageHeader, Panel, timeAgo } from '../ui'

export default async function CommunicationPage() {
  const ctx = await requirePlatformAdmin()
  if (!can(ctx, 'broadcast')) notFound()
  const announcements = await listAnnouncements()

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader title="Communication center" subtitle="Broadcast announcements to clients across the platform." />

      <div className="grid gap-6 lg:grid-cols-5">
        <Panel title="New announcement" className="lg:col-span-2">
          <form action={createAnnouncementAction} className="space-y-3">
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Title</label>
              <input name="title" required placeholder="Scheduled maintenance" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Message</label>
              <textarea name="body" required rows={4} placeholder="We'll be upgrading our systems on…" className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Audience</label>
              <select name="scope" defaultValue="all" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground">
                <option value="all">All clients</option>
                <option value="starter">Starter plan</option>
                <option value="pro">Pro plan</option>
                <option value="enterprise">Enterprise plan</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Schedule for (optional)</label>
              <input type="datetime-local" name="scheduledFor" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground" />
              <p className="mt-1 text-[11px] text-muted-foreground">Leave empty to publish now.</p>
            </div>
            <button className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-[#ea6a24] text-sm font-medium text-white hover:bg-[#ea6a24]">
              <Send className="h-4 w-4" /> Publish / schedule
            </button>
          </form>
        </Panel>

        <Panel title="Published" className="lg:col-span-3">
          {announcements.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              <Radio className="mx-auto mb-2 h-6 w-6 text-muted-foreground/50" />
              No announcements yet.
            </div>
          ) : (
            <div className="space-y-3">
              {announcements.map((a) => {
                const scope = (a.audience?.scope as string) === 'plan' ? `${a.audience?.plan} plan` : 'all clients'
                const scheduled = !a.published_at && a.scheduled_for
                return (
                  <div key={a.id} className="rounded-lg border border-border bg-background/50 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-foreground">{a.title}</p>
                      {scheduled ? (
                        <span className="shrink-0 rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] text-amber-400">scheduled · {new Date(a.scheduled_for as string).toLocaleString()}</span>
                      ) : (
                        <span className="shrink-0 text-xs text-muted-foreground">{timeAgo(a.published_at ?? a.created_at)}</span>
                      )}
                    </div>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{a.body}</p>
                    <p className="mt-2 text-xs capitalize text-[#ea6a24]">→ {scope}</p>
                  </div>
                )
              })}
            </div>
          )}
        </Panel>
      </div>
    </div>
  )
}
