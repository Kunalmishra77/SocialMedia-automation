'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { getUser, getActiveMembership, roleCan } from '@/lib/authz'

export interface FlowStep {
  id: string
  type: 'send_message' | 'add_tag' | 'assign' | 'wait'
  message?: string
  tag?: string
  hours?: number
}

async function ctx() {
  const user = await getUser()
  if (!user) redirect('/login')
  const { active } = await getActiveMembership(user.id)
  if (!active) redirect('/workspace/new')
  if (!roleCan(active.role, 'manage_content')) throw new Error('Forbidden')
  return { user, workspaceId: active.workspaceId }
}

/** Create a blank custom flow and open its builder. */
export async function createCustomFlowAction(formData: FormData): Promise<void> {
  const { user, workspaceId } = await ctx()
  const name = String(formData.get('name') ?? '').trim() || 'Untitled flow'
  const trigger = String(formData.get('trigger') ?? 'first_dm')
  const keyword = String(formData.get('keyword') ?? '').trim()

  const admin = createAdminClient()
  const { data } = await admin
    .from('workflow_automations')
    .insert({
      workspace_id: workspaceId,
      name,
      trigger_type: trigger,
      trigger_config: keyword ? { keyword } : {},
      is_active: false,
      nodes: [],
      created_by: user.id,
    })
    .select('id')
    .single()
  revalidatePath('/automation/flows')
  if (data) redirect(`/automation/flows/${data.id}`)
}

/** Save the flow's steps (nodes) + trigger. */
export async function saveFlowAction(formData: FormData): Promise<{ ok?: boolean }> {
  const { workspaceId } = await ctx()
  const id = String(formData.get('id'))
  const name = String(formData.get('name') ?? '').trim() || 'Untitled flow'
  const trigger = String(formData.get('trigger') ?? 'first_dm')
  const keyword = String(formData.get('keyword') ?? '').trim()
  let steps: FlowStep[] = []
  try { steps = JSON.parse(String(formData.get('steps') ?? '[]')) } catch { steps = [] }

  const admin = createAdminClient()
  await admin
    .from('workflow_automations')
    .update({ name, trigger_type: trigger, trigger_config: keyword ? { keyword } : {}, nodes: steps })
    .eq('id', id)
    .eq('workspace_id', workspaceId)
  revalidatePath(`/automation/flows/${id}`)
  return { ok: true }
}

export async function setFlowActiveAction(formData: FormData): Promise<void> {
  const { workspaceId } = await ctx()
  const id = String(formData.get('id'))
  const isActive = formData.get('is_active') === 'true'
  const admin = createAdminClient()
  await admin.from('workflow_automations').update({ is_active: isActive }).eq('id', id).eq('workspace_id', workspaceId)
  revalidatePath(`/automation/flows/${id}`)
  revalidatePath('/automation/flows')
}
