import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { exchangeIgCode, igLongLivedToken, fetchInstagramProfile, subscribeInstagramWebhooks, IG_CAPS } from '@/lib/channels/instagram'
import { getInstagramApp } from '@/lib/instagram-config'
import { encryptToken } from '@/lib/crypto'

/** Instagram Business Login callback: exchange code, store the long-lived token. */
export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const workspaceId = url.searchParams.get('state')
  const base = process.env.NEXT_PUBLIC_APP_URL ?? url.origin

  if (!code || !workspaceId) {
    return NextResponse.redirect(new URL('/settings/channels?error=oauth_failed', req.url))
  }

  const admin = createAdminClient()
  const app = await getInstagramApp(admin, workspaceId)
  if (!app) return NextResponse.redirect(new URL('/settings/channels?error=ig_not_configured', req.url))

  const short = await exchangeIgCode(code, `${base}/api/integrations/instagram/callback`, app.appId, app.appSecret)
  if (!short) return NextResponse.redirect(new URL('/settings/channels?error=token_exchange', req.url))

  const ll = await igLongLivedToken(short.token, app.appSecret)
  const token = ll?.token ?? short.token
  const expiresAt = ll ? new Date(Date.now() + ll.expiresIn * 1000).toISOString() : null

  const profile = await fetchInstagramProfile(short.userId, token)

  const encToken = encryptToken(token)
  await admin.from('channel_accounts').upsert(
    {
      workspace_id: workspaceId,
      channel: 'instagram',
      external_id: short.userId,
      handle: profile.username,
      display_name: profile.name,
      access_token: encToken,
      token_expires_at: expiresAt,
      capabilities: IG_CAPS,
      is_active: true,
    },
    { onConflict: 'workspace_id,channel,external_id' },
  )
  await admin.from('instagram_accounts').upsert(
    {
      workspace_id: workspaceId,
      ig_user_id: short.userId,
      page_id: short.userId,
      username: profile.username,
      name: profile.name,
      profile_pic: profile.profile_pic,
      followers_count: profile.follower_count,
      access_token: encToken,
      token_expires_at: expiresAt,
      webhook_verified: true,
      is_active: true,
    },
    { onConflict: 'workspace_id,ig_user_id' },
  )

  // Subscribe the account to webhooks so inbound DMs/comments are delivered.
  await subscribeInstagramWebhooks(token)

  return NextResponse.redirect(new URL('/settings/channels?success=instagram', req.url))
}
