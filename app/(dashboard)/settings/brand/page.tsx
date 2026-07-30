import { redirect } from 'next/navigation'
import { requireUser, getActiveMembership, roleCan } from '@/lib/authz'
import { createAdminClient } from '@/lib/supabase/admin'
import { getBrandProfile } from '@/lib/ai/brand'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { BrandForm } from './brand-form'

export default async function BrandProfilePage() {
  const user = await requireUser()
  const { active } = await getActiveMembership(user.id)
  if (!active) redirect('/workspace/new')
  if (!roleCan(active.role, 'manage_workspace') && active.role !== 'manager') redirect('/')

  const admin = createAdminClient()
  const profile = await getBrandProfile(admin, active.workspaceId)

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Brand profile</h1>
        <p className="text-sm text-muted-foreground">
          The AI uses this to write on-brand content in AI Studio. The more you fill in, the more personalised every post.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Business & brand</CardTitle>
          <CardDescription>Who you are, who you serve, and how you sound.</CardDescription>
        </CardHeader>
        <CardContent>
          <BrandForm profile={profile} />
        </CardContent>
      </Card>
    </div>
  )
}
