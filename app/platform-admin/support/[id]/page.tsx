import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Lock, Send } from 'lucide-react'
import { requirePlatformAdmin } from '@/lib/platform-admin/auth'
import { getTicket } from '@/lib/platform-admin/command-center'
import { listPlatformAdmins as _list } from '@/lib/platform-admin/metrics'
import { adminReplyAction, updateTicketAction, assignTicketAction } from '@/lib/actions/support'
import { PageHeader, Panel, timeAgo } from '../../ui'

const STATUSES = ['open', 'in_progress', 'waiting_client', 'escalated', 'resolved', 'closed']
const PRIORITIES = ['low', 'normal', 'high', 'urgent']

export default async function TicketDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePlatformAdmin()
  const { id } = await params
  const [ticket, admins] = await Promise.all([getTicket(id), _list()])
  if (!ticket) notFound()

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <Link href="/platform-admin/support" className="text-sm text-indigo-400 hover:underline">← All tickets</Link>
      </div>
      <PageHeader
        title={ticket.subject}
        subtitle={`${ticket.workspace_name} · ${ticket.category} · opened ${timeAgo(ticket.created_at)}`}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Thread */}
        <div className="space-y-4 lg:col-span-2">
          <Panel title="Conversation">
            <div className="space-y-3">
              {ticket.messages.map((m) => (
                <div key={m.id} className={`rounded-lg border p-3 ${m.is_internal ? 'border-amber-900/40 bg-amber-950/20' : m.author_type === 'admin' ? 'border-indigo-900/40 bg-indigo-950/20' : 'border-zinc-800 bg-zinc-950/40'}`}>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="font-medium text-zinc-300">
                      {m.author_name ?? m.author_type}
                      {m.is_internal && <span className="ml-2 inline-flex items-center gap-1 text-amber-400"><Lock className="h-3 w-3" />internal note</span>}
                    </span>
                    <span className="text-zinc-500">{timeAgo(m.created_at)}</span>
                  </div>
                  <p className="whitespace-pre-wrap text-sm text-zinc-200">{m.body}</p>
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="Reply">
            <form action={adminReplyAction} className="space-y-3">
              <input type="hidden" name="ticketId" value={ticket.id} />
              <textarea name="body" required rows={4} placeholder="Type your reply…" className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600" />
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-xs text-zinc-400">
                  <input type="checkbox" name="internal" className="accent-amber-500" />
                  Internal note (hidden from client)
                </label>
                <button className="inline-flex h-9 items-center gap-2 rounded-md bg-indigo-600 px-4 text-sm font-medium text-white hover:bg-indigo-500">
                  <Send className="h-4 w-4" /> Send
                </button>
              </div>
            </form>
          </Panel>
        </div>

        {/* Sidebar controls */}
        <div className="space-y-4">
          <Panel title="Status & priority">
            <form action={updateTicketAction} className="space-y-3">
              <input type="hidden" name="ticketId" value={ticket.id} />
              <div>
                <label className="mb-1 block text-xs text-zinc-400">Status</label>
                <select name="status" defaultValue={ticket.status} className="h-9 w-full rounded-md border border-zinc-700 bg-zinc-950 px-2 text-sm capitalize text-zinc-100">
                  {STATUSES.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs text-zinc-400">Priority</label>
                <select name="priority" defaultValue={ticket.priority} className="h-9 w-full rounded-md border border-zinc-700 bg-zinc-950 px-2 text-sm capitalize text-zinc-100">
                  {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <button className="h-9 w-full rounded-md bg-zinc-700 text-sm hover:bg-zinc-600">Update</button>
            </form>
          </Panel>

          <Panel title="Assignment">
            <p className="mb-2 text-xs text-zinc-500">{ticket.assigned_to ? `Assigned to ${admins.find((a) => a.id === ticket.assigned_to)?.email ?? 'an operator'}` : 'Unassigned'}</p>
            <form action={assignTicketAction} className="space-y-2">
              <input type="hidden" name="ticketId" value={ticket.id} />
              <select name="assignee" defaultValue="me" className="h-9 w-full rounded-md border border-zinc-700 bg-zinc-950 px-2 text-sm text-zinc-100">
                <option value="me">Assign to me</option>
                {admins.map((a) => <option key={a.id} value={a.id}>{a.email}</option>)}
                <option value="unassign">Unassign</option>
              </select>
              <button className="h-9 w-full rounded-md bg-zinc-700 text-sm hover:bg-zinc-600">Apply</button>
            </form>
          </Panel>

          <Link href={`/platform-admin/workspaces/${ticket.workspace_id}`} className="block rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-3 text-center text-sm text-indigo-400 hover:border-zinc-700">
            View client workspace →
          </Link>
        </div>
      </div>
    </div>
  )
}
