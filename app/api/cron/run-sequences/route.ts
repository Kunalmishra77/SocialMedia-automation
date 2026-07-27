import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyInternalCronCall } from '@/lib/cron-auth'
import { sendTelegramMessage } from '@/lib/channels/telegram'
import { sendInstagramDM } from '@/lib/channels/instagram'
import { decryptToken } from '@/lib/crypto'

interface Step { delay_hours: number; message: string }

/** Advance due drip-sequence steps and deliver the next message per channel. */
export async function GET(req: NextRequest) {
  try {
    verifyInternalCronCall(req)
  } catch {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const admin = createAdminClient()
  const nowIso = new Date().toISOString()

  const { data: due } = await admin
    .from('contact_sequences')
    .select('id, workspace_id, sequence_id, contact_id, conversation_id, current_step, follow_up_sequences(steps)')
    .eq('status', 'active')
    .lte('next_send_at', nowIso)
    .limit(100)

  let sent = 0
  for (const cs of due ?? []) {
    const steps = ((cs.follow_up_sequences as unknown as { steps: Step[] } | null)?.steps ?? []) as Step[]
    const step = steps[cs.current_step]
    if (!step) {
      await admin.from('contact_sequences').update({ status: 'completed' }).eq('id', cs.id)
      continue
    }

    // Resolve the conversation channel + token.
    const { data: conv } = await admin
      .from('conversations')
      .select('channel, channel_account_id, meta')
      .eq('id', cs.conversation_id)
      .maybeSingle()
    let ok = false
    if (conv?.channel_account_id) {
      const { data: acct } = await admin.from('channel_accounts').select('access_token, external_id').eq('id', conv.channel_account_id).maybeSingle()
      const meta = conv.meta as { telegram_chat_id?: string; ig_igsid?: string } | null
      const seqToken = decryptToken(acct?.access_token)
      if (seqToken && conv.channel === 'telegram' && meta?.telegram_chat_id) {
        ok = (await sendTelegramMessage(seqToken, meta.telegram_chat_id, step.message)).ok
      } else if (seqToken && conv.channel === 'dm' && meta?.ig_igsid) {
        ok = (await sendInstagramDM(seqToken, meta.ig_igsid, step.message)).ok
      }
    }
    if (ok) {
      await admin.from('messages').insert({
        conversation_id: cs.conversation_id, workspace_id: cs.workspace_id, sender_type: 'system',
        direction: 'outbound', type: 'text', content: step.message, status: 'sent',
      })
      sent++
    }

    const next = steps[cs.current_step + 1]
    await admin.from('contact_sequences').update({
      current_step: cs.current_step + 1,
      next_send_at: next ? new Date(Date.now() + (next.delay_hours || 0) * 3600_000).toISOString() : null,
      status: next ? 'active' : 'completed',
    }).eq('id', cs.id)
  }

  return NextResponse.json({ ok: true, sent, due: due?.length ?? 0 })
}
