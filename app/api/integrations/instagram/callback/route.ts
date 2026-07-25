import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  exchangeCode,
  longLivedToken,
  getPagesWithIg,
  subscribePageWebhooks,
  IG_CAPS,
} from '@/lib/channels/instagram'

/** OAuth callback: exchange code, store each connected IG account. */
export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const workspaceId = url.searchParams.get('state')
  const base = process.env.NEXT_PUBLIC_APP_URL ?? url.origin

  if (!code || !workspaceId) {
    return NextResponse.redirect(new URL('/settings/channels?error=oauth_failed', req.url))
  }

  const shortToken = await exchangeCode(code, `${base}/api/integrations/instagram/callback`)
  if (!shortToken) return NextResponse.redirect(new URL('/settings/channels?error=token_exchange', req.url))

  const ll = await longLivedToken(shortToken)
  const token = ll?.token ?? shortToken
  const expiresAt = ll ? new Date(Date.now() + ll.expiresIn * 1000).toISOString() : null

  const pages = await getPagesWithIg(token)
  if (pages.length === 0) {
    return NextResponse.redirect(new URL('/settings/channels?error=no_ig_account', req.url))
  }

  const admin = createAdminClient()
  for (const page of pages) {
    await admin.from('channel_accounts').upsert(
      {
        workspace_id: workspaceId,
        channel: 'instagram',
        external_id: page.igId,
        handle: page.igUsername,
        display_name: page.name,
        access_token: page.pageToken, // page token is used for messaging
        token_expires_at: expiresAt,
        capabilities: IG_CAPS,
        is_active: true,
      },
      { onConflict: 'workspace_id,channel,external_id' },
    )
    // Mirror into instagram_accounts for IG-specific features.
    await admin.from('instagram_accounts').upsert(
      {
        workspace_id: workspaceId,
        ig_user_id: page.igId,
        page_id: page.pageId,
        username: page.igUsername,
        name: page.name,
        access_token: page.pageToken,
        token_expires_at: expiresAt,
        webhook_verified: true,
        is_active: true,
      },
      { onConflict: 'workspace_id,ig_user_id' },
    )
    await subscribePageWebhooks(page.pageId, page.pageToken)
  }

  return NextResponse.redirect(new URL('/settings/channels?success=instagram', req.url))
}
