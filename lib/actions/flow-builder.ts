'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { getUser, getActiveMembership, roleCan } from '@/lib/authz'
import { callAI, aiConfigured } from '@/lib/ai/client'

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

/** AI: generate flow steps from a plain description. */
export async function aiGenerateFlow(description: string): Promise<{ steps?: FlowStep[]; error?: string }> {
  await ctx()
  if (!aiConfigured()) return { error: 'Add an OpenAI/OpenRouter key to use AI.' }
  const d = description.trim()
  if (!d) return { error: 'Describe the flow' }
  const out = await callAI(
    [{ role: 'user', content: `Design an Instagram/Telegram DM automation flow for: "${d}". Return ONLY a JSON array (no prose) of 2-5 steps. Each step is one of:
{"type":"send_message","message":"..."} or {"type":"add_tag","tag":"..."} or {"type":"wait","hours":24}. Make messages warm and short.` }],
    { maxTokens: 400, temperature: 0.6 },
  )
  if (!out) return { error: 'Generation failed' }
  try {
    const json = out.slice(out.indexOf('['), out.lastIndexOf(']') + 1)
    const arr = JSON.parse(json) as Partial<FlowStep>[]
    const steps: FlowStep[] = arr
      .filter((s) => s.type === 'send_message' || s.type === 'add_tag' || s.type === 'wait')
      .map((s) => ({ id: Math.random().toString(36).slice(2, 9), type: s.type as FlowStep['type'], message: s.message, tag: s.tag, hours: s.hours ?? 24 }))
    return steps.length ? { steps } : { error: 'AI returned no valid steps' }
  } catch {
    return { error: 'Could not parse AI output' }
  }
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
