import { redirect } from 'next/navigation'
import { Camera } from 'lucide-react'
import { requireUser, getActiveMembership } from '@/lib/authz'
import { createAdminClient } from '@/lib/supabase/admin'
import { aiConfigured } from '@/lib/ai/client'
import { getConnectedIg } from '@/lib/ig/account'
import { PageHeader } from '@/components/dashboard/page-header'
import { EmptyState } from '@/components/ui/empty-state'
import { PostAudit } from './post-audit'

export default async function PostAuditPage() {
  const user = await requireUser()
  const { active } = await getActiveMembership(user.id)
  if (!active) redirect('/workspace/new')
  if (active.role === 'agent') redirect('/')

  const conn = await getConnectedIg(createAdminClient(), active.workspaceId)

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <PageHeader title="Post Audit" subtitle="Which posts beat your own normal, and why" />
      {conn ? (
        <PostAudit handle={conn.handle} aiReady={aiConfigured()} />
      ) : (
        <EmptyState
          icon={Camera}
          title="Connect Instagram to audit your posts"
          description="The audit reads your own recent posts and ranks them against your own median, so it needs a connected Instagram account."
          primary={{ label: 'Connect Instagram', href: '/settings/channels' }}
        />
      )}
    </div>
  )
}
