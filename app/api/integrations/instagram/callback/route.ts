import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { exchangeIgCode, igLongLivedToken, fetchInstagramProfile, fetchIgMe, subscribeInstagramWebhooks, IG_CAPS } from '@/lib/channels/instagram'
import { getInstagramApp } from '@/lib/instagram-config'
import { encryptToken } from '@/lib/crypto'
import { getUser, getMembership, roleCan } from '@/lib/authz'
import { publicBase } from '@/lib/public-url'

/** Instagram Business Login callback: exchange code, store the long-lived token. */
export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const workspaceId = url.searchParams.get('state')
  // Always build redirects from the PUBLIC base — behind the reverse proxy req.url
  // resolves to the internal 0.0.0.0:3000 host, which shows the user an error page.
  const base = publicBase(req)
  const redir = (path: string) => NextResponse.redirect(new URL(path, base))

  if (!code || !workspaceId) return redir('/settings/channels?error=oauth_failed')

  // The signed-in user must be a member of the target workspace with permission to
  // manage it — `state` (the workspace id) is attacker-controllable, so without
  // this an attacker could graft an Instagram account onto someone else's workspace.
  const user = await getUser()
  if (!user) return redir('/login')
  const membership = await getMembership(user.id, workspaceId)
  if (!membership || !roleCan(membership.role, 'manage_workspace')) {
    return redir('/settings/channels?error=forbidden')
  }

  const admin = createAdminClient()
  const app = await getInstagramApp(admin, workspaceId)
  if (!app) return redir('/settings/channels?error=ig_not_configured')

  const short = await exchangeIgCode(code, `${base}/api/integrations/instagram/callback`, app.appId, app.appSecret)
  if (!short) return redir('/settings/channels?error=token_exchange')

  const ll = await igLongLivedToken(short.token, app.appSecret)
  const token = ll?.token ?? short.token
  const expiresAt = ll ? new Date(Date.now() + ll.expiresIn * 1000).toISOString() : null

  // IMPORTANT: the OAuth exchange returns an app-scoped user_id that does NOT match
  // the id Instagram puts in webhook `entry.id`. Resolve the canonical IG user id
  // via /me (same id used by webhooks + the profile API) so inbound DMs/comments
  // actually route to this workspace.
  const me = await fetchIgMe(token)
  const igId = me?.userId ?? short.userId
  const profile = await fetchInstagramProfile(igId, token)
  const username = profile.username ?? me?.username ?? null
  const name = profile.name ?? me?.name ?? null

  const encToken = encryptToken(token)
  await admin.from('channel_accounts').upsert(
    {
      workspace_id: workspaceId,
      channel: 'instagram',
      external_id: igId,
      handle: username,
      display_name: name,
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
      ig_user_id: igId,
      page_id: igId,
      username,
      name,
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

  return redir('/settings/channels?success=instagram')
}
