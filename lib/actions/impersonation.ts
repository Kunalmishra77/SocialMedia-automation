'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { requirePlatformAdmin, can, writeAudit } from '@/lib/platform-admin/auth'
import { IMPERSONATION_COOKIE } from '@/lib/impersonation'

const THIRTY_MIN_MS = 30 * 60 * 1000

/** Start impersonating a workspace. Read mode by default; full needs the stronger permission. */
export async function startImpersonationAction(formData: FormData): Promise<void> {
  const ctx = await requirePlatformAdmin()
  if (!can(ctx, 'impersonate')) throw new Error('Forbidden')

  const workspaceId = String(formData.get('workspaceId'))
  const mode = String(formData.get('mode') ?? 'read') === 'full' ? 'full' : 'read'
  const reason = String(formData.get('reason') ?? '').trim() || null

  if (mode === 'full' && !can(ctx, 'impersonate_full')) {
    throw new Error('Full-access impersonation not permitted for your role')
  }

  const admin = createAdminClient()
  const { data: ws } = await admin.from('workspaces').select('name').eq('id', workspaceId).maybeSingle()

  const { data: session } = await admin
    .from('impersonation_sessions')
    .insert({
      admin_user_id: ctx.userId,
      workspace_id: workspaceId,
      mode,
      reason,
      expires_at: new Date(Date.now() + THIRTY_MIN_MS).toISOString(),
    })
    .select('id')
    .single()

  const cookieStore = await cookies()
  cookieStore.set(IMPERSONATION_COOKIE, session!.id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: THIRTY_MIN_MS / 1000,
    path: '/',
  })

  await writeAudit(ctx, 'impersonate.start', {
    type: 'workspace',
    id: workspaceId,
    label: ws?.name,
    metadata: { mode, reason },
  })

  redirect('/')
}

/** End the current impersonation session. */
export async function endImpersonationAction(): Promise<void> {
  const cookieStore = await cookies()
  const sessionId = cookieStore.get(IMPERSONATION_COOKIE)?.value

  if (sessionId) {
    const admin = createAdminClient()
    const { data: session } = await admin
      .from('impersonation_sessions')
      .update({ ended_at: new Date().toISOString() })
      .eq('id', sessionId)
      .select('admin_user_id, workspace_id')
      .maybeSingle()

    if (session) {
      await writeAudit(
        { userId: session.admin_user_id, email: '', role: 'platform_owner', permissions: [] },
        'impersonate.end',
        { type: 'workspace', id: session.workspace_id },
      )
    }
    cookieStore.delete(IMPERSONATION_COOKIE)
  }

  redirect('/platform-admin/workspaces')
}
