'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { getUser, ACTIVE_WORKSPACE_COOKIE } from '@/lib/authz'

interface InviteRow {
  id: string
  workspace_id: string
  email: string
  role: string
  status: string
  expires_at: string
}

export async function getInvite(token: string): Promise<
  | { ok: true; workspaceName: string; email: string; role: string }
  | { ok: false; reason: string }
> {
  const admin = createAdminClient()
  const { data: invite } = await admin
    .from('team_invites')
    .select('id, workspace_id, email, role, status, expires_at')
    .eq('token', token)
    .maybeSingle<InviteRow>()

  if (!invite) return { ok: false, reason: 'This invite link is invalid.' }
  if (invite.status !== 'pending') return { ok: false, reason: 'This invite has already been used.' }
  if (new Date(invite.expires_at).getTime() < Date.now()) return { ok: false, reason: 'This invite has expired.' }

  const { data: ws } = await admin.from('workspaces').select('name').eq('id', invite.workspace_id).maybeSingle()
  return { ok: true, workspaceName: ws?.name ?? 'the workspace', email: invite.email, role: invite.role }
}

export async function acceptInviteAction(
  _prev: { error?: string },
  formData: FormData,
): Promise<{ error?: string }> {
  const token = String(formData.get('token'))
  const password = String(formData.get('password') ?? '')

  const admin = createAdminClient()
  const { data: invite } = await admin
    .from('team_invites')
    .select('id, workspace_id, email, role, status, expires_at')
    .eq('token', token)
    .maybeSingle<InviteRow>()

  if (!invite || invite.status !== 'pending' || new Date(invite.expires_at).getTime() < Date.now()) {
    return { error: 'This invite is no longer valid.' }
  }

  let userId: string
  const currentUser = await getUser()

  if (currentUser) {
    userId = currentUser.id
  } else {
    const { data: existingProfile } = await admin
      .from('profiles')
      .select('id')
      .eq('email', invite.email)
      .maybeSingle()

    if (existingProfile) {
      // Account exists — must log in first, then return here.
      redirect(`/login?next=/accept-invite?token=${token}`)
    }
    // New account — create + sign in.
    if (password.length < 8) return { error: 'Choose a password of at least 8 characters.' }
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email: invite.email,
      password,
      email_confirm: true,
    })
    if (createErr || !created.user) return { error: createErr?.message ?? 'Could not create account' }
    userId = created.user.id

    const supabase = await createClient()
    await supabase.auth.signInWithPassword({ email: invite.email, password })
  }

  // Add membership (idempotent) + mark invite accepted.
  await admin
    .from('workspace_members')
    .upsert(
      { workspace_id: invite.workspace_id, user_id: userId, role: invite.role },
      { onConflict: 'workspace_id,user_id' },
    )
  await admin.from('team_invites').update({ status: 'accepted' }).eq('id', invite.id)

  const cookieStore = await cookies()
  cookieStore.set(ACTIVE_WORKSPACE_COOKIE, invite.workspace_id, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 60 * 24 * 365,
    path: '/',
  })

  redirect('/')
}
