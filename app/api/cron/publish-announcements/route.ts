import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyInternalCronCall } from '@/lib/cron-auth'

/** Publish scheduled announcements whose time has arrived. */
export async function GET(req: NextRequest) {
  try {
    verifyInternalCronCall(req)
  } catch {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const admin = createAdminClient()
  const nowIso = new Date().toISOString()

  const { data: due } = await admin
    .from('platform_announcements')
    .select('id')
    .is('published_at', null)
    .not('scheduled_for', 'is', null)
    .lte('scheduled_for', nowIso)
    .limit(50)

  let published = 0
  for (const a of due ?? []) {
    await admin.from('platform_announcements').update({ published_at: nowIso }).eq('id', a.id)
    published++
  }

  return NextResponse.json({ ok: true, published })
}
