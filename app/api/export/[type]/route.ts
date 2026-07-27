import { NextResponse } from 'next/server'
import { getUser, getActiveMembership } from '@/lib/authz'
import { createAdminClient } from '@/lib/supabase/admin'

function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return ''
  const headers = Object.keys(rows[0])
  const esc = (v: unknown) => {
    const s = v == null ? '' : Array.isArray(v) ? v.join('|') : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return [headers.join(','), ...rows.map((r) => headers.map((h) => esc(r[h])).join(','))].join('\n')
}

/** Session-authenticated CSV export of workspace data. */
export async function GET(_req: Request, { params }: { params: Promise<{ type: string }> }) {
  const user = await getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { active } = await getActiveMembership(user.id)
  if (!active) return NextResponse.json({ error: 'no workspace' }, { status: 400 })
  const { type } = await params

  const admin = createAdminClient()
  let rows: Record<string, unknown>[] = []

  if (type === 'contacts') {
    const { data } = await admin.from('contacts')
      .select('full_name, ig_username, email, phone, lifecycle_stage, tags, created_at')
      .eq('workspace_id', active.workspaceId).limit(5000)
    rows = data ?? []
  } else if (type === 'leads') {
    const { data } = await admin.from('leads')
      .select('title, stage, value, currency, temperature, source, created_at')
      .eq('workspace_id', active.workspaceId).limit(5000)
    rows = data ?? []
  } else if (type === 'conversations') {
    const { data } = await admin.from('conversations')
      .select('channel, status, last_message, last_message_at, unread_count')
      .eq('workspace_id', active.workspaceId).limit(5000)
    rows = data ?? []
  } else {
    return NextResponse.json({ error: 'unknown type' }, { status: 400 })
  }

  return new NextResponse(toCsv(rows), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${type}-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  })
}
