import 'server-only'

import os from 'os'
import { createAdminClient } from '@/lib/supabase/admin'

// ─────────────────────────────────────────────────────────────
// Server metrics — real host/container stats from os + process.
// No external infra; reflects the actual running Node process.
// ─────────────────────────────────────────────────────────────

export interface ServerMetrics {
  cpu: { cores: number; load1: number; load5: number; load15: number; loadPct: number }
  memory: { rssMb: number; heapUsedMb: number; heapTotalMb: number; osTotalMb: number; osFreeMb: number; osUsedPct: number }
  process: { uptimeH: number; node: string; platform: string; pid: number }
}

export function getServerMetrics(): ServerMetrics {
  const cores = os.cpus()?.length || 1
  const [load1, load5, load15] = os.loadavg() // 0,0,0 on Windows — expected
  const mem = process.memoryUsage()
  const osTotal = os.totalmem()
  const osFree = os.freemem()
  const mb = (n: number) => Math.round(n / 1024 / 1024)

  return {
    cpu: {
      cores,
      load1: Number(load1.toFixed(2)),
      load5: Number(load5.toFixed(2)),
      load15: Number(load15.toFixed(2)),
      loadPct: Math.min(100, Math.round((load1 / cores) * 100)),
    },
    memory: {
      rssMb: mb(mem.rss),
      heapUsedMb: mb(mem.heapUsed),
      heapTotalMb: mb(mem.heapTotal),
      osTotalMb: mb(osTotal),
      osFreeMb: mb(osFree),
      osUsedPct: Math.round(((osTotal - osFree) / osTotal) * 100),
    },
    process: {
      uptimeH: Number((process.uptime() / 3600).toFixed(1)),
      node: process.version,
      platform: `${os.type()} ${os.release()}`,
      pid: process.pid,
    },
  }
}

// ─────────────────────────────────────────────────────────────
// Queue depth — our real job queues are DB tables drained by cron.
// ─────────────────────────────────────────────────────────────

export interface QueueDepth {
  name: string
  pending: number
  failed?: number
  cron: string
  tone: 'ok' | 'busy' | 'error'
}

export async function getQueueDepth(): Promise<QueueDepth[]> {
  const admin = createAdminClient()
  const nowIso = new Date().toISOString()
  const dayAgo = new Date(Date.now() - 86400_000).toISOString()

  const [
    { count: contentDue },
    { count: contentFailed },
    { count: campaignPending },
    { count: sequencesDue },
    { count: webhookFailed },
  ] = await Promise.all([
    admin.from('content_posts').select('id', { count: 'exact', head: true }).eq('status', 'scheduled').lte('scheduled_at', nowIso),
    admin.from('content_posts').select('id', { count: 'exact', head: true }).eq('status', 'failed'),
    admin.from('campaign_send_queue').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    admin.from('contact_sequences').select('id', { count: 'exact', head: true }).eq('status', 'active').lte('next_send_at', nowIso),
    admin.from('webhook_deliveries').select('id', { count: 'exact', head: true }).eq('success', false).gte('attempted_at', dayAgo),
  ])

  const q = (name: string, pending: number, cron: string, failed?: number): QueueDepth => ({
    name, pending, failed, cron,
    tone: (failed ?? 0) > 0 ? 'error' : pending > 20 ? 'busy' : 'ok',
  })

  return [
    q('Scheduled content', contentDue ?? 0, 'publish-content · */5 min', contentFailed ?? 0),
    q('Campaign sends', campaignPending ?? 0, 'send-campaigns · */5 min'),
    q('Drip sequences due', sequencesDue ?? 0, 'run-sequences · */30 min'),
    q('Webhook deliveries (failed 24h)', 0, 'outbound webhooks', webhookFailed ?? 0),
  ]
}
