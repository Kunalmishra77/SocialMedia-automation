import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Record a usage event to platform_usage_logs. Never throws into the caller —
 * usage metering must never break a user-facing action.
 *
 * Metrics: 'ai_reply' | 'ai_generate' | 'ai_embedding' | ... (prefix 'ai' = AI usage).
 */
export async function logUsage(
  admin: SupabaseClient,
  workspaceId: string,
  metric: string,
  quantity = 1,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  try {
    await admin.from('platform_usage_logs').insert({ workspace_id: workspaceId, metric, quantity, metadata })
  } catch (err) {
    console.error('[usage] failed to log', metric, err)
  }
}

/** Sum AI usage events for a workspace since the start of the current month. */
export async function getMonthlyAiUsage(admin: SupabaseClient, workspaceId: string): Promise<number> {
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()
  const { data } = await admin
    .from('platform_usage_logs')
    .select('quantity, metric')
    .eq('workspace_id', workspaceId)
    .ilike('metric', 'ai%')
    .gte('occurred_at', monthStart)
  return (data ?? []).reduce((sum, r) => sum + (r.quantity ?? 1), 0)
}
