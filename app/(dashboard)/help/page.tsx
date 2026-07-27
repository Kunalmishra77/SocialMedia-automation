import { requireUser } from '@/lib/authz'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PageHeader } from '@/components/dashboard/page-header'
import { MessagesSquare, Plug, Sparkles, CalendarClock, BookOpen } from 'lucide-react'

const GUIDES = [
  { icon: Plug, title: 'Connect a channel', desc: 'Go to Settings → Channels. Instagram/Facebook connect with one click; Telegram uses a @BotFather bot token.' },
  { icon: Sparkles, title: 'Turn on AI auto-reply', desc: 'Knowledge → AI settings. Add your persona, enable auto-reply, and (optionally) follow-gate. Add knowledge entries so the AI answers accurately.' },
  { icon: MessagesSquare, title: 'Comment → DM automation', desc: 'Once Instagram is connected, comments auto-get a like, a public reply, and a private DM — all AI-generated.' },
  { icon: CalendarClock, title: 'Schedule content', desc: 'Content → New post. Pick a date/time to schedule; it publishes automatically once your channel is connected.' },
  { icon: BookOpen, title: 'Automation rules', desc: 'Automation → Inbox rules. Auto-reply, label or assign messages by keyword before the AI runs.' },
]

export default async function HelpPage() {
  await requireUser()
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Help & Support" subtitle="Guides to get the most out of Socialflow." />

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

      <Card className="mt-4">
        <CardHeader><CardTitle>Need more help?</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Reach your account manager or email <a className="text-primary hover:underline" href="mailto:support@socialflow.app">support@socialflow.app</a>.
            Priority support is included on the Enterprise plan.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
