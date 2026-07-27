import Link from 'next/link'
import { redirect } from 'next/navigation'
import { CheckCircle2, Circle, ArrowRight } from 'lucide-react'
import { requireUser, getActiveMembership } from '@/lib/authz'
import { createAdminClient } from '@/lib/supabase/admin'
import { PageHeader } from '@/components/dashboard/page-header'
import { Card, CardContent } from '@/components/ui/card'

interface Step {
  title: string
  desc: string
  href: string
  cta: string
  done: boolean
}

export default async function SetupCenterPage() {
  const user = await requireUser()
  const { active } = await getActiveMembership(user.id)
  if (!active) redirect('/workspace/new')

  const admin = createAdminClient()
  const ws = active.workspaceId
  const [channels, kb, persona, flows, activeFlows, content, scheduled] = await Promise.all([
    admin.from('channel_accounts').select('id', { count: 'exact', head: true }).eq('workspace_id', ws).eq('is_active', true),
    admin.from('knowledge_base').select('id', { count: 'exact', head: true }).eq('workspace_id', ws),
    admin.from('workspaces').select('settings').eq('id', ws).maybeSingle(),
    admin.from('workflow_automations').select('id', { count: 'exact', head: true }).eq('workspace_id', ws),
    admin.from('workflow_automations').select('id', { count: 'exact', head: true }).eq('workspace_id', ws).eq('is_active', true),
    admin.from('content_posts').select('id', { count: 'exact', head: true }).eq('workspace_id', ws),
    admin.from('content_posts').select('id', { count: 'exact', head: true }).eq('workspace_id', ws).eq('status', 'scheduled'),
  ])

  const personaSet = !!((persona.data?.settings as { persona?: string } | null)?.persona ?? '').trim()

  const steps: Step[] = [
    { title: 'Account created', desc: 'Your workspace is live.', href: '/', cta: 'Dashboard', done: true },
    { title: 'Connect a social account', desc: 'Connect Instagram or Telegram to start automating.', href: '/accounts', cta: 'Connect', done: (channels.count ?? 0) > 0 },
    { title: 'Set up your AI persona', desc: 'Teach the AI your brand voice so replies sound like you.', href: '/knowledge-base', cta: 'Set persona', done: personaSet },
    { title: 'Add knowledge', desc: 'Add FAQs / info so the AI answers accurately.', href: '/knowledge-base', cta: 'Add knowledge', done: (kb.count ?? 0) > 0 },
    { title: 'Create your first automation', desc: 'Build a flow or start from a template.', href: '/automation/flows', cta: 'Build flow', done: (flows.count ?? 0) > 0 },
    { title: 'Create content', desc: 'Draft a post — use AI to write the caption.', href: '/content', cta: 'Create post', done: (content.count ?? 0) > 0 },
    { title: 'Schedule your first post', desc: 'Pick a date & time to auto-publish.', href: '/content', cta: 'Schedule', done: (scheduled.count ?? 0) > 0 },
    { title: 'Activate an automation', desc: 'Turn a flow on so it runs 24/7.', href: '/automation/flows', cta: 'Activate', done: (activeFlows.count ?? 0) > 0 },
  ]

  const doneCount = steps.filter((s) => s.done).length
  const pct = Math.round((doneCount / steps.length) * 100)
  const nextStep = steps.find((s) => !s.done)

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Setup Center" subtitle="Get your automation fully operational, step by step." />

      {/* Progress */}
      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="mb-2 flex items-end justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Your setup</p>
              <p className="text-2xl font-bold">{pct}% complete</p>
            </div>
            <span className="text-sm text-muted-foreground">{doneCount}/{steps.length} done</span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
          </div>
          {nextStep ? (
            <div className="mt-4 flex items-center justify-between rounded-lg border border-primary/20 bg-primary/5 px-4 py-3">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-primary">Next up</p>
                <p className="text-sm font-medium">{nextStep.title}</p>
              </div>
              <Link href={nextStep.href} className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:brightness-110">
                {nextStep.cta} <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          ) : (
            <p className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">🎉 You&apos;re fully set up! Your automation is ready to run.</p>
          )}
        </CardContent>
      </Card>

      {/* Steps */}
      <div className="space-y-2">
        {steps.map((s) => (
          <Card key={s.title} className={s.done ? 'opacity-70' : ''}>
            <CardContent className="flex items-center justify-between gap-4 py-4">
              <div className="flex items-start gap-3">
                {s.done ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" /> : <Circle className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground/40" />}
                <div>
                  <p className={`text-sm font-medium ${s.done ? 'line-through decoration-muted-foreground/40' : ''}`}>{s.title}</p>
                  <p className="text-xs text-muted-foreground">{s.desc}</p>
                </div>
              </div>
              {!s.done && (
                <Link href={s.href} className="shrink-0 text-sm font-medium text-primary hover:underline">{s.cta} →</Link>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
