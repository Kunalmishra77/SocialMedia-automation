import { redirect } from 'next/navigation'
import { requireUser, getActiveMembership } from '@/lib/authz'
import { aiConfigured } from '@/lib/ai/client'
import { loadProfileAction, listAuditsAction } from '@/lib/actions/profile-score'
import { PageHeader } from '@/components/dashboard/page-header'
import { ProfileScore } from './profile-score'

export default async function ProfileScorePage() {
  const user = await requireUser()
  const { active } = await getActiveMembership(user.id)
  if (!active) redirect('/workspace/new')
  if (active.role === 'agent') redirect('/')

  const [loaded, history] = await Promise.all([loadProfileAction(), listAuditsAction()])

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <PageHeader
        title="Profile Score"
        subtitle="Your profile is a 3-second decision screen: someone arrives from one reel and decides if there’s more of that here, and if it’s for them. Scored out of 100, fixes in order."
      />
      {!aiConfigured() && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Add an OpenAI or OpenRouter key to enable AI scoring.
        </div>
      )}
      <ProfileScore
        connected={loaded.connected}
        initial={loaded.connected ? loaded.profile : null}
        loadError={loaded.connected ? loaded.error ?? null : null}
        history={history.audits}
        historyNote={history.historyNote ?? null}
      />
    </div>
  )
}
