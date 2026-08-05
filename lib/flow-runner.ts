import 'server-only'

import type { createAdminClient } from '@/lib/supabase/admin'
import type { FlowStep } from '@/lib/actions/flow-builder'
import { sendTelegramMessage } from '@/lib/channels/telegram'
import { sendInstagramDM } from '@/lib/channels/instagram'

type Admin = ReturnType<typeof createAdminClient>

/**
 * Run active custom flows for an inbound DM. Executes send_message + add_tag
 * steps immediately; returns true if a flow matched (caller can skip AI).
 * Channel = 'telegram' | 'dm' (instagram). recipient = chatId or IGSID.
 */
export async function runFlowsForDM(
  admin: Admin,
  opts: {
    workspaceId: string
    conversationId: string
    contactId: string
    channel: 'telegram' | 'dm'
    token: string
    recipient: string
    text: string
    isFirstDm: boolean
  },
): Promise<boolean> {
  const triggers = opts.isFirstDm ? ['first_dm', 'dm_received'] : ['dm_received']
  const { data: flows } = await admin
    .from('workflow_automations')
    .select('id, trigger_type, trigger_config, nodes, run_count')
    .eq('workspace_id', opts.workspaceId)
    .eq('is_active', true)
    .in('trigger_type', triggers)

  const lower = opts.text.toLowerCase()
  for (const flow of flows ?? []) {
    const kw = (flow.trigger_config as { keyword?: string } | null)?.keyword?.toLowerCase()
    if (kw && !lower.includes(kw)) continue

    const steps = (flow.nodes as FlowStep[]) ?? []
    if (steps.length === 0) continue

    for (const step of steps) {
      // A 'wait' step must PAUSE the flow. There is no delayed scheduler yet, so we
      // stop here rather than firing the post-wait steps immediately (which turned a
      // "wait 24h → send" into an instant send). Steps before the wait still run.
      if (step.type === 'wait') break
      if (step.type === 'send_message' && step.message) {
        if (opts.channel === 'telegram') await sendTelegramMessage(opts.token, opts.recipient, step.message)
        else await sendInstagramDM(opts.token, opts.recipient, step.message)
        await admin.from('messages').insert({
          conversation_id: opts.conversationId, workspace_id: opts.workspaceId, sender_type: 'bot',
          direction: 'outbound', type: 'text', content: step.message, status: 'sent',
        })
      } else if (step.type === 'add_tag' && step.tag) {
        const { data: c } = await admin.from('contacts').select('tags').eq('id', opts.contactId).maybeSingle()
        const tags = Array.from(new Set([...((c?.tags as string[]) ?? []), step.tag]))
        await admin.from('contacts').update({ tags }).eq('id', opts.contactId)
      } else if (step.type === 'assign') {
        await admin.from('conversations').update({ status: 'assigned' }).eq('id', opts.conversationId)
      }
    }
    await admin.from('workflow_automations').update({ run_count: (flow.run_count ?? 0) + 1, last_run_at: new Date().toISOString() }).eq('id', flow.id)
    return true // first matching flow wins
  }
  return false
}
