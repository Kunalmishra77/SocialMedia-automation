'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { requirePlatformAdmin, can, writeAudit } from '@/lib/platform-admin/auth'
import { provisionOwnerWithSetPasswordLink } from '@/lib/auth-provisioning'
import { sendMail, setPasswordEmailHtml } from '@/lib/email'
import { refreshMetaHealthCache } from '@/lib/platform-admin/meta-monitor'

/** On-demand Meta health probe (the "Check Now" button). */
export async function refreshMetaHealthAction(): Promise<void> {
  const ctx = await requirePlatformAdmin()
  if (!can(ctx, 'view_system_health')) throw new Error('Forbidden')
  await refreshMetaHealthCache()
  await writeAudit(ctx, 'meta.health_probe', { type: 'meta' })
  revalidatePath('/platform-admin/meta')
}

export interface ClientAccessState { error?: string; password?: string; link?: string; emailed?: boolean }

/** Operator sets/resets a workspace owner's password directly (shown once, never stored). */
export async function setClientPasswordAction(_prev: ClientAccessState, formData: FormData): Promise<ClientAccessState> {
  const ctx = await requirePlatformAdmin()
  if (!can(ctx, 'manage_workspaces')) return { error: 'Forbidden' }

  const workspaceId = String(formData.get('workspaceId') ?? '')
  const password = String(formData.get('password') ?? '')
  if (password.length < 8) return { error: 'Password must be at least 8 characters.' }

  const admin = createAdminClient()
  const { data: ws } = await admin.from('workspaces').select('owner_email').eq('id', workspaceId).maybeSingle()
  if (!ws?.owner_email) return { error: 'Client has no owner email.' }
  const { data: profile } = await admin.from('profiles').select('id').eq('email', ws.owner_email).maybeSingle()
  if (!profile) return { error: 'Owner account not found — approve the client first.' }

  const { error } = await admin.auth.admin.updateUserById(profile.id, { password })
  if (error) return { error: error.message }

  await writeAudit(ctx, 'client.password_set', { type: 'workspace', id: workspaceId, label: ws.owner_email })
  return { password, emailed: false }
}

/** Regenerate a fresh set-password (login) link for the owner and re-email it. */
export async function generateLoginLinkAction(_prev: ClientAccessState, formData: FormData): Promise<ClientAccessState> {
  const ctx = await requirePlatformAdmin()
  if (!can(ctx, 'manage_workspaces')) return { error: 'Forbidden' }

  const workspaceId = String(formData.get('workspaceId') ?? '')
  const admin = createAdminClient()
  const { data: ws } = await admin.from('workspaces').select('name, owner_email').eq('id', workspaceId).maybeSingle()
  if (!ws?.owner_email) return { error: 'Client has no owner email.' }

  const prov = await provisionOwnerWithSetPasswordLink(admin, ws.owner_email)
  if (!prov?.setPasswordUrl) return { error: 'Could not generate a link — check Supabase redirect URLs.' }

  let emailed = false
  try {
    emailed = await sendMail({
      to: ws.owner_email,
      subject: `Set your password — ${ws.name} on Socialflow`,
      html: setPasswordEmailHtml({ workspaceName: ws.name, email: ws.owner_email, setPasswordUrl: prov.setPasswordUrl }),
    })
  } catch { emailed = false }

  await admin.from('workspaces').update({
    onboarding_data: { activation: { email: ws.owner_email, setPasswordUrl: prov.setPasswordUrl, sentAt: new Date().toISOString() } },
  }).eq('id', workspaceId)

  await writeAudit(ctx, 'client.login_link', { type: 'workspace', id: workspaceId, label: ws.owner_email, metadata: { emailed } })
  return { link: prov.setPasswordUrl, emailed }
}

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
  _prev: { error?: string; credentials?: { email: string; setPasswordUrl: string | null; loginUrl: string } },
  formData: FormData,
): Promise<{ error?: string; credentials?: { email: string; setPasswordUrl: string | null; loginUrl: string } }> {
  const ctx = await requirePlatformAdmin()
  if (!can(ctx, 'manage_workspaces')) throw new Error('Forbidden')

  const workspaceName = String(formData.get('workspaceName') ?? '').trim()
  const ownerEmail = String(formData.get('ownerEmail') ?? '').trim().toLowerCase()
  const plan = String(formData.get('plan') ?? 'starter')

  if (workspaceName.length < 2) return { error: 'Workspace name is too short' }
  if (!ownerEmail.includes('@')) return { error: 'Enter a valid owner email' }
  if (!VALID_PLANS.includes(plan)) return { error: 'Invalid plan' }

  const admin = createAdminClient()

  // Create/reuse the owner user WITHOUT a plaintext password + mint a set-password link.
  const prov = await provisionOwnerWithSetPasswordLink(admin, ownerEmail)
  if (!prov) return { error: 'Could not create owner user' }

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
    .upsert({ workspace_id: ws.id, user_id: prov.userId, role: 'super_admin' }, { onConflict: 'workspace_id,user_id' })

  const base = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  if (prov.setPasswordUrl) {
    await sendMail({
      to: ownerEmail,
      subject: `Your Socialflow workspace "${workspaceName}" is ready 🎉`,
      html: setPasswordEmailHtml({ workspaceName, email: ownerEmail, setPasswordUrl: prov.setPasswordUrl }),
    })
  }

  await writeAudit(ctx, 'client.create', {
    type: 'workspace', id: ws.id, label: workspaceName, metadata: { ownerEmail, plan },
  })

  revalidatePath('/platform-admin/workspaces')
  return { credentials: { email: ownerEmail, setPasswordUrl: prov.setPasswordUrl, loginUrl: `${base}/login` } }
}

export async function createAnnouncementAction(formData: FormData): Promise<void> {
  const ctx = await requirePlatformAdmin()
  if (!can(ctx, 'broadcast')) throw new Error('Forbidden')

  const title = String(formData.get('title') ?? '').trim()
  const body = String(formData.get('body') ?? '').trim()
  const scope = String(formData.get('scope') ?? 'all') // all | starter | pro | enterprise
  const scheduledFor = String(formData.get('scheduledFor') ?? '').trim()
  if (title.length < 3 || body.length < 3) throw new Error('Title and body are required')

  const audience = scope === 'all' ? { scope: 'all' } : { scope: 'plan', plan: scope }

  // Schedule for the future, or publish immediately.
  const scheduledDate = scheduledFor ? new Date(scheduledFor) : null
  const isFuture = scheduledDate && scheduledDate.getTime() > Date.now()

  const admin = createAdminClient()
  await admin.from('platform_announcements').insert({
    title,
    body,
    audience,
    channels: ['in_app'],
    created_by: ctx.userId,
    scheduled_for: isFuture ? scheduledDate!.toISOString() : null,
    published_at: isFuture ? null : new Date().toISOString(),
  })

  await writeAudit(ctx, isFuture ? 'announcement.schedule' : 'announcement.publish', { type: 'announcement', label: title, metadata: { scope, scheduledFor: isFuture ? scheduledDate!.toISOString() : null } })
  revalidatePath('/platform-admin/communication')
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
