import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyInternalCronCall } from '@/lib/cron-auth'
import { sendTelegramMessage } from '@/lib/channels/telegram'
import { sendInstagramDM } from '@/lib/channels/instagram'
import { decryptToken } from '@/lib/crypto'
import { withinMessageQuota } from '@/lib/quota'

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
    const next = steps[cs.current_step + 1]

    // Atomic claim (optimistic lock on current_step): whichever cron run wins the
    // advance owns this step. A concurrent/retried run reads the same row but its
    // guarded update returns zero rows → it skips → no double-send.
    const { data: claimed } = await admin
      .from('contact_sequences')
      .update({
        current_step: cs.current_step + 1,
        next_send_at: step && next ? new Date(Date.now() + (next.delay_hours || 0) * 3600_000).toISOString() : null,
        status: step && next ? 'active' : 'completed',
      })
      .eq('id', cs.id)
      .eq('current_step', cs.current_step)
      .eq('status', 'active')
      .select('id')
      .maybeSingle()
    if (!claimed) continue // lost the race, or no more steps
    if (!step) continue // ran past the end — marked completed above

    // Respect consent: a contact who opted out / was blocked mid-sequence stops.
    const { data: contact } = await admin.from('contacts').select('opted_out, is_blocked').eq('id', cs.contact_id).maybeSingle()
    if (contact?.opted_out || contact?.is_blocked) {
      await admin.from('contact_sequences').update({ status: 'completed', next_send_at: null }).eq('id', cs.id)
      continue
    }

    // Plan message quota.
    if (!(await withinMessageQuota(admin, cs.workspace_id))) continue

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
    // Record the send outcome either way — a failed drip is visible, not silently lost.
    await admin.from('messages').insert({
      conversation_id: cs.conversation_id, workspace_id: cs.workspace_id, sender_type: 'system',
      direction: 'outbound', type: 'text', content: step.message, status: ok ? 'sent' : 'failed',
    })
    if (ok) sent++
  }

  return NextResponse.json({ ok: true, sent, due: due?.length ?? 0 })
}
