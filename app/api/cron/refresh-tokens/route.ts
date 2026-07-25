import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyInternalCronCall } from '@/lib/cron-auth'

/** Refresh long-lived tokens for channel accounts nearing expiry (within 10 days). */
export async function GET(req: NextRequest) {
  try {
    verifyInternalCronCall(req)
  } catch {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const admin = createAdminClient()
  const soon = new Date(Date.now() + 10 * 86400_000).toISOString()

  const { data: accounts } = await admin
    .from('channel_accounts')
    .select('id, channel, access_token, workspace_id')
    .eq('is_active', true)
    .not('token_expires_at', 'is', null)
    .lt('token_expires_at', soon)

  let refreshed = 0
  let failed = 0
  for (const acc of accounts ?? []) {
    if (acc.channel === 'instagram' && acc.access_token) {
      try {
        const res = await fetch(
          `https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${acc.access_token}`,
        )
        const data = await res.json()
        if (data.access_token) {
          await admin
            .from('channel_accounts')
            .update({
              access_token: data.access_token,
              token_expires_at: new Date(Date.now() + (data.expires_in ?? 5_184_000) * 1000).toISOString(),
            })
            .eq('id', acc.id)
          refreshed++
        } else {
          failed++
        }
      } catch {
        failed++
      }
    }
  }
  return NextResponse.json({ ok: true, refreshed, failed })
}
