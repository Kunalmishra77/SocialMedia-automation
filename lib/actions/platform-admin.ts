'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { requirePlatformAdmin, can, writeAudit } from '@/lib/platform-admin/auth'

const VALID_PLANS = ['free', 'starter', 'pro', 'enterprise']

export async function suspendWorkspaceAction(formData: FormData): Promise<void> {
  const ctx = await requirePlatformAdmin()
  if (!can(ctx, 'manage_workspaces')) throw new Error('Forbidden')

  const id = String(formData.get('workspaceId'))
  const reason = String(formData.get('reason') ?? '').trim() || null

  const admin = createAdminClient()
  const { data: ws } = await admin.from('workspaces').select('name').eq('id', id).maybeSingle()

  await admin
    .from('workspaces')
    .update({ status: 'suspended', suspended_at: new Date().toISOString(), suspended_reason: reason })
    .eq('id', id)

  await writeAudit(ctx, 'workspace.suspend', {
    type: 'workspace', id, label: ws?.name, metadata: { reason },
  })
  revalidatePath(`/platform-admin/workspaces/${id}`)
  revalidatePath('/platform-admin/workspaces')
}

export async function activateWorkspaceAction(formData: FormData): Promise<void> {
  const ctx = await requirePlatformAdmin()
  if (!can(ctx, 'manage_workspaces')) throw new Error('Forbidden')

  const id = String(formData.get('workspaceId'))
  const admin = createAdminClient()
  const { data: ws } = await admin.from('workspaces').select('name').eq('id', id).maybeSingle()

  await admin
    .from('workspaces')
    .update({ status: 'active', suspended_at: null, suspended_reason: null })
    .eq('id', id)

  await writeAudit(ctx, 'workspace.activate', { type: 'workspace', id, label: ws?.name })
  revalidatePath(`/platform-admin/workspaces/${id}`)
  revalidatePath('/platform-admin/workspaces')
}

export async function changePlanAction(formData: FormData): Promise<void> {
  const ctx = await requirePlatformAdmin()
  if (!can(ctx, 'manage_billing') && !can(ctx, 'manage_workspaces')) throw new Error('Forbidden')

  const id = String(formData.get('workspaceId'))
  const plan = String(formData.get('plan'))
  if (!VALID_PLANS.includes(plan)) throw new Error('Invalid plan')

  const admin = createAdminClient()
  const { data: ws } = await admin.from('workspaces').select('name, plan').eq('id', id).maybeSingle()

  await admin.from('workspaces').update({ plan }).eq('id', id)

  await writeAudit(ctx, 'workspace.plan_change', {
    type: 'workspace', id, label: ws?.name, metadata: { from: ws?.plan, to: plan },
  })
  revalidatePath(`/platform-admin/workspaces/${id}`)
  revalidatePath('/platform-admin/workspaces')
}
