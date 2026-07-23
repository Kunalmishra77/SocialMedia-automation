import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'

export interface PlatformMetrics {
  workspaces: { total: number; active: number; suspended: number }
  users: number
  planDistribution: Record<string, number>
  newWorkspaces7d: number
  newWorkspaces30d: number
}

export async function getPlatformMetrics(): Promise<PlatformMetrics> {
  const admin = createAdminClient()

  const [{ data: workspaces }, { count: userCount }] = await Promise.all([
    admin.from('workspaces').select('plan, status, created_at'),
    admin.from('profiles').select('id', { count: 'exact', head: true }),
  ])

  const rows = workspaces ?? []
  const now = Date.now()
  const d7 = now - 7 * 86400_000
  const d30 = now - 30 * 86400_000

  const planDistribution: Record<string, number> = {}
  let active = 0
  let suspended = 0
  let new7 = 0
  let new30 = 0

  for (const w of rows) {
    planDistribution[w.plan] = (planDistribution[w.plan] ?? 0) + 1
    if (w.status === 'active') active++
    if (w.status === 'suspended') suspended++
    const created = new Date(w.created_at).getTime()
    if (created >= d7) new7++
    if (created >= d30) new30++
  }

  return {
    workspaces: { total: rows.length, active, suspended },
    users: userCount ?? 0,
    planDistribution,
    newWorkspaces7d: new7,
    newWorkspaces30d: new30,
  }
}

export interface WorkspaceRow {
  id: string
  name: string
  slug: string
  plan: string
  status: string
  owner_email: string | null
  industry: string | null
  created_at: string
  memberCount: number
}

export async function listWorkspaces(search?: string): Promise<WorkspaceRow[]> {
  const admin = createAdminClient()
  let query = admin
    .from('workspaces')
    .select('id, name, slug, plan, status, owner_email, industry, created_at, workspace_members(count)')
    .order('created_at', { ascending: false })
    .limit(100)

  if (search && search.trim()) {
    query = query.or(`name.ilike.%${search}%,slug.ilike.%${search}%,owner_email.ilike.%${search}%`)
  }

  const { data } = await query
  return (data ?? []).map((w) => {
    const mc = (w.workspace_members as unknown as { count: number }[] | null)?.[0]?.count ?? 0
    return {
      id: w.id,
      name: w.name,
      slug: w.slug,
      plan: w.plan,
      status: w.status,
      owner_email: w.owner_email,
      industry: w.industry,
      created_at: w.created_at,
      memberCount: mc,
    }
  })
}

export interface FeatureFlag {
  id: string
  key: string
  description: string | null
  default_on: boolean
  rollout_pct: number
}

export async function listFeatureFlags(): Promise<FeatureFlag[]> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('feature_flags')
    .select('id, key, description, default_on, rollout_pct')
    .order('key')
  return (data ?? []) as FeatureFlag[]
}

export interface PlatformAdminRow {
  id: string
  email: string
  role: string
  is_active: boolean
  totp_enabled: boolean
  last_login_at: string | null
}

export async function listPlatformAdmins(): Promise<PlatformAdminRow[]> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('platform_admins')
    .select('id, email, role, is_active, totp_enabled, last_login_at')
    .order('created_at')
  return (data ?? []) as PlatformAdminRow[]
}

export interface AuditEntry {
  id: string
  admin_email: string
  action: string
  target_label: string | null
  metadata: Record<string, unknown>
  occurred_at: string
}

export async function listAuditLog(limit = 100): Promise<AuditEntry[]> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('platform_audit_log')
    .select('id, admin_email, action, target_label, metadata, occurred_at')
    .order('occurred_at', { ascending: false })
    .limit(limit)
  return (data ?? []) as AuditEntry[]
}

export interface WorkspaceDetail extends WorkspaceRow {
  suspended_reason: string | null
  members: { email: string; role: string }[]
}

export async function getWorkspaceDetail(id: string): Promise<WorkspaceDetail | null> {
  const admin = createAdminClient()
  const { data: w } = await admin
    .from('workspaces')
    .select('id, name, slug, plan, status, owner_email, industry, created_at, suspended_reason')
    .eq('id', id)
    .maybeSingle()
  if (!w) return null

  const { data: members } = await admin
    .from('workspace_members')
    .select('role, profiles(email)')
    .eq('workspace_id', id)

  const memberList = (members ?? []).map((m) => ({
    role: m.role as string,
    email: (m.profiles as unknown as { email: string } | null)?.email ?? '—',
  }))

  return {
    ...w,
    memberCount: memberList.length,
    members: memberList,
  } as WorkspaceDetail
}
