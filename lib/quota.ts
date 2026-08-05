import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { getMonthlyAiUsage } from '@/lib/usage'
import { planLimits, isUnlimited } from '@/lib/plan-features'

/**
 * Plan-limit enforcement. These gates run BEFORE an expensive/outbound action
 * (AI reply, campaign send). They fail OPEN on read errors — a metering hiccup
 * must never break a paying customer — but fail CLOSED once a real over-limit is
 * observed, so plan tiers actually protect revenue.
 */

async function workspacePlan(admin: SupabaseClient, workspaceId: string): Promise<string> {
  const { data } = await admin.from('workspaces').select('plan').eq('id', workspaceId).maybeSingle()
  return (data?.plan as string | null) || 'free'
}

/** Start of the current calendar month, in UTC (metering boundary). */
function monthStartUtc(): string {
  const now = new Date()
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString()
}

/** Whether the workspace may consume one more AI event (reply/embedding) this month. */
export async function withinAiQuota(admin: SupabaseClient, workspaceId: string): Promise<boolean> {
  try {
    const limit = planLimits(await workspacePlan(admin, workspaceId)).maxAiEvents
    if (isUnlimited(limit)) return true
    const used = await getMonthlyAiUsage(admin, workspaceId)
    return used < limit
  } catch {
    return true
  }
}

/** Count messages this workspace has sent/received in the current month. */
export async function monthlyMessageCount(admin: SupabaseClient, workspaceId: string): Promise<number> {
  const { count } = await admin
    .from('messages')
    .select('id', { count: 'exact', head: true })
    .eq('workspace_id', workspaceId)
    .gte('created_at', monthStartUtc())
  return count ?? 0
}

/** Whether the workspace can send `adding` more messages this month without exceeding its plan. */
export async function withinMessageQuota(admin: SupabaseClient, workspaceId: string, adding = 1): Promise<boolean> {
  try {
    const limit = planLimits(await workspacePlan(admin, workspaceId)).maxMessages
    if (isUnlimited(limit)) return true
    const used = await monthlyMessageCount(admin, workspaceId)
    return used + adding <= limit
  } catch {
    return true
  }
}

/** Remaining message headroom this month (Infinity if unlimited, 0 if exhausted). */
export async function remainingMessages(admin: SupabaseClient, workspaceId: string): Promise<number> {
  try {
    const limit = planLimits(await workspacePlan(admin, workspaceId)).maxMessages
    if (isUnlimited(limit)) return Number.POSITIVE_INFINITY
    const used = await monthlyMessageCount(admin, workspaceId)
    return Math.max(0, limit - used)
  } catch {
    return Number.POSITIVE_INFINITY
  }
}
