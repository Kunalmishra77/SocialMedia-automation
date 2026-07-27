import 'server-only'

import { notFound, redirect } from 'next/navigation'
import { getUser } from '@/lib/authz'
import { createAdminClient } from '@/lib/supabase/admin'
import { isTwoFactorVerified } from '@/lib/platform-admin/2fa'

export type PlatformRole =
  | 'platform_owner'
  | 'platform_admin'
  | 'platform_support'
  | 'platform_billing'

export type PlatformPermission =
  | 'view_workspaces'
  | 'manage_workspaces'
  | 'manage_billing'
  | 'impersonate'
  | 'impersonate_full'
  | 'manage_users'
  | 'broadcast'
  | 'manage_feature_flags'
  | 'view_usage'
  | 'manage_platform_admins'
  | 'view_audit_log'
  | 'view_system_health'

export const ALL_PLATFORM_PERMISSIONS: PlatformPermission[] = [
  'view_workspaces', 'manage_workspaces', 'manage_billing', 'impersonate',
  'impersonate_full', 'manage_users', 'broadcast', 'manage_feature_flags',
  'view_usage', 'manage_platform_admins', 'view_audit_log', 'view_system_health',
]
const ALL = ALL_PLATFORM_PERMISSIONS

export const PLATFORM_ROLE_PERMISSIONS: Record<PlatformRole, PlatformPermission[]> = {
  platform_owner: ALL,
  platform_admin: ALL.filter((p) => p !== 'manage_platform_admins'),
  platform_support: ['view_workspaces', 'impersonate', 'view_usage', 'view_audit_log'],
  platform_billing: ['view_workspaces', 'manage_billing', 'view_usage'],
}

export interface PlatformAdminContext {
  userId: string
  email: string
  role: PlatformRole
  permissions: PlatformPermission[]
  totpEnabled: boolean
}

/**
 * Resolve the platform-admin context WITHOUT enforcing 2FA. Returns 404 (not 403)
 * if the user isn't an active platform admin — hides the area from ordinary users.
 * Used by the 2FA enrollment + verification flows (which must run pre-gate).
 */
export async function resolvePlatformAdmin(): Promise<PlatformAdminContext> {
  const user = await getUser()
  if (!user) notFound()

  const admin = createAdminClient()
  const { data } = await admin
    .from('platform_admins')
    .select('role, permissions, is_active, totp_enabled')
    .eq('user_id', user.id)
    .maybeSingle()

  if (!data || !data.is_active) notFound()

  const role = data.role as PlatformRole
  // Role defaults, plus any explicit per-admin permission overrides.
  const permissions = Array.from(
    new Set([...(PLATFORM_ROLE_PERMISSIONS[role] ?? []), ...((data.permissions ?? []) as PlatformPermission[])]),
  )

  return { userId: user.id, email: user.email ?? '', role, permissions, totpEnabled: !!data.totp_enabled }
}

/**
 * Gate for the /platform-admin area: active platform admin AND (if they've enabled
 * 2FA) a valid 2FA session — otherwise redirect to /verify-2fa.
 */
export async function requirePlatformAdmin(): Promise<PlatformAdminContext> {
  const ctx = await resolvePlatformAdmin()
  if (ctx.totpEnabled && !(await isTwoFactorVerified(ctx.userId))) {
    redirect('/verify-2fa')
  }
  return ctx
}

export function can(ctx: PlatformAdminContext, permission: PlatformPermission): boolean {
  return ctx.permissions.includes(permission)
}

/** Record a sensitive platform action. Never throws into the caller path. */
export async function writeAudit(
  ctx: PlatformAdminContext,
  action: string,
  target?: { type?: string; id?: string; label?: string; metadata?: Record<string, unknown> },
): Promise<void> {
  try {
    const admin = createAdminClient()
    await admin.from('platform_audit_log').insert({
      admin_user_id: ctx.userId,
      admin_email: ctx.email,
      action,
      target_type: target?.type ?? null,
      target_id: target?.id ?? null,
      target_label: target?.label ?? null,
      metadata: target?.metadata ?? {},
    })
  } catch (err) {
    console.error('[platform-audit] failed to write:', err)
  }
}
