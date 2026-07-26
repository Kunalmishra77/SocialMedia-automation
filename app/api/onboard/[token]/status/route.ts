import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

/** Public: lightweight status poll for the onboarding waiting screen. */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const admin = createAdminClient()
  const { data: ws } = await admin
    .from('workspaces')
    .select('status, owner_email, onboarding_data')
    .eq('onboarding_token', token)
    .maybeSingle()

  if (!ws) return NextResponse.json({ status: 'invalid' })

  const approved = ws.status === 'active'
  const creds = approved
    ? (ws.onboarding_data as { approved_credentials?: { loginUrl: string } } | null)?.approved_credentials
    : null

  return NextResponse.json({
    status: ws.status,
    loginUrl: creds?.loginUrl ?? null,
    email: ws.owner_email ?? null,
  })
}
