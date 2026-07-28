import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Lock, Send } from 'lucide-react'
import { requirePlatformAdmin } from '@/lib/platform-admin/auth'
import { getTicket } from '@/lib/platform-admin/command-center'
import { listPlatformAdmins as _list } from '@/lib/platform-admin/metrics'
import { adminReplyAction, updateTicketAction, assignTicketAction } from '@/lib/actions/support'
import { slaStatus } from '@/lib/support-sla'
import { PageHeader, Panel, timeAgo } from '../../ui'

const STATUSES = ['open', 'in_progress', 'waiting_client', 'escalated', 'resolved', 'closed']
const PRIORITIES = ['low', 'normal', 'high', 'urgent']

export default async function TicketDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePlatformAdmin()
  const { id } = await params
  const [ticket, admins] = await Promise.all([getTicket(id), _list()])
  if (!ticket) notFound()
  const sla = slaStatus(ticket.priority, ticket.created_at, ticket.first_response_at, ['resolved', 'closed'].includes(ticket.status))

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <Link href="/platform-admin/support" className="text-sm text-[#ea6a24] hover:underline">← All tickets</Link>
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
                <div key={m.id} className={`rounded-lg border p-3 ${m.is_internal ? 'border-amber-900/40 bg-amber-950/20' : m.author_type === 'admin' ? 'border-[#ea6a24]/40 bg-[#ea6a24]/20' : 'border-border bg-background/40'}`}>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="font-medium text-foreground">
                      {m.author_name ?? m.author_type}
                      {m.is_internal && <span className="ml-2 inline-flex items-center gap-1 text-amber-400"><Lock className="h-3 w-3" />internal note</span>}
                    </span>
                    <span className="text-muted-foreground">{timeAgo(m.created_at)}</span>
                  </div>
                  <p className="whitespace-pre-wrap text-sm text-foreground">{m.body}</p>
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="Reply">
            <form action={adminReplyAction} className="space-y-3">
              <input type="hidden" name="ticketId" value={ticket.id} />
              <textarea name="body" required rows={4} placeholder="Type your reply…" className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground" />
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <input type="checkbox" name="internal" className="accent-amber-500" />
                  Internal note (hidden from client)
                </label>
                <button className="inline-flex h-9 items-center gap-2 rounded-md bg-[#ea6a24] px-4 text-sm font-medium text-white hover:bg-[#ea6a24]">
                  <Send className="h-4 w-4" /> Send
                </button>
              </div>
            </form>
          </Panel>
        </div>

        {/* Sidebar controls */}
        <div className="space-y-4">
          <Panel title="SLA · first response">
            <div className={`rounded-lg border p-3 text-sm ${sla.breached ? 'border-red-900/50 bg-red-950/30 text-red-300' : sla.responded ? 'border-emerald-900/50 bg-emerald-950/20 text-emerald-300' : 'border-border bg-background/50 text-foreground'}`}>
              <p className="font-medium capitalize">{sla.label}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">Target: {sla.targetHours}h · {ticket.first_response_at ? `first reply ${timeAgo(ticket.first_response_at)}` : `due ${new Date(sla.dueAt).toLocaleString()}`}</p>
            </div>
          </Panel>

          <Panel title="Status & priority">
            <form action={updateTicketAction} className="space-y-3">
              <input type="hidden" name="ticketId" value={ticket.id} />
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Status</label>
                <select name="status" defaultValue={ticket.status} className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm capitalize text-foreground">
                  {STATUSES.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Priority</label>
                <select name="priority" defaultValue={ticket.priority} className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm capitalize text-foreground">
                  {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <button className="h-9 w-full rounded-md bg-muted text-sm hover:bg-zinc-600">Update</button>
            </form>
          </Panel>

          <Panel title="Assignment">
            <p className="mb-2 text-xs text-muted-foreground">{ticket.assigned_to ? `Assigned to ${admins.find((a) => a.id === ticket.assigned_to)?.email ?? 'an operator'}` : 'Unassigned'}</p>
            <form action={assignTicketAction} className="space-y-2">
              <input type="hidden" name="ticketId" value={ticket.id} />
              <select name="assignee" defaultValue="me" className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground">
                <option value="me">Assign to me</option>
                {admins.map((a) => <option key={a.id} value={a.id}>{a.email}</option>)}
                <option value="unassign">Unassign</option>
              </select>
              <button className="h-9 w-full rounded-md bg-muted text-sm hover:bg-zinc-600">Apply</button>
            </form>
          </Panel>

          <Link href={`/platform-admin/workspaces/${ticket.workspace_id}`} className="block rounded-lg border border-border bg-card px-4 py-3 text-center text-sm text-[#ea6a24] hover:border-input">
            View client workspace →
          </Link>
        </div>
      </div>
    </div>
  )
}
