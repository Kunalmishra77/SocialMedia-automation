import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { parseSignedRequest } from '@/lib/signed-request'

/** Meta calls this when a user removes the app — delete that user's IG data. */
export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null)
  const signed = form?.get('signed_request')?.toString() ?? null
  const data = parseSignedRequest(signed, process.env.INSTAGRAM_APP_SECRET || process.env.META_APP_SECRET)

  if (data?.user_id) {
    const admin = createAdminClient()
    // Remove the deauthorising user's contact + messages (best-effort, all workspaces).
    const { data: contacts } = await admin.from('contacts').select('id').eq('ig_user_id', data.user_id)
    for (const c of contacts ?? []) {
      await admin.from('messages').delete().eq('contact_id', c.id)
      await admin.from('contacts').delete().eq('id', c.id)
    }
  }
  return NextResponse.json({ ok: true })
}
