import 'server-only'

import type { createAdminClient } from '@/lib/supabase/admin'

type Admin = ReturnType<typeof createAdminClient>

interface RuleConditions {
  match?: 'any' | 'all'
  keywords?: string[] // message contains any/all of these (case-insensitive)
}
interface RuleActions {
  auto_reply?: string
  add_label?: string
  assign_agent_id?: string
  mark_status?: string
}

/**
 * Apply active inbox rules to an inbound message. Returns an optional auto-reply
 * string the caller should send. Rules run in priority order.
 */
export async function applyInboxRules(
  admin: Admin,
  workspaceId: string,
  conversationId: string,
  text: string,
): Promise<{ autoReply?: string }> {
  const { data: rules } = await admin
    .from('inbox_rules')
    .select('id, conditions, actions')
    .eq('workspace_id', workspaceId)
    .eq('is_active', true)
    .order('priority', { ascending: false })

  const lower = (text || '').toLowerCase()
  let autoReply: string | undefined

  for (const rule of rules ?? []) {
    const cond = (rule.conditions ?? {}) as RuleConditions
    const acts = (rule.actions ?? {}) as RuleActions
    const kws = (cond.keywords ?? []).map((k) => k.toLowerCase()).filter(Boolean)
    if (kws.length === 0) continue

    const hit = cond.match === 'all' ? kws.every((k) => lower.includes(k)) : kws.some((k) => lower.includes(k))
    if (!hit) continue

    const convUpdate: Record<string, unknown> = {}
    if (acts.add_label) {
      const { data: conv } = await admin.from('conversations').select('labels').eq('id', conversationId).maybeSingle()
      const labels = new Set([...((conv?.labels as string[]) ?? []), acts.add_label])
      convUpdate.labels = Array.from(labels)
    }
    if (acts.assign_agent_id) convUpdate.assigned_agent_id = acts.assign_agent_id
    if (acts.mark_status) convUpdate.status = acts.mark_status
    if (Object.keys(convUpdate).length) await admin.from('conversations').update(convUpdate).eq('id', conversationId)

    if (acts.auto_reply && !autoReply) autoReply = acts.auto_reply
    // First matching rule with an auto-reply wins; other actions still applied.
  }

  return { autoReply }
}
