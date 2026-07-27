import { NextRequest, NextResponse } from 'next/server'
import { verifyInternalCronCall } from '@/lib/cron-auth'
import { refreshMetaHealthCache } from '@/lib/platform-admin/meta-monitor'

/** Scheduled Meta health probe → refreshes the meta_health_checks cache. */
export async function GET(req: NextRequest) {
  try {
    verifyInternalCronCall(req)
  } catch {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const usage = await refreshMetaHealthCache()
  return NextResponse.json({ ok: true, probed: usage.channels.length, healthy: usage.healthy })
}
