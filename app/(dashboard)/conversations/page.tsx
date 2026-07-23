import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireUser, getActiveMembership } from '@/lib/authz'
import { createAdminClient } from '@/lib/supabase/admin'
import { windowStatus, formatWindowLeft } from '@/lib/inbox'
import { resolveConversationAction, reopenConversationAction, assignToMeAction } from '@/lib/actions/inbox'
import { Composer } from './composer'

const STATUS_TABS = ['open', 'assigned', 'pending', 'resolved', 'snoozed']

export default async function ConversationsPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string; status?: string }>
}) {
  const user = await requireUser()
  const { active } = await getActiveMembership(user.id)
  if (!active) redirect('/workspace/new')
  const { c: selectedId, status } = await searchParams

  const admin = createAdminClient()
  let listQuery = admin
    .from('conversations')
    .select('id, channel, status, last_message, last_message_at, last_user_message_at, unread_count, contacts(full_name, ig_username, ig_profile_pic)')
    .eq('workspace_id', active.workspaceId)
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .limit(100)
  if (status) listQuery = listQuery.eq('status', status)
  const { data: conversations } = await listQuery

  // Selected conversation thread
  let selected: {
    id: string; status: string; channel: string; last_user_message_at: string | null
    contactName: string
  } | null = null
  let messages: { id: string; direction: string; content: string | null; type: string; created_at: string; sender_type: string }[] = []

  if (selectedId) {
    const { data: conv } = await admin
      .from('conversations')
      .select('id, status, channel, last_user_message_at, contacts(full_name, ig_username)')
      .eq('id', selectedId)
      .eq('workspace_id', active.workspaceId)
      .maybeSingle()
    if (conv) {
      const contact = conv.contacts as unknown as { full_name: string | null; ig_username: string | null } | null
      selected = {
        id: conv.id,
        status: conv.status,
        channel: conv.channel,
        last_user_message_at: conv.last_user_message_at,
        contactName: contact?.full_name || contact?.ig_username || 'Unknown',
      }
      const { data: msgs } = await admin
        .from('messages')
        .select('id, direction, content, type, created_at, sender_type')
        .eq('conversation_id', selectedId)
        .order('created_at', { ascending: true })
        .limit(200)
      messages = msgs ?? []
    }
  }

  const win = selected ? windowStatus(selected.last_user_message_at) : { open: false, msLeft: 0 }

  return (
    <div className="flex h-[calc(100vh-7rem)] gap-4">
      {/* List */}
      <div className="flex w-80 shrink-0 flex-col rounded-lg border border-border bg-card">
        <div className="border-b border-border p-3">
          <h1 className="font-semibold">Inbox</h1>
          <div className="mt-2 flex flex-wrap gap-1">
            <Link
              href="/conversations"
              className={`rounded-full px-2 py-0.5 text-xs ${!status ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted'}`}
            >
              All
            </Link>
            {STATUS_TABS.map((s) => (
              <Link
                key={s}
                href={`/conversations?status=${s}`}
                className={`rounded-full px-2 py-0.5 text-xs capitalize ${status === s ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted'}`}
              >
                {s}
              </Link>
            ))}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {(!conversations || conversations.length === 0) && (
            <p className="p-6 text-center text-sm text-muted-foreground">
              No conversations yet. They appear here once a channel is connected and messages arrive.
            </p>
          )}
          {conversations?.map((conv) => {
            const contact = conv.contacts as unknown as { full_name: string | null; ig_username: string | null } | null
            const name = contact?.full_name || contact?.ig_username || 'Unknown'
            const isActive = conv.id === selectedId
            return (
              <Link
                key={conv.id}
                href={`/conversations?c=${conv.id}${status ? `&status=${status}` : ''}`}
                className={`block border-b border-border px-3 py-3 hover:bg-muted/50 ${isActive ? 'bg-muted' : ''}`}
              >
                <div className="flex items-center justify-between">
                  <span className="truncate text-sm font-medium">{name}</span>
                  <span className="text-[10px] uppercase text-muted-foreground">{conv.channel}</span>
                </div>
                <p className="truncate text-xs text-muted-foreground">{conv.last_message || '—'}</p>
              </Link>
            )
          })}
        </div>
      </div>

      {/* Thread */}
      <div className="flex flex-1 flex-col rounded-lg border border-border bg-card">
        {!selected ? (
          <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
            Select a conversation to view the thread.
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between border-b border-border p-3">
              <div>
                <p className="font-semibold">{selected.contactName}</p>
                <p className="text-xs text-muted-foreground">
                  <span className="capitalize">{selected.channel}</span> ·{' '}
                  {win.open ? (
                    <span className="text-emerald-600">Window {formatWindowLeft(win.msLeft)}</span>
                  ) : (
                    <span className="text-amber-600">Window closed</span>
                  )}
                </p>
              </div>
              <div className="flex gap-2">
                <form action={assignToMeAction}>
                  <input type="hidden" name="conversationId" value={selected.id} />
                  <button className="rounded-md border border-input px-2 py-1 text-xs hover:bg-muted">Assign to me</button>
                </form>
                {selected.status === 'resolved' ? (
                  <form action={reopenConversationAction}>
                    <input type="hidden" name="conversationId" value={selected.id} />
                    <button className="rounded-md border border-input px-2 py-1 text-xs hover:bg-muted">Reopen</button>
                  </form>
                ) : (
                  <form action={resolveConversationAction}>
                    <input type="hidden" name="conversationId" value={selected.id} />
                    <button className="rounded-md bg-primary px-2 py-1 text-xs text-primary-foreground hover:opacity-90">Resolve</button>
                  </form>
                )}
              </div>
            </div>

            <div className="flex-1 space-y-2 overflow-y-auto bg-muted/20 p-4">
              {messages.length === 0 && (
                <p className="text-center text-sm text-muted-foreground">No messages yet.</p>
              )}
              {messages.map((m) => {
                const outbound = m.direction === 'outbound'
                return (
                  <div key={m.id} className={`flex ${outbound ? 'justify-end' : 'justify-start'}`}>
                    <div
                      className={`max-w-[70%] rounded-2xl px-3 py-2 text-sm ${
                        outbound ? 'bg-primary text-primary-foreground' : 'bg-card border border-border'
                      }`}
                    >
                      {m.content || <span className="italic opacity-70">[{m.type}]</span>}
                    </div>
                  </div>
                )
              })}
            </div>

            <Composer conversationId={selected.id} windowOpen={win.open} />
          </>
        )}
      </div>
    </div>
  )
}
