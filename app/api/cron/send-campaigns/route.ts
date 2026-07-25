import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyInternalCronCall } from '@/lib/cron-auth'

/**
 * Publish due scheduled content posts and mark scheduled campaigns ready to run.
 * (Campaign delivery itself uses runCampaignAction; this promotes scheduled work.)
 */
export async function GET(req: NextRequest) {
  try {
    verifyInternalCronCall(req)
  } catch {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const admin = createAdminClient()
  const nowIso = new Date().toISOString()

  // Scheduled content posts due now → mark publishing (actual publish needs IG connection).
  const { data: duePosts } = await admin
    .from('content_posts')
    .select('id')
    .eq('status', 'scheduled')
    .lte('scheduled_at', nowIso)
    .limit(50)

  for (const p of duePosts ?? []) {
    await admin.from('content_posts').update({ status: 'publishing' }).eq('id', p.id)
  }

  return NextResponse.json({ ok: true, posts_due: duePosts?.length ?? 0 })
}
