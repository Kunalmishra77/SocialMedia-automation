import { NextResponse } from 'next/server'
import { verifyApiKey } from '@/lib/api-keys'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(req: Request) {
  const workspaceId = await verifyApiKey(req)
  if (!workspaceId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const url = new URL(req.url)
  const limit = Math.min(Number(url.searchParams.get('limit') ?? 50), 200)
  const admin = createAdminClient()
  const { data } = await admin
    .from('contacts')
    .select('id, full_name, ig_username, email, phone, lifecycle_stage, tags, created_at')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })
    .limit(limit)

  return NextResponse.json({ data: data ?? [] })
}
