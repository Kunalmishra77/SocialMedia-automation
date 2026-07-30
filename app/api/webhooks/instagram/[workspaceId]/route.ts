import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getInstagramApp } from '@/lib/instagram-config'
import { processInstagramWebhook, verifyIgSignature } from '@/lib/instagram-webhook'

/**
 * Per-workspace Instagram webhook. Each client configures their own Meta app to
 * point here (…/api/webhooks/instagram/<their-workspace-id>) with their own
 * verify token; the signature is checked against their own app secret. No
 * platform-level Instagram credentials are required in the environment.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params
  const admin = createAdminClient()
  const app = await getInstagramApp(admin, workspaceId)
  const p = new URL(req.url).searchParams
  if (p.get('hub.mode') === 'subscribe' && app && p.get('hub.verify_token') === app.verifyToken) {
    return new Response(p.get('hub.challenge') ?? '', { status: 200 })
  }
  return new Response('Forbidden', { status: 403 })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params
  const raw = await req.text()
  const admin = createAdminClient()
  const app = await getInstagramApp(admin, workspaceId)

  if (!verifyIgSignature(raw, req.headers.get('x-hub-signature-256'), app?.appSecret)) {
    return NextResponse.json({ ok: false }, { status: 401 })
  }
  let body: { object?: string; entry?: unknown[] }
  try { body = JSON.parse(raw) } catch { return NextResponse.json({ ok: true }) }
  if (body.object !== 'instagram') return NextResponse.json({ ok: true })

  await admin.from('ig_webhook_events').insert({ workspace_id: workspaceId, object_type: 'instagram', payload: body, status: 'received' })
  await processInstagramWebhook(admin, body)
  return NextResponse.json({ ok: true })
}
