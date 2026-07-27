import Link from 'next/link'
import { GitBranch, ArrowRight } from 'lucide-react'
import { requirePlatformAdmin } from '@/lib/platform-admin/auth'
import { getOnboardingFunnel } from '@/lib/platform-admin/command-center'
import { PageHeader, Panel, timeAgo } from '../ui'

const STAGES: { key: string; label: string }[] = [
  { key: 'created', label: 'Created' },
  { key: 'link_opened', label: 'Link opened' },
  { key: 'platforms', label: 'Platforms picked' },
  { key: 'submitted', label: 'Submitted' },
  { key: 'pending_approval', label: 'Pending approval' },
  { key: 'active', label: 'Activated' },
]
const STAGE_STYLE: Record<string, string> = {
  created: 'bg-zinc-700/40 text-zinc-300',
  link_opened: 'bg-sky-500/15 text-sky-400',
  platforms: 'bg-indigo-500/15 text-indigo-300',
  submitted: 'bg-violet-500/15 text-violet-300',
  pending_approval: 'bg-amber-500/15 text-amber-400',
}

export default async function OnboardingPage() {
  await requirePlatformAdmin()
  const r = await getOnboardingFunnel()
  const maxCount = Math.max(...STAGES.map((s) => r.counts[s.key as keyof typeof r.counts] ?? 0), 1)

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader title="Onboarding" subtitle="Track where every client is in the funnel — and who's stuck." />

      {/* Funnel */}
      <Panel title="Funnel">
        <div className="space-y-2">
          {STAGES.map((s, i) => {
            const c = r.counts[s.key as keyof typeof r.counts] ?? 0
            const pct = Math.round((c / maxCount) * 100)
            return (
              <div key={s.key} className="flex items-center gap-3">
                <span className="w-32 shrink-0 text-xs text-zinc-400">{i + 1}. {s.label}</span>
                <div className="h-5 flex-1 overflow-hidden rounded bg-zinc-800">
                  <div className="flex h-full items-center rounded bg-indigo-500/70 px-2 text-[11px] font-medium text-white" style={{ width: `${Math.max(pct, c > 0 ? 8 : 0)}%` }}>{c > 0 ? c : ''}</div>
                </div>
              </div>
            )
          })}
        </div>
      </Panel>

      {/* In-flight clients */}
      <Panel title="In-flight clients" right={<span className="text-xs text-zinc-500">{r.clients.length} not yet activated</span>}>
        {r.clients.length === 0 ? (
          <div className="py-8 text-center text-sm text-zinc-500">
            <GitBranch className="mx-auto mb-2 h-6 w-6 text-zinc-700" />
            No clients mid-onboarding.
          </div>
        ) : (
          <div className="divide-y divide-zinc-800">
            {r.clients.map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium text-zinc-200">{c.name}</p>
                  <p className="text-xs text-zinc-500">{c.owner_email} · {c.plan ?? 'no plan'} · {c.platforms} platform(s) · started {timeAgo(c.created_at)}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STAGE_STYLE[c.stage] ?? 'bg-zinc-700/40 text-zinc-300'}`}>
                    {STAGES.find((s) => s.key === c.stage)?.label ?? c.stage}
                  </span>
                  {c.stage === 'pending_approval' && (
                    <Link href="/platform-admin/approvals" className="text-indigo-400 hover:text-indigo-300"><ArrowRight className="h-4 w-4" /></Link>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  )
}
