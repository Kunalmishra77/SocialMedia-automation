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
              <label className="mb-1 block text-xs text-zinc-400">Title</label>
              <input name="title" required placeholder="Scheduled maintenance" className="h-10 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100 placeholder:text-zinc-600" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-zinc-400">Message</label>
              <textarea name="body" required rows={4} placeholder="We'll be upgrading our systems on…" className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-zinc-400">Audience</label>
              <select name="scope" defaultValue="all" className="h-10 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100">
                <option value="all">All clients</option>
                <option value="starter">Starter plan</option>
                <option value="pro">Pro plan</option>
                <option value="enterprise">Enterprise plan</option>
              </select>
            </div>
            <button className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-indigo-600 text-sm font-medium text-white hover:bg-indigo-500">
              <Send className="h-4 w-4" /> Publish announcement
            </button>
          </form>
        </Panel>

        <Panel title="Published" className="lg:col-span-3">
          {announcements.length === 0 ? (
            <div className="py-8 text-center text-sm text-zinc-500">
              <Radio className="mx-auto mb-2 h-6 w-6 text-zinc-700" />
              No announcements yet.
            </div>
          ) : (
            <div className="space-y-3">
              {announcements.map((a) => {
                const scope = (a.audience?.scope as string) === 'plan' ? `${a.audience?.plan} plan` : 'all clients'
                return (
                  <div key={a.id} className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-zinc-200">{a.title}</p>
                      <span className="text-xs text-zinc-500">{timeAgo(a.published_at ?? a.created_at)}</span>
                    </div>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-400">{a.body}</p>
                    <p className="mt-2 text-xs capitalize text-indigo-400">→ {scope}</p>
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
