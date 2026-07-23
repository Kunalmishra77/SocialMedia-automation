import 'server-only'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { User } from '@supabase/supabase-js'

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
