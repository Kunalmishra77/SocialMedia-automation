import 'server-only'

import { notFound } from 'next/navigation'
import { getUser } from '@/lib/authz'
import { createAdminClient } from '@/lib/supabase/admin'

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

const ALL: PlatformPermission[] = [
  'view_workspaces', 'manage_workspaces', 'manage_billing', 'impersonate',
  'impersonate_full', 'manage_users', 'broadcast', 'manage_feature_flags',
  'view_usage', 'manage_platform_admins', 'view_audit_log', 'view_system_health',
]

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
}

/**
 * Gate for the /platform-admin area. Requires an authenticated user who is an
 * active platform admin. Returns 404 (not 403) if they aren't — hides the
 * area's existence from ordinary users.
 */
export async function requirePlatformAdmin(): Promise<PlatformAdminContext> {
  const user = await getUser()
  if (!user) notFound()

  const admin = createAdminClient()
  const { data } = await admin
    .from('platform_admins')
    .select('role, permissions, is_active')
    .eq('user_id', user.id)
    .maybeSingle()

  if (!data || !data.is_active) notFound()

  const role = data.role as PlatformRole
  // Role defaults, plus any explicit per-admin permission overrides.
  const permissions = Array.from(
    new Set([...(PLATFORM_ROLE_PERMISSIONS[role] ?? []), ...((data.permissions ?? []) as PlatformPermission[])]),
  )

  return { userId: user.id, email: user.email ?? '', role, permissions }
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
