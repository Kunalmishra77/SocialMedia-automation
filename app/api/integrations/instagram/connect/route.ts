import { NextRequest, NextResponse } from 'next/server'
import { instagramAuthUrl } from '@/lib/channels/instagram'
import { getInstagramApp } from '@/lib/instagram-config'
import { createAdminClient } from '@/lib/supabase/admin'
import { getUser, getActiveMembership } from '@/lib/authz'

/** Start the Instagram Business Login flow using the workspace's own app id. */
export async function GET(req: NextRequest) {
  const user = await getUser()
  if (!user) return NextResponse.redirect(new URL('/login', req.url))
  const { active } = await getActiveMembership(user.id)
  if (!active) return NextResponse.redirect(new URL('/workspace/new', req.url))

  const admin = createAdminClient()
  const app = await getInstagramApp(admin, active.workspaceId)
  if (!app) {
    return NextResponse.redirect(new URL('/settings/channels?error=ig_not_configured', req.url))
  }
  const base = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin
  const redirectUri = `${base}/api/integrations/instagram/callback`
  return NextResponse.redirect(instagramAuthUrl(redirectUri, active.workspaceId, app.appId))
}
