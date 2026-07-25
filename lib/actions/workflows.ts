'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { getUser, getActiveMembership, roleCan } from '@/lib/authz'
import { WORKFLOW_TEMPLATES } from '@/lib/workflow-templates'

async function ctx() {
  const user = await getUser()
  if (!user) redirect('/login')
  const { active } = await getActiveMembership(user.id)
  if (!active) redirect('/workspace/new')
  if (!roleCan(active.role, 'manage_content')) throw new Error('Forbidden')
  return { user, workspaceId: active.workspaceId }
}

export async function activateTemplateAction(formData: FormData): Promise<void> {
  const { user, workspaceId } = await ctx()
  const key = String(formData.get('key'))
  const tpl = WORKFLOW_TEMPLATES.find((t) => t.key === key)
  if (!tpl) throw new Error('Unknown template')

  const admin = createAdminClient()
  await admin.from('workflow_automations').insert({
    workspace_id: workspaceId,
    name: tpl.name,
    trigger_type: tpl.trigger,
    is_active: true,
    trigger_config: {},
    nodes: [{ id: 'start', type: 'trigger', config: { trigger: tpl.trigger } }],
    edges: [],
    created_by: user.id,
  })
  revalidatePath('/automation/flows')
}

export async function toggleWorkflowAction(formData: FormData): Promise<void> {
  const { workspaceId } = await ctx()
  const id = String(formData.get('id'))
  const isActive = formData.get('is_active') === 'true'
  const admin = createAdminClient()
  await admin.from('workflow_automations').update({ is_active: isActive }).eq('id', id).eq('workspace_id', workspaceId)
  revalidatePath('/automation/flows')
}

export async function deleteWorkflowAction(formData: FormData): Promise<void> {
  const { workspaceId } = await ctx()
  const id = String(formData.get('id'))
  const admin = createAdminClient()
  await admin.from('workflow_automations').delete().eq('id', id).eq('workspace_id', workspaceId)
  revalidatePath('/automation/flows')
}
