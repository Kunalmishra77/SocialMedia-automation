import { NextResponse } from 'next/server'
import { getUser, getActiveMembership } from '@/lib/authz'
import { createAdminClient } from '@/lib/supabase/admin'

/** RFC-4180 CSV with a UTF-8 BOM so Excel opens Hinglish/emoji correctly. */
function toCsv(rows: Record<string, unknown>[], columns?: string[]): string {
  if (rows.length === 0) return '﻿'
  const headers = columns ?? Object.keys(rows[0])
  const esc = (v: unknown) => {
    let s: string
    if (v == null) s = ''
    else if (Array.isArray(v)) s = v.join(' | ')
    else if (typeof v === 'object') s = JSON.stringify(v)
    else s = String(v)
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const body = [headers.join(','), ...rows.map((r) => headers.map((h) => esc(r[h])).join(','))].join('\r\n')
  return '﻿' + body
}

const yesno = (v: unknown) => (v === true ? 'Yes' : v === false ? 'No' : '')
const dt = (v: unknown) => (v ? new Date(String(v)).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : '')

type Rel = { full_name?: string | null; ig_username?: string | null; phone?: string | null; email?: string | null } | null

/** Session-authenticated CSV export of workspace data. Rich, client-facing columns. */
export async function GET(_req: Request, { params }: { params: Promise<{ type: string }> }) {
  const user = await getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { active } = await getActiveMembership(user.id)
  if (!active) return NextResponse.json({ error: 'no workspace' }, { status: 400 })
  const { type } = await params
  const ws = active.workspaceId
  const admin = createAdminClient()

  let rows: Record<string, unknown>[] = []
  let columns: string[] | undefined

  if (type === 'contacts') {
    const { data } = await admin.from('contacts')
      .select('full_name, ig_username, channel, email, phone, location, lifecycle_stage, ig_followers_count, ig_is_follower, follow_gate_passed, is_vip, is_blocked, opted_out, total_messages_received, total_messages_sent, lead_score, tags, source, last_user_message_at, created_at')
      .eq('workspace_id', ws).order('created_at', { ascending: false }).limit(10000)
    rows = (data ?? []).map((c) => ({
      Name: c.full_name, Username: c.ig_username, Channel: c.channel,
      Email: c.email, Phone: c.phone, Location: c.location, Stage: c.lifecycle_stage,
      Followers: c.ig_followers_count, 'Is Follower': yesno(c.ig_is_follower), 'Follow-gate Passed': yesno(c.follow_gate_passed),
      VIP: yesno(c.is_vip), Blocked: yesno(c.is_blocked), 'Opted Out': yesno(c.opted_out),
      'Msgs Received': c.total_messages_received, 'Msgs Sent': c.total_messages_sent,
      'Lead Score': c.lead_score, Tags: c.tags, Source: c.source,
      'Last Message': dt(c.last_user_message_at), 'First Seen': dt(c.created_at),
    }))
  } else if (type === 'leads') {
    const { data } = await admin.from('leads')
      .select('title, stage, temperature, value, currency, priority, source, ai_score, notes, tags, follow_up_at, closed_at, created_at, updated_at, contacts(full_name, ig_username, phone, email)')
      .eq('workspace_id', ws).order('created_at', { ascending: false }).limit(10000)
    rows = (data ?? []).map((l) => {
      const c = l.contacts as unknown as Rel
      return {
        Lead: l.title, Stage: l.stage, Temperature: l.temperature,
        Value: l.value, Currency: l.currency, Priority: l.priority,
        'Contact Name': c?.full_name, 'Contact Username': c?.ig_username, 'Contact Phone': c?.phone, 'Contact Email': c?.email,
        Source: l.source, 'AI Score': l.ai_score, Tags: l.tags, Notes: l.notes,
        'Follow-up': dt(l.follow_up_at), Closed: dt(l.closed_at), Created: dt(l.created_at), Updated: dt(l.updated_at),
      }
    })
  } else if (type === 'conversations') {
    const { data } = await admin.from('conversations')
      .select('channel, status, last_message, last_message_at, last_user_message_at, unread_count, bot_paused, follow_gate_pending, sentiment, priority, created_at, contacts(full_name, ig_username, phone, email)')
      .eq('workspace_id', ws).order('last_message_at', { ascending: false, nullsFirst: false }).limit(10000)
    rows = (data ?? []).map((v) => {
      const c = v.contacts as unknown as Rel
      return {
        Contact: c?.full_name, Username: c?.ig_username, Phone: c?.phone, Email: c?.email,
        Channel: v.channel, Status: v.status, 'Bot Paused': yesno(v.bot_paused), 'Follow-gate Pending': yesno(v.follow_gate_pending),
        Sentiment: v.sentiment, Priority: v.priority, Unread: v.unread_count,
        'Last Message': v.last_message, 'Last Message At': dt(v.last_message_at), 'Last Customer Msg': dt(v.last_user_message_at),
        Started: dt(v.created_at),
      }
    })
  } else if (type === 'messages') {
    const { data } = await admin.from('messages')
      .select('created_at, direction, sender_type, type, content, status, conversation_id, conversations(contacts(full_name, ig_username))')
      .eq('workspace_id', ws).eq('is_deleted', false).order('created_at', { ascending: false }).limit(20000)
    rows = (data ?? []).map((m) => {
      const c = (m.conversations as unknown as { contacts?: Rel } | null)?.contacts as Rel
      return {
        Time: dt(m.created_at), Contact: c?.full_name, Username: c?.ig_username,
        Direction: m.direction, Sender: m.sender_type, Type: m.type,
        Message: m.content, Status: m.status, 'Conversation ID': m.conversation_id,
      }
    })
  } else {
    return NextResponse.json({ error: 'unknown type' }, { status: 400 })
  }

  columns = rows[0] ? Object.keys(rows[0]) : undefined
  return new NextResponse(toCsv(rows, columns), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${type}-${new Date().toISOString().slice(0, 10)}.csv"`,
      'Cache-Control': 'no-store',
    },
  })
}
