import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyInternalCronCall } from '@/lib/cron-auth'

/**
 * Reports scheduled campaigns whose send time has arrived. It intentionally does
 * NOT mutate anything: scheduled CONTENT POSTS are owned solely by the
 * publish-content cron (which claims each row atomically). This route previously
 * flipped due posts to `publishing` without ever publishing them, stranding them
 * forever — that mutation has been removed. Automated campaign delivery is still
 * operator-triggered (runCampaignAction), so we surface the due count only.
 */
export async function GET(req: NextRequest) {
  try {
    verifyInternalCronCall(req)
  } catch {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const admin = createAdminClient()
  const nowIso = new Date().toISOString()

  const { count } = await admin
    .from('campaigns')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'scheduled')
    .lte('scheduled_at', nowIso)

  return NextResponse.json({ ok: true, campaigns_due: count ?? 0 })
}
