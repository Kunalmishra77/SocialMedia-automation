import 'server-only'

import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'

export const IMPERSONATION_COOKIE = 'imp_session'

export interface ImpersonationContext {
  sessionId: string
  workspaceId: string
  workspaceName: string
  plan: string
  mode: 'read' | 'full'
}

/**
 * Returns the active impersonation context for the current admin, or null.
 * Validates the session row is live (not ended, not expired) and belongs to
 * the given user. Read-only — safe to call from server components/layouts.
 */
export async function getImpersonation(userId: string): Promise<ImpersonationContext | null> {
  const cookieStore = await cookies()
  const sessionId = cookieStore.get(IMPERSONATION_COOKIE)?.value
  if (!sessionId) return null

  const admin = createAdminClient()
  const { data: session } = await admin
    .from('impersonation_sessions')
    .select('id, admin_user_id, workspace_id, mode, expires_at, ended_at')
    .eq('id', sessionId)
    .maybeSingle()

  if (
    !session ||
    session.admin_user_id !== userId ||
    session.ended_at ||
    new Date(session.expires_at).getTime() < Date.now()
  ) {
    return null
  }

  const { data: ws } = await admin
    .from('workspaces')
    .select('name, plan')
    .eq('id', session.workspace_id)
    .maybeSingle()
  if (!ws) return null

  return {
    sessionId: session.id,
    workspaceId: session.workspace_id,
    workspaceName: ws.name,
    plan: ws.plan,
    mode: session.mode as 'read' | 'full',
  }
}
