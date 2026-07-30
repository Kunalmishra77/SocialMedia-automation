import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { processInstagramWebhook, verifyIgSignature } from '@/lib/instagram-webhook'

/**
 * Legacy platform-wide Instagram webhook (env credentials). New clients use the
 * per-workspace endpoint /api/webhooks/instagram/[workspaceId]. Kept for backward
 * compatibility with the platform-level Meta app.
 */
export async function GET(req: NextRequest) {
  const p = new URL(req.url).searchParams
  const verifyToken = process.env.META_VERIFY_TOKEN ?? 'socialflow_verify'
  if (p.get('hub.mode') === 'subscribe' && p.get('hub.verify_token') === verifyToken) {
    return new Response(p.get('hub.challenge') ?? '', { status: 200 })
  }
  return new Response('Forbidden', { status: 403 })
}

export async function POST(req: NextRequest) {
  const raw = await req.text()
  const secret = process.env.INSTAGRAM_APP_SECRET || process.env.META_APP_SECRET
  if (!verifyIgSignature(raw, req.headers.get('x-hub-signature-256'), secret)) {
    return NextResponse.json({ ok: false }, { status: 401 })
  }
  let body: { object?: string; entry?: unknown[] }
  try { body = JSON.parse(raw) } catch { return NextResponse.json({ ok: true }) }
  if (body.object !== 'instagram') return NextResponse.json({ ok: true })

  const admin = createAdminClient()
  await admin.from('ig_webhook_events').insert({ object_type: 'instagram', payload: body, status: 'received' })
  await processInstagramWebhook(admin, body)
  return NextResponse.json({ ok: true })
}
