import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { requireUser, getActiveMembership } from '@/lib/authz'
import { createAdminClient } from '@/lib/supabase/admin'
import type { FlowStep } from '@/lib/actions/flow-builder'
import { FlowEditor } from './flow-editor'

export default async function FlowBuilderPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser()
  const { active } = await getActiveMembership(user.id)
  if (!active) redirect('/workspace/new')
  if (active.role === 'agent') redirect('/')
  const { id } = await params

  const admin = createAdminClient()
  const { data: flow } = await admin
    .from('workflow_automations')
    .select('id, name, trigger_type, trigger_config, nodes, is_active')
    .eq('id', id)
    .eq('workspace_id', active.workspaceId)
    .maybeSingle()
  if (!flow) notFound()

  const keyword = (flow.trigger_config as { keyword?: string } | null)?.keyword ?? ''

  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/automation/flows" className="text-sm text-primary hover:underline">← All automation</Link>
      <div className="mt-3">
        <FlowEditor
          id={flow.id}
          initialName={flow.name}
          initialTrigger={flow.trigger_type}
          initialKeyword={keyword}
          initialSteps={(flow.nodes as FlowStep[]) ?? []}
          initialActive={flow.is_active}
        />
      </div>
    </div>
  )
}
