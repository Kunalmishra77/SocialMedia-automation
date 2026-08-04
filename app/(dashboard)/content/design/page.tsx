import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireUser, getActiveMembership } from '@/lib/authz'
import { createAdminClient } from '@/lib/supabase/admin'
import { aiConfigured } from '@/lib/ai/client'
import { getBrandProfile, brandIsConfigured } from '@/lib/ai/brand'
import { PageHeader } from '@/components/dashboard/page-header'
import { DesignEditor } from './design-editor'

export default async function DesignStudioPage() {
  const user = await requireUser()
  const { active } = await getActiveMembership(user.id)
  if (!active) redirect('/workspace/new')
  if (active.role === 'agent') redirect('/')

  const admin = createAdminClient()
  const brand = await getBrandProfile(admin, active.workspaceId)

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <PageHeader title="Design Studio" subtitle="Enter a topic → AI writes the copy & designs a branded post → edit freely on the canvas → schedule." />
      {!aiConfigured() && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">Add an OpenAI key to generate designs.</div>
      )}
      {aiConfigured() && !brandIsConfigured(brand) && (
        <div className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800">
          Tip: fill your <Link href="/settings/brand" className="font-medium underline">brand profile</Link> (colors, logo) so designs match your brand.
        </div>
      )}
      <DesignEditor />
    </div>
  )
}
