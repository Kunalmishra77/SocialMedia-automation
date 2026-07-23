'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { getUser, getActiveMembership } from '@/lib/authz'

async function activeWorkspaceId(): Promise<string> {
  const user = await getUser()
  if (!user) redirect('/login')
  const { active } = await getActiveMembership(user.id)
  if (!active) redirect('/workspace/new')
  return active.workspaceId
}

export async function createContactAction(formData: FormData): Promise<{ error?: string }> {
  const workspaceId = await activeWorkspaceId()
  const full_name = String(formData.get('full_name') ?? '').trim()
  const ig_username = String(formData.get('ig_username') ?? '').trim() || null
  const email = String(formData.get('email') ?? '').trim() || null
  const phone = String(formData.get('phone') ?? '').trim() || null
  const tagsRaw = String(formData.get('tags') ?? '').trim()
  const tags = tagsRaw ? tagsRaw.split(',').map((t) => t.trim()).filter(Boolean) : []

  if (!full_name && !ig_username) return { error: 'Enter a name or Instagram username' }

  const admin = createAdminClient()
  await admin.from('contacts').insert({
    workspace_id: workspaceId,
    full_name: full_name || null,
    ig_username,
    email,
    phone,
    tags,
    source: 'manual',
    lifecycle_stage: 'lead',
  })
  revalidatePath('/contacts')
  return {}
}

export async function createLeadAction(formData: FormData): Promise<{ error?: string }> {
  const workspaceId = await activeWorkspaceId()
  const title = String(formData.get('title') ?? '').trim()
  const contact_id = String(formData.get('contact_id') ?? '') || null
  const valueRaw = String(formData.get('value') ?? '').trim()
  const value = valueRaw ? Number(valueRaw) : null
  const stage = String(formData.get('stage') ?? 'new')

  if (!title) return { error: 'Enter a lead title' }

  const admin = createAdminClient()
  await admin.from('leads').insert({
    workspace_id: workspaceId,
    title,
    contact_id,
    value,
    stage,
    source: 'manual',
  })
  revalidatePath('/leads')
  return {}
}

export async function moveLeadStageAction(formData: FormData): Promise<void> {
  const workspaceId = await activeWorkspaceId()
  const leadId = String(formData.get('leadId'))
  const stage = String(formData.get('stage'))
  const valid = ['new', 'contacted', 'follow_up', 'interested', 'converted', 'lost']
  if (!valid.includes(stage)) throw new Error('Invalid stage')

  const admin = createAdminClient()
  const update: Record<string, unknown> = { stage }
  if (stage === 'converted' || stage === 'lost') update.closed_at = new Date().toISOString()
  await admin.from('leads').update(update).eq('id', leadId).eq('workspace_id', workspaceId)
  revalidatePath('/leads')
}
