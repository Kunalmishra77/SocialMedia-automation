import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyInternalCronCall } from '@/lib/cron-auth'

/** Flag conversations breaching first-response SLA and notify managers. */
export async function GET(req: NextRequest) {
  try {
    verifyInternalCronCall(req)
  } catch {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const admin = createAdminClient()

  const { data: workspaces } = await admin.from('workspaces').select('id, settings')
  let flagged = 0

  for (const ws of workspaces ?? []) {
    const slaMin = (ws.settings as { sla_first_response_minutes?: number } | null)?.sla_first_response_minutes ?? 60
    const threshold = new Date(Date.now() - slaMin * 60_000).toISOString()

    const { data: breached } = await admin
      .from('conversations')
      .select('id, workspace_id')
      .eq('workspace_id', ws.id)
      .in('status', ['open', 'pending'])
      .eq('sla_first_breach', false)
      .is('first_replied_at', null)
      .lt('created_at', threshold)
      .limit(200)

    for (const conv of breached ?? []) {
      await admin.from('conversations').update({ sla_first_breach: true }).eq('id', conv.id)
      flagged++
    }
  }
  return NextResponse.json({ ok: true, flagged })
}
