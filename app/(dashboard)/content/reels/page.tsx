import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireUser, getActiveMembership } from '@/lib/authz'
import { createAdminClient } from '@/lib/supabase/admin'
import { aiConfigured } from '@/lib/ai/client'
import { getBrandProfile } from '@/lib/ai/brand'
import { PageHeader } from '@/components/dashboard/page-header'
import { ReelStudio } from './reel-studio'

export default async function ReelStudioPage({ searchParams }: { searchParams: Promise<{ idea?: string | string[] }> }) {
  const { idea } = await searchParams
  const initialIdea = (Array.isArray(idea) ? idea[0] : idea ?? '').slice(0, 600)
  const user = await requireUser()
  const { active } = await getActiveMembership(user.id)
  if (!active) redirect('/workspace/new')
  if (active.role === 'agent') redirect('/')

  const brand = await getBrandProfile(createAdminClient(), active.workspaceId)
  const voiceReady = !!(brand.sample_posts || brand.on_camera)

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <PageHeader
        title="Reel Studio"
        subtitle="One idea → hooks from 26 proven formulas, scored → a timed script with on-screen text → saved as a draft."
      />
      {!aiConfigured() && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Add an OpenAI or OpenRouter key to enable AI generation.
        </div>
      )}
      {aiConfigured() && !voiceReady && (
        <div className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800">
          Scripts are spoken out loud, so voice matters most here. Add 2-3 of your real captions or scripts under{' '}
          <Link href="/settings/brand" className="font-medium underline">Brand → Voice</Link>.
        </div>
      )}
      <ReelStudio initialIdea={initialIdea} />
    </div>
  )
}
