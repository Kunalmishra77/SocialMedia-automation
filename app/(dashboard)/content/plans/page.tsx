import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireUser, getActiveMembership, roleCan } from '@/lib/authz'
import { createAdminClient } from '@/lib/supabase/admin'
import { aiConfigured } from '@/lib/ai/client'
import { PageHeader } from '@/components/dashboard/page-header'
import { PlansManager, type Plan } from './plans-client'

export default async function PlansPage() {
  const user = await requireUser()
  const { active } = await getActiveMembership(user.id)
  if (!active) redirect('/workspace/new')
  if (!roleCan(active.role, 'manage_content') && active.role !== 'manager') redirect('/')

  const admin = createAdminClient()
  const { data: plans } = await admin
    .from('content_plans')
    .select('id, name, platforms, frequency, days_of_week, time_of_day, timezone, themes, mode, is_active, next_run_at')
    .eq('workspace_id', active.workspaceId)
    .order('created_at', { ascending: false })

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <PageHeader title="Content plans · Auto-Pilot" subtitle="Set a cadence and let AI generate posts on schedule — into your approval queue, or fully hands-off." />

      {!aiConfigured() && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Add an OpenAI/OpenRouter key to enable automated generation.
        </div>
      )}

      <div className="rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
        Plans use your <Link href="/settings/brand" className="font-medium text-primary underline">brand profile</Link> to stay on-brand.
        Manual plans drop posts into <Link href="/content" className="font-medium text-primary underline">approval</Link>; Auto-Pilot schedules them automatically.
      </div>

      <PlansManager plans={(plans ?? []) as Plan[]} />
    </div>
  )
}
