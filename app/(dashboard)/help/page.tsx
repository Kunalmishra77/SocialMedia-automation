import { requireUser, getActiveMembership } from '@/lib/authz'
import { createAdminClient } from '@/lib/supabase/admin'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PageHeader } from '@/components/dashboard/page-header'
import { MessagesSquare, Plug, Sparkles, CalendarClock, BookOpen, LifeBuoy, Send } from 'lucide-react'
import { createTicketAction, clientReplyAction } from '@/lib/actions/support'

const GUIDES = [
  { icon: Plug, title: 'Connect a channel', desc: 'Go to Settings → Channels. Instagram/Facebook connect with one click; Telegram uses a @BotFather bot token.' },
  { icon: Sparkles, title: 'Turn on AI auto-reply', desc: 'Knowledge → AI settings. Add your persona, enable auto-reply, and (optionally) follow-gate. Add knowledge entries so the AI answers accurately.' },
  { icon: MessagesSquare, title: 'Comment → DM automation', desc: 'Once Instagram is connected, comments auto-get a like, a public reply, and a private DM — all AI-generated.' },
  { icon: CalendarClock, title: 'Schedule content', desc: 'Content → New post. Pick a date/time to schedule; it publishes automatically once your channel is connected.' },
  { icon: BookOpen, title: 'Automation rules', desc: 'Automation → Inbox rules. Auto-reply, label or assign messages by keyword before the AI runs.' },
]

const STATUS_STYLE: Record<string, string> = {
  open: 'bg-emerald-100 text-emerald-700',
  in_progress: 'bg-indigo-100 text-indigo-700',
  waiting_client: 'bg-amber-100 text-amber-700',
  escalated: 'bg-red-100 text-red-700',
  resolved: 'bg-muted text-muted-foreground',
  closed: 'bg-muted text-muted-foreground',
}

export default async function HelpPage() {
  const user = await requireUser()
  const { active } = await getActiveMembership(user.id)

  let tickets: { id: string; subject: string; status: string; priority: string; category: string; created_at: string; messages: { author_type: string; author_name: string | null; body: string; created_at: string }[] }[] = []
  if (active) {
    const admin = createAdminClient()
    const { data } = await admin
      .from('support_tickets')
      .select('id, subject, status, priority, category, created_at, support_ticket_messages(author_type, author_name, body, is_internal, created_at)')
      .eq('workspace_id', active.workspaceId)
      .order('created_at', { ascending: false })
      .limit(20)
    tickets = (data ?? []).map((t) => ({
      id: t.id as string,
      subject: t.subject as string,
      status: t.status as string,
      priority: t.priority as string,
      category: t.category as string,
      created_at: t.created_at as string,
      messages: ((t.support_ticket_messages as unknown as { author_type: string; author_name: string | null; body: string; is_internal: boolean; created_at: string }[]) ?? [])
        .filter((m) => !m.is_internal)
        .sort((a, b) => a.created_at.localeCompare(b.created_at)),
    }))
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Help & Support" subtitle="Guides + direct support from our team." />

      <div className="grid gap-4 sm:grid-cols-2">
        {GUIDES.map((g) => {
          const Icon = g.icon
          return (
            <Card key={g.title}>
              <CardHeader className="pb-2">
                <div className="mb-1 flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary"><Icon className="h-[18px] w-[18px]" /></div>
                <CardTitle className="text-base">{g.title}</CardTitle>
              </CardHeader>
              <CardContent><p className="text-sm text-muted-foreground">{g.desc}</p></CardContent>
            </Card>
          )
        })}
      </div>

      {/* New ticket */}
      <Card className="mt-6">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base"><LifeBuoy className="h-[18px] w-[18px] text-primary" /> Contact support</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={createTicketAction} className="space-y-3">
            <input name="subject" required placeholder="Subject" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" />
            <textarea name="body" required rows={4} placeholder="Describe your issue…" className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
            <div className="flex flex-wrap gap-3">
              <select name="category" defaultValue="general" className="h-10 flex-1 rounded-md border border-input bg-background px-3 text-sm">
                <option value="general">General</option>
                <option value="technical">Technical</option>
                <option value="billing">Billing</option>
                <option value="integration">Integration</option>
                <option value="api">API</option>
              </select>
              <select name="priority" defaultValue="normal" className="h-10 flex-1 rounded-md border border-input bg-background px-3 text-sm">
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
            <button className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:brightness-110">
              <Send className="h-4 w-4" /> Submit ticket
            </button>
          </form>
        </CardContent>
      </Card>

      {/* My tickets */}
      {tickets.length > 0 && (
        <div className="mt-6 space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground">Your tickets</h2>
          {tickets.map((t) => (
            <Card key={t.id}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">{t.subject}</CardTitle>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium capitalize ${STATUS_STYLE[t.status] ?? 'bg-muted'}`}>{t.status.replace('_', ' ')}</span>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {t.messages.map((m, i) => (
                    <div key={i} className={`rounded-lg px-3 py-2 text-sm ${m.author_type === 'admin' ? 'border border-primary/20 bg-primary/5' : 'bg-muted/50'}`}>
                      <p className="mb-0.5 text-[11px] font-medium text-muted-foreground">{m.author_type === 'admin' ? 'Support team' : 'You'}</p>
                      <p className="whitespace-pre-wrap">{m.body}</p>
                    </div>
                  ))}
                </div>
                {!['closed', 'resolved'].includes(t.status) && (
                  <form action={clientReplyAction} className="mt-3 flex gap-2">
                    <input type="hidden" name="ticketId" value={t.id} />
                    <input name="body" required placeholder="Reply…" className="h-9 flex-1 rounded-md border border-input bg-background px-3 text-sm" />
                    <button className="h-9 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:brightness-110"><Send className="h-4 w-4" /></button>
                  </form>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
