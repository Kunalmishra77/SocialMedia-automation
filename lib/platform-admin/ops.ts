import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { getPlatformSettings } from '@/lib/platform-admin/settings'
import { getQueueDepth, type QueueDepth } from '@/lib/platform-admin/infra'

const DAY = 86400_000
const since = (d: number) => new Date(Date.now() - d * DAY).toISOString()

// ─────────────────────────────────────────────────────────────
// AI Infrastructure
// ─────────────────────────────────────────────────────────────

export interface AiInfra {
  configured: boolean
  providers: { name: string; configured: boolean }[]
  defaultModel: string
  fallbackModel: string
  events30d: number
  byMetric: { metric: string; qty: number }[]
  topWorkspaces: { name: string; qty: number }[]
}

export async function getAiInfra(): Promise<AiInfra> {
  const admin = createAdminClient()
  const [settings, { data: usage }, { data: names }] = await Promise.all([
    getPlatformSettings(),
    admin.from('platform_usage_logs').select('metric, quantity, workspace_id').ilike('metric', 'ai%').gte('occurred_at', since(30)),
    admin.from('workspaces').select('id, name'),
  ])

  const nameMap: Record<string, string> = {}
  for (const w of names ?? []) nameMap[w.id] = w.name

  const metricMap: Record<string, number> = {}
  const wsMap: Record<string, number> = {}
  for (const u of usage ?? []) {
    metricMap[u.metric] = (metricMap[u.metric] ?? 0) + (u.quantity ?? 1)
    wsMap[u.workspace_id] = (wsMap[u.workspace_id] ?? 0) + (u.quantity ?? 1)
  }
  const byMetric = Object.entries(metricMap).map(([metric, qty]) => ({ metric, qty })).sort((a, b) => b.qty - a.qty)
  const topWorkspaces = Object.entries(wsMap).map(([id, qty]) => ({ name: nameMap[id] ?? '—', qty })).sort((a, b) => b.qty - a.qty).slice(0, 8)
  const events30d = Object.values(metricMap).reduce((s, q) => s + q, 0)

  return {
    configured: !!process.env.OPENAI_API_KEY || !!process.env.OPENROUTER_API_KEY,
    providers: [
      { name: 'OpenAI', configured: !!process.env.OPENAI_API_KEY },
      { name: 'OpenRouter (fallback)', configured: !!process.env.OPENROUTER_API_KEY },
    ],
    defaultModel: settings.ai.defaultModel,
    fallbackModel: settings.ai.fallbackModel,
    events30d,
    byMetric,
    topWorkspaces,
  }
}

// ─────────────────────────────────────────────────────────────
// Automation Engine (platform-wide)
// ─────────────────────────────────────────────────────────────

export interface AutomationEngine {
  flows: { total: number; active: number; totalRuns: number; neverRun: number }
  rules: { total: number; active: number }
  sequences: { total: number; active: number }
  queues: QueueDepth[]
  recent: { name: string; workspace: string; is_active: boolean; run_count: number; last_run_at: string | null }[]
}

export async function getAutomationEngine(): Promise<AutomationEngine> {
  const admin = createAdminClient()
  const [{ data: flows }, { data: rules }, { data: seqs }, queues, { data: names }] = await Promise.all([
    admin.from('workflow_automations').select('name, workspace_id, is_active, run_count, last_run_at, created_at'),
    admin.from('inbox_rules').select('is_active'),
    admin.from('follow_up_sequences').select('is_active'),
    getQueueDepth(),
    admin.from('workspaces').select('id, name'),
  ])
  const nameMap: Record<string, string> = {}
  for (const w of names ?? []) nameMap[w.id] = w.name

  const flowRows = flows ?? []
  const active = flowRows.filter((f) => f.is_active)
  const neverRun = active.filter((f) => !f.last_run_at && new Date(f.created_at).getTime() < Date.now() - 3 * DAY).length

  const recent = [...flowRows]
    .sort((a, b) => (b.last_run_at ?? '').localeCompare(a.last_run_at ?? ''))
    .slice(0, 10)
    .map((f) => ({ name: f.name as string, workspace: nameMap[f.workspace_id] ?? '—', is_active: f.is_active as boolean, run_count: (f.run_count as number) ?? 0, last_run_at: f.last_run_at as string | null }))

  return {
    flows: { total: flowRows.length, active: active.length, totalRuns: flowRows.reduce((s, f) => s + ((f.run_count as number) ?? 0), 0), neverRun },
    rules: { total: (rules ?? []).length, active: (rules ?? []).filter((r) => r.is_active).length },
    sequences: { total: (seqs ?? []).length, active: (seqs ?? []).filter((s) => s.is_active).length },
    queues,
    recent,
  }
}

// ─────────────────────────────────────────────────────────────
// Integrations Center
// ─────────────────────────────────────────────────────────────

export interface IntegrationRow {
  name: string
  configured: boolean
  note: string
  usage: string | null
}

export async function getIntegrations(): Promise<{ rows: IntegrationRow[]; metaLastChecked: string | null }> {
  const admin = createAdminClient()
  const [{ count: igCount }, { count: tgCount }, { data: metaCache }] = await Promise.all([
    admin.from('channel_accounts').select('id', { count: 'exact', head: true }).eq('channel', 'instagram').eq('is_active', true),
    admin.from('channel_accounts').select('id', { count: 'exact', head: true }).eq('channel', 'telegram').eq('is_active', true),
    admin.from('meta_health_checks').select('checked_at').order('checked_at', { ascending: false }).limit(1),
  ])

  const rows: IntegrationRow[] = [
    { name: 'Instagram / Meta', configured: !!process.env.INSTAGRAM_APP_ID && !!process.env.INSTAGRAM_APP_SECRET, note: 'graph.instagram.com v24.0', usage: `${igCount ?? 0} account(s)` },
    { name: 'Telegram', configured: true, note: 'Bot API (per-bot token)', usage: `${tgCount ?? 0} bot(s)` },
    { name: 'AI (OpenAI/OpenRouter)', configured: !!process.env.OPENAI_API_KEY || !!process.env.OPENROUTER_API_KEY, note: 'multi-model fallback', usage: null },
    { name: 'Email (SMTP)', configured: !!process.env.SMTP_HOST || !!process.env.SMTP_USER, note: 'transactional email', usage: null },
    { name: 'Razorpay', configured: !!process.env.RAZORPAY_KEY_ID && !!process.env.RAZORPAY_KEY_SECRET, note: 'payment gateway', usage: null },
    { name: 'Supabase', configured: !!process.env.NEXT_PUBLIC_SUPABASE_URL, note: 'database · realtime · auth · storage', usage: null },
    { name: 'Facebook', configured: false, note: 'roadmap — not yet implemented', usage: null },
    { name: 'LinkedIn', configured: false, note: 'roadmap — content only', usage: null },
  ]

  return { rows, metaLastChecked: (metaCache ?? [])[0]?.checked_at ?? null }
}
