import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyInternalCronCall } from '@/lib/cron-auth'
import { publishImage, publishReel } from '@/lib/channels/instagram'
import { decryptToken } from '@/lib/crypto'

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
    .select('id, workspace_id, type, caption, hashtags, media_urls, target_platforms')
    .eq('status', 'scheduled')
    .lte('scheduled_at', nowIso)
    .limit(25)

  let published = 0
  let failed = 0
  const fail = async (id: string, reason: string) => {
    await admin.from('content_posts').update({ status: 'failed', rejection_note: reason }).eq('id', id)
    failed++
  }

  for (const post of due ?? []) {
    await admin.from('content_posts').update({ status: 'publishing' }).eq('id', post.id)

    const { data: acct } = await admin
      .from('channel_accounts')
      .select('external_id, access_token')
      .eq('workspace_id', post.workspace_id)
      .eq('channel', 'instagram')
      .eq('is_active', true)
      .maybeSingle()

    const mediaUrl = (post.media_urls as string[] | null)?.[0]
    const acctToken = decryptToken(acct?.access_token)
    const targetsIg = !post.target_platforms || (post.target_platforms as string[]).includes('instagram')
    const caption = [post.caption, ((post.hashtags as string[] | null) ?? []).map((h) => `#${h}`).join(' ')].filter(Boolean).join('\n\n')
    const isVideo = post.type === 'reel' || /\.(mp4|mov|webm)(\?|$)/i.test(mediaUrl ?? '')

    if (!acctToken || !acct?.external_id) {
      await fail(post.id, 'Instagram not connected — connect the account under Settings → Channels.')
    } else if (!mediaUrl) {
      await fail(post.id, 'No media — upload an image or video to this post.')
    } else if (post.type === 'story') {
      await fail(post.id, 'Story publishing isn’t supported by the Instagram API yet.')
    } else if (!targetsIg) {
      await fail(post.id, 'Only Instagram publishing is wired today.')
    } else {
      const res = isVideo
        ? await publishReel(acctToken, acct.external_id, mediaUrl, caption)
        : await publishImage(acctToken, acct.external_id, mediaUrl, caption)
      if (res.ok) {
        await admin.from('content_posts').update({ status: 'published', published_at: new Date().toISOString(), ig_media_id: res.id }).eq('id', post.id)
        published++
      } else {
        await fail(post.id, res.error ?? 'Instagram rejected the post.')
      }
    }
  }

  return NextResponse.json({ ok: true, published, failed, due: due?.length ?? 0 })
}
