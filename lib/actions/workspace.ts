'use server'

import { randomBytes } from 'node:crypto'
import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { getUser, getMembership, roleCan, ACTIVE_WORKSPACE_COOKIE } from '@/lib/authz'

async function requireWorkspacePermission(workspaceId: string, permission: string) {
  const user = await getUser()
  if (!user) redirect('/login')
  const membership = await getMembership(user.id, workspaceId)
  if (!membership || !roleCan(membership.role, permission)) throw new Error('Forbidden')
  return { user, membership }
}

/** Switch the active workspace (sets the cookie the layout reads). */
export async function switchWorkspaceAction(formData: FormData): Promise<void> {
  const user = await getUser()
  if (!user) redirect('/login')
  const workspaceId = String(formData.get('workspaceId'))
  const membership = await getMembership(user.id, workspaceId)
  if (!membership) throw new Error('Not a member')

  const cookieStore = await cookies()
  cookieStore.set(ACTIVE_WORKSPACE_COOKIE, workspaceId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 60 * 24 * 365,
    path: '/',
  })
  redirect('/')
}

/** Update workspace profile settings. */
export async function updateWorkspaceAction(formData: FormData): Promise<{ error?: string; ok?: boolean }> {
  const workspaceId = String(formData.get('workspaceId'))
  await requireWorkspacePermission(workspaceId, 'manage_workspace')

  const name = String(formData.get('name') ?? '').trim()
  const industry = String(formData.get('industry') ?? '').trim() || null
  const brand_color = String(formData.get('brand_color') ?? '').trim() || null
  if (name.length < 2) return { error: 'Workspace name is too short' }

  const admin = createAdminClient()
  await admin.from('workspaces').update({ name, industry, brand_color }).eq('id', workspaceId)
  revalidatePath('/settings')
  return { ok: true }
}

/** Create a team invite (returns the invite link; emailing wired later). */
export async function inviteMemberAction(formData: FormData): Promise<{ error?: string; inviteUrl?: string }> {
  const workspaceId = String(formData.get('workspaceId'))
  const { user } = await requireWorkspacePermission(workspaceId, 'manage_team')

  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  const role = String(formData.get('role') ?? 'agent')
  if (!email || !['admin', 'manager', 'agent'].includes(role)) return { error: 'Valid email and role required' }

  const admin = createAdminClient()
  // Already a member?
  const { data: existingProfile } = await admin.from('profiles').select('id').eq('email', email).maybeSingle()
  if (existingProfile) {
    const { data: existingMember } = await admin
      .from('workspace_members')
      .select('id')
      .eq('workspace_id', workspaceId)
      .eq('user_id', existingProfile.id)
      .maybeSingle()
    if (existingMember) return { error: 'This person is already a member.' }
  }

  const token = randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + 7 * 86400_000).toISOString()
  await admin.from('team_invites').insert({
    workspace_id: workspaceId,
    email,
    role,
    token,
    invited_by: user.id,
    expires_at: expiresAt,
  })

  const base = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  revalidatePath('/team')
  return { inviteUrl: `${base}/accept-invite?token=${token}` }
}

export async function updateMemberRoleAction(formData: FormData): Promise<void> {
  const workspaceId = String(formData.get('workspaceId'))
  await requireWorkspacePermission(workspaceId, 'manage_team')
  const memberId = String(formData.get('memberId'))
  const role = String(formData.get('role'))
  if (!['admin', 'manager', 'agent'].includes(role)) throw new Error('Invalid role')

  const admin = createAdminClient()
  await admin.from('workspace_members').update({ role }).eq('id', memberId).eq('workspace_id', workspaceId)
  revalidatePath('/team')
}

export async function removeMemberAction(formData: FormData): Promise<void> {
  const workspaceId = String(formData.get('workspaceId'))
  await requireWorkspacePermission(workspaceId, 'manage_team')
  const memberId = String(formData.get('memberId'))

  const admin = createAdminClient()
  await admin.from('workspace_members').delete().eq('id', memberId).eq('workspace_id', workspaceId)
  revalidatePath('/team')
}
