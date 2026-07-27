'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { requirePlatformAdmin, can, writeAudit } from '@/lib/platform-admin/auth'

const VALID_ROLES = ['platform_owner', 'platform_admin', 'platform_support', 'platform_billing']

/** Grant platform-admin access to an existing user by email. */
export async function addPlatformAdminAction(formData: FormData): Promise<{ error?: string }> {
  const ctx = await requirePlatformAdmin()
  if (!can(ctx, 'manage_platform_admins')) throw new Error('Forbidden')

  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  const role = String(formData.get('role') ?? 'platform_support')
  if (!email || !VALID_ROLES.includes(role)) return { error: 'Valid email and role required' }

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('id, email')
    .eq('email', email)
    .maybeSingle()
  if (!profile) return { error: 'No user with that email. They must sign up first.' }

  await admin
    .from('platform_admins')
    .upsert(
      { user_id: profile.id, email: profile.email, role, is_active: true },
      { onConflict: 'user_id' },
    )
  await admin.from('profiles').update({ is_platform_admin: true }).eq('id', profile.id)

  await writeAudit(ctx, 'platform_admin.grant', { type: 'user', id: profile.id, label: email, metadata: { role } })
  revalidatePath('/platform-admin/admins')
  return {}
}

/** Change a platform admin's role (RBAC). Owner-only via manage_platform_admins. */
export async function setPlatformAdminRoleAction(formData: FormData): Promise<void> {
  const ctx = await requirePlatformAdmin()
  if (!can(ctx, 'manage_platform_admins')) throw new Error('Forbidden')

  const id = String(formData.get('id'))
  const role = String(formData.get('role') ?? '')
  if (!VALID_ROLES.includes(role)) throw new Error('Invalid role')

  const admin = createAdminClient()
  // Guard: never leave the platform without an owner.
  if (role !== 'platform_owner') {
    const { data: target } = await admin.from('platform_admins').select('role').eq('id', id).maybeSingle()
    if (target?.role === 'platform_owner') {
      const { count } = await admin.from('platform_admins').select('id', { count: 'exact', head: true }).eq('role', 'platform_owner').eq('is_active', true)
      if ((count ?? 0) <= 1) throw new Error('Cannot demote the last active owner')
    }
  }

  const { data: row } = await admin.from('platform_admins').update({ role }).eq('id', id).select('email').maybeSingle()
  await writeAudit(ctx, 'platform_admin.role_change', { type: 'platform_admin', id, label: row?.email, metadata: { role } })
  revalidatePath('/platform-admin/admins')
}

/** Save per-admin extra permission grants (beyond their role defaults). */
export async function setPlatformAdminPermissionsAction(formData: FormData): Promise<void> {
  const ctx = await requirePlatformAdmin()
  if (!can(ctx, 'manage_platform_admins')) throw new Error('Forbidden')
  const { ALL_PLATFORM_PERMISSIONS } = await import('@/lib/platform-admin/auth')

  const id = String(formData.get('id'))
  // Only store permissions explicitly checked (role defaults are applied at runtime).
  const perms = ALL_PLATFORM_PERMISSIONS.filter((p) => formData.get(`perm_${p}`) === 'on')

  const admin = createAdminClient()
  const { data: row } = await admin.from('platform_admins').update({ permissions: perms }).eq('id', id).select('email').maybeSingle()
  await writeAudit(ctx, 'platform_admin.permissions_change', { type: 'platform_admin', id, label: row?.email, metadata: { permissions: perms } })
  revalidatePath('/platform-admin/admins')
}

export async function setPlatformAdminActiveAction(formData: FormData): Promise<void> {
  const ctx = await requirePlatformAdmin()
  if (!can(ctx, 'manage_platform_admins')) throw new Error('Forbidden')

  const id = String(formData.get('id'))
  const active = formData.get('active') === 'true'

  const admin = createAdminClient()
  const { data: row } = await admin
    .from('platform_admins')
    .update({ is_active: active })
    .eq('id', id)
    .select('email')
    .maybeSingle()

  await writeAudit(ctx, active ? 'platform_admin.enable' : 'platform_admin.disable', {
    type: 'platform_admin',
    id,
    label: row?.email,
  })
  revalidatePath('/platform-admin/admins')
}
