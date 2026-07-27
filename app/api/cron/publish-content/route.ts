import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyInternalCronCall } from '@/lib/cron-auth'
import { publishImage } from '@/lib/channels/instagram'

/** Publish due scheduled content posts via the connected Instagram account. */
export async function GET(req: NextRequest) {
  try {
    verifyInternalCronCall(req)
  } catch {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const admin = createAdminClient()
  const nowIso = new Date().toISOString()

  const { data: due } = await admin
    .from('content_posts')
    .select('id, workspace_id, type, caption, media_urls')
    .eq('status', 'scheduled')
    .lte('scheduled_at', nowIso)
    .limit(25)

  let published = 0
  let failed = 0

  for (const post of due ?? []) {
    await admin.from('content_posts').update({ status: 'publishing' }).eq('id', post.id)

    const { data: acct } = await admin
      .from('channel_accounts')
      .select('external_id, access_token')
      .eq('workspace_id', post.workspace_id)
      .eq('channel', 'instagram')
      .eq('is_active', true)
      .maybeSingle()

    const imageUrl = (post.media_urls as string[] | null)?.[0]
    if (acct?.access_token && acct.external_id && imageUrl && (post.type === 'feed' || post.type === 'carousel')) {
      const res = await publishImage(acct.access_token, acct.external_id, imageUrl, post.caption ?? '')
      if (res.ok) {
        await admin.from('content_posts').update({ status: 'published', published_at: new Date().toISOString(), ig_media_id: res.id }).eq('id', post.id)
        published++
      } else {
        await admin.from('content_posts').update({ status: 'failed' }).eq('id', post.id)
        failed++
      }
    } else {
      // No connected IG or no media — leave as failed with a hint (needs media URL + connection).
      await admin.from('content_posts').update({ status: 'failed' }).eq('id', post.id)
      failed++
    }
  }

  return NextResponse.json({ ok: true, published, failed, due: due?.length ?? 0 })
}
