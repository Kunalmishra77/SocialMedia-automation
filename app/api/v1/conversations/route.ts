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
    .from('conversations')
    .select('id, channel, status, last_message, last_message_at, unread_count')
    .eq('workspace_id', workspaceId)
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .limit(limit)

  return NextResponse.json({ data: data ?? [] })
}
