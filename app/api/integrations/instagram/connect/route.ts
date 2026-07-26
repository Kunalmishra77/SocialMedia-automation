import { NextRequest, NextResponse } from 'next/server'
import { instagramAuthUrl } from '@/lib/channels/instagram'
import { getUser, getActiveMembership } from '@/lib/authz'

/** Start the Instagram Business Login flow. State carries the workspace id. */
export async function GET(req: NextRequest) {
  const user = await getUser()
  if (!user) return NextResponse.redirect(new URL('/login', req.url))
  const { active } = await getActiveMembership(user.id)
  if (!active) return NextResponse.redirect(new URL('/workspace/new', req.url))

  if (!process.env.INSTAGRAM_APP_ID) {
    return NextResponse.redirect(new URL('/settings/channels?error=ig_not_configured', req.url))
  }
  const base = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin
  const redirectUri = `${base}/api/integrations/instagram/callback`
  return NextResponse.redirect(instagramAuthUrl(redirectUri, active.workspaceId))
}
