import { NextRequest, NextResponse } from 'next/server'
import { instagramAuthUrl } from '@/lib/channels/instagram'
import { getInstagramApp } from '@/lib/instagram-config'
import { createAdminClient } from '@/lib/supabase/admin'
import { getUser, getActiveMembership } from '@/lib/authz'
import { publicBase } from '@/lib/public-url'

/** Start the Instagram Business Login flow using the workspace's own app id. */
export async function GET(req: NextRequest) {
  // Behind the proxy req.url is the internal 0.0.0.0:3000 host — always redirect
  // via the public base so the user never lands on an unreachable URL.
  const base = publicBase(req)
  const redir = (path: string) => NextResponse.redirect(new URL(path, base))

  const user = await getUser()
  if (!user) return redir('/login')
  const { active } = await getActiveMembership(user.id)
  if (!active) return redir('/workspace/new')

  const admin = createAdminClient()
  const app = await getInstagramApp(admin, active.workspaceId)
  if (!app) return redir('/settings/channels?error=ig_not_configured')

  const redirectUri = `${base}/api/integrations/instagram/callback`
  return NextResponse.redirect(instagramAuthUrl(redirectUri, active.workspaceId, app.appId))
}
