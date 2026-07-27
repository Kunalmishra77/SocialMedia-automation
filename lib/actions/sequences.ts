'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { getUser, getActiveMembership } from '@/lib/authz'

async function ctx() {
  const user = await getUser()
  if (!user) redirect('/login')
  const { active } = await getActiveMembership(user.id)
  if (!active) redirect('/workspace/new')
  if (active.role === 'agent') throw new Error('Forbidden')
  return active.workspaceId
}

/** Create a drip sequence. Steps: [{ delay_hours, message }]. */
export async function createSequenceAction(formData: FormData): Promise<{ error?: string }> {
  const workspaceId = await ctx()
  const name = String(formData.get('name') ?? '').trim()
  // steps come as parallel arrays step_delay[] and step_message[]
  const delays = formData.getAll('step_delay').map((d) => Number(d) || 0)
  const messages = formData.getAll('step_message').map((m) => String(m).trim())
  const steps = messages
    .map((message, i) => ({ delay_hours: delays[i] ?? 0, message }))
    .filter((s) => s.message)
  if (!name || steps.length === 0) return { error: 'Name and at least one step required' }

  const admin = createAdminClient()
  await admin.from('follow_up_sequences').insert({ workspace_id: workspaceId, name, is_active: true, steps })
  revalidatePath('/automation/sequences')
  return {}
}

export async function toggleSequenceAction(formData: FormData): Promise<void> {
  const workspaceId = await ctx()
  const id = String(formData.get('id'))
  const isActive = formData.get('is_active') === 'true'
  const admin = createAdminClient()
  await admin.from('follow_up_sequences').update({ is_active: isActive }).eq('id', id).eq('workspace_id', workspaceId)
  revalidatePath('/automation/sequences')
}

export async function deleteSequenceAction(formData: FormData): Promise<void> {
  const workspaceId = await ctx()
  const id = String(formData.get('id'))
  const admin = createAdminClient()
  await admin.from('follow_up_sequences').delete().eq('id', id).eq('workspace_id', workspaceId)
  revalidatePath('/automation/sequences')
}
