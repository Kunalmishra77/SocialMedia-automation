import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireUser, getActiveMembership } from '@/lib/authz'
import { createAdminClient } from '@/lib/supabase/admin'
import { aiConfigured } from '@/lib/ai/client'
import { getBrandProfile, brandIsConfigured } from '@/lib/ai/brand'
import { PageHeader } from '@/components/dashboard/page-header'
import { Studio } from './studio'

export default async function StudioPage() {
  const user = await requireUser()
  const { active } = await getActiveMembership(user.id)
  if (!active) redirect('/workspace/new')
  if (active.role === 'agent') redirect('/')

  const admin = createAdminClient()
  const brand = await getBrandProfile(admin, active.workspaceId)
  const configured = aiConfigured()
  const brandReady = brandIsConfigured(brand)

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <PageHeader title="AI Studio" subtitle="Enter a topic → AI writes the post & designs a visual → you review, approve and schedule." />

      {!configured && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Add an OpenAI or OpenRouter key to enable AI generation.
        </div>
      )}
      {configured && !brandReady && (
        <div className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800">
          Tip: fill in your <Link href="/settings/brand" className="font-medium underline">brand profile</Link> so posts sound like your business, not generic AI.
        </div>
      )}

      <Studio />
    </div>
  )
}
