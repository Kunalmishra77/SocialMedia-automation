'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { requirePlatformAdmin, can, writeAudit } from '@/lib/platform-admin/auth'

const VALID_PLANS = ['free', 'starter', 'pro', 'enterprise']

function slugify(name: string): string {
  return (
    name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'client'
  )
}

/**
 * Provision a new client: create the owner user + their isolated workspace and
 * make them super_admin. The client then logs in to their own portal (RLS-isolated).
 */
export async function createClientAction(
  _prev: { error?: string; credentials?: { email: string; password: string; loginUrl: string } },
  formData: FormData,
): Promise<{ error?: string; credentials?: { email: string; password: string; loginUrl: string } }> {
  const ctx = await requirePlatformAdmin()
  if (!can(ctx, 'manage_workspaces')) throw new Error('Forbidden')

  const workspaceName = String(formData.get('workspaceName') ?? '').trim()
  const ownerEmail = String(formData.get('ownerEmail') ?? '').trim().toLowerCase()
  const plan = String(formData.get('plan') ?? 'starter')
  let password = String(formData.get('password') ?? '').trim()

  if (workspaceName.length < 2) return { error: 'Workspace name is too short' }
  if (!ownerEmail.includes('@')) return { error: 'Enter a valid owner email' }
  if (!VALID_PLANS.includes(plan)) return { error: 'Invalid plan' }
  if (!password) password = Math.random().toString(36).slice(2, 6) + 'A' + Math.random().toString(36).slice(2, 6) + '9!'
  if (password.length < 8) return { error: 'Password must be at least 8 characters' }

  const admin = createAdminClient()

  // Create or reuse the owner user.
  let userId: string
  const { data: existingProfile } = await admin.from('profiles').select('id').eq('email', ownerEmail).maybeSingle()
  if (existingProfile) {
    userId = existingProfile.id
  } else {
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email: ownerEmail,
      password,
      email_confirm: true,
    })
    if (createErr || !created.user) return { error: createErr?.message ?? 'Could not create owner user' }
    userId = created.user.id
  }

  // Unique slug.
  const baseSlug = slugify(workspaceName)
  let slug = baseSlug
  let n = 1
  while (true) {
    const { data } = await admin.from('workspaces').select('id').eq('slug', slug).maybeSingle()
    if (!data) break
    n += 1
    slug = `${baseSlug}-${n}`
  }

  const { data: ws, error: wsErr } = await admin
    .from('workspaces')
    .insert({ name: workspaceName, slug, plan, owner_email: ownerEmail, status: 'active' })
    .select('id')
    .single()
  if (wsErr || !ws) return { error: wsErr?.message ?? 'Could not create workspace' }

  await admin
    .from('workspace_members')
    .upsert({ workspace_id: ws.id, user_id: userId, role: 'super_admin' }, { onConflict: 'workspace_id,user_id' })

  await writeAudit(ctx, 'client.create', {
    type: 'workspace', id: ws.id, label: workspaceName, metadata: { ownerEmail, plan },
  })

  revalidatePath('/platform-admin/workspaces')
  const base = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  return { credentials: { email: ownerEmail, password, loginUrl: `${base}/login` } }
}

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
