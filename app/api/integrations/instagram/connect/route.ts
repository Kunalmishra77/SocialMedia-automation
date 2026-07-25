import { NextRequest, NextResponse } from 'next/server'
import { IG_SCOPES } from '@/lib/channels/instagram'
import { getUser, getActiveMembership } from '@/lib/authz'

/** Start the Meta OAuth flow. State carries the workspace id. */
export async function GET(req: NextRequest) {
  const user = await getUser()
  if (!user) return NextResponse.redirect(new URL('/login', req.url))
  const { active } = await getActiveMembership(user.id)
  if (!active) return NextResponse.redirect(new URL('/workspace/new', req.url))

  const appId = process.env.META_APP_ID
  const base = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin
  if (!appId) {
    return NextResponse.redirect(new URL('/settings/channels?error=meta_not_configured', req.url))
  }

  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: `${base}/api/integrations/instagram/callback`,
    scope: IG_SCOPES,
    response_type: 'code',
    state: active.workspaceId,
  })
  return NextResponse.redirect(`https://www.facebook.com/v21.0/dialog/oauth?${params.toString()}`)
}
