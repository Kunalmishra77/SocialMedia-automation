import { NextRequest, NextResponse } from 'next/server'
import { createHmac } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { parseSignedRequest } from '@/lib/signed-request'

/**
 * Meta data-deletion callback. Deletes the user's IG data and returns a
 * confirmation URL + code, per Meta's required response shape.
 */
export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null)
  const signed = form?.get('signed_request')?.toString() ?? null
  const secret = process.env.INSTAGRAM_APP_SECRET || process.env.META_APP_SECRET
  const data = parseSignedRequest(signed, secret)
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin).replace(/\/$/, '')

  const userId = data?.user_id ?? 'unknown'
  const code = createHmac('sha256', secret || 'k').update(userId).digest('hex').slice(0, 16)

  if (data?.user_id) {
    const admin = createAdminClient()
    const { data: contacts } = await admin.from('contacts').select('id').eq('ig_user_id', data.user_id)
    for (const c of contacts ?? []) {
      await admin.from('messages').delete().eq('contact_id', c.id)
      await admin.from('contacts').delete().eq('id', c.id)
    }
  }

  return NextResponse.json({ url: `${base}/data-deletion?code=${code}`, confirmation_code: code })
}
