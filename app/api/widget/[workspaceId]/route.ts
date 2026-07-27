import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAIReply } from '@/lib/ai/reply'
import { aiConfigured } from '@/lib/ai/client'

/** Public website-widget chat endpoint: visitor message → store + AI reply. */
export async function POST(req: Request, { params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params
  let body: { message?: string; sessionId?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'bad request' }, { status: 400 }) }
  const message = (body.message ?? '').trim()
  const sessionId = (body.sessionId ?? '').trim()
  if (!message || !sessionId) return NextResponse.json({ error: 'missing' }, { status: 400 })

  const admin = createAdminClient()
  const { data: ws } = await admin.from('workspaces').select('id, status').eq('id', workspaceId).maybeSingle()
  if (!ws || ws.status !== 'active') return NextResponse.json({ error: 'unavailable' }, { status: 404 })

  // Anonymous web visitor as a contact (session id as external id).
  const { data: contact } = await admin.from('contacts').upsert(
    { workspace_id: workspaceId, ig_user_id: `web_${sessionId}`, channel: 'instagram', source: 'web', full_name: 'Website visitor' },
    { onConflict: 'workspace_id,ig_user_id' },
  ).select('id').single()
  if (!contact) return NextResponse.json({ error: 'error' }, { status: 500 })

  // Find/create web conversation.
  let convId: string
  const { data: existing } = await admin.from('conversations').select('id').eq('workspace_id', workspaceId).eq('contact_id', contact.id).eq('channel', 'web').maybeSingle()
  if (existing) convId = existing.id
  else {
    const { data: c } = await admin.from('conversations').insert({ workspace_id: workspaceId, contact_id: contact.id, channel: 'web', status: 'open' }).select('id').single()
    convId = c!.id
  }

  await admin.from('messages').insert({ conversation_id: convId, workspace_id: workspaceId, sender_type: 'contact', direction: 'inbound', type: 'text', content: message, status: 'delivered' })

  let reply = "Thanks for reaching out! Our team will get back to you shortly."
  if (aiConfigured()) {
    const ai = await getAIReply(admin, workspaceId, convId, message)
    if (ai) reply = ai
  }
  await admin.from('messages').insert({ conversation_id: convId, workspace_id: workspaceId, sender_type: 'bot', direction: 'outbound', type: 'text', content: reply, status: 'sent', metadata: { widget: true } })

  return NextResponse.json({ reply })
}
