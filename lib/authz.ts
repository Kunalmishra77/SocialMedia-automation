import 'server-only'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { User } from '@supabase/supabase-js'

export const ACTIVE_WORKSPACE_COOKIE = 'active_workspace_id'

export const ROLE_PERMISSIONS = {
  super_admin: ['manage_workspace', 'manage_team', 'view_all', 'manage_content', 'billing'],
  admin: ['manage_workspace', 'manage_team', 'view_all', 'manage_content', 'billing'],
  manager: ['manage_team', 'view_all', 'manage_content'],
  agent: [] as string[],
} as const

export function roleCan(role: MembershipRole, permission: string): boolean {
  return (ROLE_PERMISSIONS[role] as readonly string[]).includes(permission)
}

export type MembershipRole = 'super_admin' | 'admin' | 'manager' | 'agent'

export interface WorkspaceMembership {
  workspaceId: string
  name: string
  slug: string
  plan: string
  role: MembershipRole
}

/** Returns the authenticated user or null. */
export async function getUser(): Promise<User | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user
}

/** Returns the authenticated user or redirects to /login. */
export async function requireUser(): Promise<User> {
  const user = await getUser()
  if (!user) redirect('/login')
  return user
}

/** All workspaces the user belongs to (uses admin client — RLS-safe by user_id filter). */
export async function getMemberships(userId: string): Promise<WorkspaceMembership[]> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('workspace_members')
    .select('role, workspaces(id, name, slug, plan, status)')
    .eq('user_id', userId)

  return (data ?? [])
    .filter((row) => {
      const ws = row.workspaces as unknown as { status: string } | null
      return ws && ws.status === 'active'
    })
    .map((row) => {
      const ws = row.workspaces as unknown as {
        id: string
        name: string
        slug: string
        plan: string
      }
      return {
        workspaceId: ws.id,
        name: ws.name,
        slug: ws.slug,
        plan: ws.plan,
        role: row.role as MembershipRole,
      }
    })
}

/**
 * Resolve the user's active workspace: the one named by the active_workspace_id
 * cookie if they're still a member, otherwise their first membership.
 */
export async function getActiveMembership(
  userId: string,
): Promise<{ active: WorkspaceMembership | null; all: WorkspaceMembership[] }> {
  const all = await getMemberships(userId)
  if (all.length === 0) return { active: null, all }

  const cookieStore = await cookies()
  const preferred = cookieStore.get(ACTIVE_WORKSPACE_COOKIE)?.value
  const active = all.find((m) => m.workspaceId === preferred) ?? all[0]
  return { active, all }
}

/** Load a single membership (role) for a user in a workspace, or null. */
export async function getMembership(
  userId: string,
  workspaceId: string,
): Promise<WorkspaceMembership | null> {
  const all = await getMemberships(userId)
  return all.find((m) => m.workspaceId === workspaceId) ?? null
}

/** Generate a URL-safe, unique workspace slug from a name. */
export async function generateUniqueSlug(name: string): Promise<string> {
  const base =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'workspace'

  const admin = createAdminClient()
  let slug = base
  let n = 1
  // Try base, then base-2, base-3, ... until free.
  while (true) {
    const { data } = await admin.from('workspaces').select('id').eq('slug', slug).maybeSingle()
    if (!data) return slug
    n += 1
    slug = `${base}-${n}`
  }
}
