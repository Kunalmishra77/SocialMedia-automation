import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { decryptToken } from '@/lib/crypto'

const GRAPH = 'https://graph.instagram.com/v24.0'
const DAY = 86400_000

export interface MetaChannelProbe {
  channelAccountId: string
  workspaceId: string
  workspace: string
  channel: string
  handle: string | null
  ok: boolean
  statusLabel: string
  latencyMs: number
  tokenState: 'ok' | 'expiring' | 'expired' | 'unknown'
  expiresAt: string | null
  appUsage?: { callCount: number; cpuTime: number; totalTime: number } | null
}

export interface MetaUsage {
  configured: boolean
  appId: string | null
  appUsage: { callCount: number; cpuTime: number; totalTime: number } | null
  bucWarnings: { type: string; regainSec: number }[]
  channels: MetaChannelProbe[]
  activeChannels: number
  healthy: number
}

function parseAppUsage(header: string | null): { callCount: number; cpuTime: number; totalTime: number } | null {
  if (!header) return null
  try {
    const o = JSON.parse(header)
    return { callCount: Number(o.call_count ?? 0), cpuTime: Number(o.total_cputime ?? 0), totalTime: Number(o.total_time ?? 0) }
  } catch {
    return null
  }
}

function parseBuc(header: string | null): { type: string; regainSec: number }[] {
  if (!header) return []
  try {
    const o = JSON.parse(header) as Record<string, { type?: string; estimated_time_to_regain_access?: number }[]>
    const out: { type: string; regainSec: number }[] = []
    for (const arr of Object.values(o)) {
      for (const e of arr) {
        if ((e.estimated_time_to_regain_access ?? 0) > 0) out.push({ type: e.type ?? 'unknown', regainSec: (e.estimated_time_to_regain_access ?? 0) * 60 })
      }
    }
    return out
  } catch {
    return []
  }
}

/** Live-probe each connected Meta/Instagram channel and read rate-limit headers. */
export async function getMetaUsage(): Promise<MetaUsage> {
  const configured = !!process.env.INSTAGRAM_APP_ID && !!process.env.INSTAGRAM_APP_SECRET
  const admin = createAdminClient()

  const { data: rows } = await admin
    .from('channel_accounts')
    .select('id, external_id, handle, access_token, token_expires_at, channel, workspace_id, workspaces(name)')
    .in('channel', ['instagram', 'facebook'])
    .eq('is_active', true)
    .limit(40)

  const now = Date.now()
  let appUsage: MetaUsage['appUsage'] = null
  let bucWarnings: MetaUsage['bucWarnings'] = []

  const channels: MetaChannelProbe[] = await Promise.all(
    (rows ?? []).map(async (r): Promise<MetaChannelProbe> => {
      const base = {
        channelAccountId: r.id as string,
        workspaceId: r.workspace_id as string,
        workspace: (r.workspaces as unknown as { name: string } | null)?.name ?? '—',
        channel: r.channel as string,
        handle: r.handle as string | null,
      }
      const expiresAt = (r.token_expires_at as string | null) ?? null
      const tokenState: MetaChannelProbe['tokenState'] = !expiresAt
        ? 'unknown'
        : new Date(expiresAt).getTime() < now ? 'expired'
        : new Date(expiresAt).getTime() < now + 7 * DAY ? 'expiring' : 'ok'

      const token = decryptToken(r.access_token as string | null)
      const id = r.external_id as string
      if (!token) {
        return { ...base, ok: false, statusLabel: 'no token', latencyMs: 0, tokenState, expiresAt, appUsage: null }
      }

      const t0 = Date.now()
      try {
        const ctrl = new AbortController()
        const timer = setTimeout(() => ctrl.abort(), 4000)
        const res = await fetch(`${GRAPH}/${id}?fields=id,username&access_token=${encodeURIComponent(token)}`, { signal: ctrl.signal, cache: 'no-store' })
        clearTimeout(timer)
        const latencyMs = Date.now() - t0

        const usage = parseAppUsage(res.headers.get('x-app-usage'))
        if (usage && (!appUsage || usage.callCount > appUsage.callCount)) appUsage = usage
        bucWarnings = bucWarnings.concat(parseBuc(res.headers.get('x-business-use-case-usage')))

        if (res.ok) return { ...base, ok: true, statusLabel: 'operational', latencyMs, tokenState, expiresAt, appUsage: usage }
        const body = await res.json().catch(() => null)
        const msg = (body as { error?: { message?: string } } | null)?.error?.message ?? `HTTP ${res.status}`
        return { ...base, ok: false, statusLabel: msg.slice(0, 60), latencyMs, tokenState, expiresAt, appUsage: usage }
      } catch {
        return { ...base, ok: false, statusLabel: 'unreachable / timeout', latencyMs: Date.now() - t0, tokenState, expiresAt, appUsage: null }
      }
    }),
  )

  return {
    configured,
    appId: process.env.INSTAGRAM_APP_ID ?? null,
    appUsage,
    bucWarnings: bucWarnings.slice(0, 5),
    channels,
    activeChannels: channels.length,
    healthy: channels.filter((c) => c.ok).length,
  }
}

// ─────────────────────────────────────────────────────────────
// Cached health — the console reads this (fast); a cron + "Check Now" refresh it.
// ─────────────────────────────────────────────────────────────

/** Run the live probe and persist results into meta_health_checks. Returns the fresh probe. */
export async function refreshMetaHealthCache(): Promise<MetaUsage> {
  const usage = await getMetaUsage()
  const admin = createAdminClient()
  const nowIso = new Date().toISOString()
  for (const c of usage.channels) {
    await admin.from('meta_health_checks').upsert({
      channel_account_id: c.channelAccountId,
      workspace_id: c.workspaceId,
      channel: c.channel,
      handle: c.handle,
      ok: c.ok,
      status_label: c.statusLabel,
      latency_ms: c.latencyMs,
      token_state: c.tokenState,
      expires_at: c.expiresAt,
      app_usage: c.appUsage ?? {},
      checked_at: nowIso,
    }, { onConflict: 'channel_account_id' })
  }
  return usage
}

export interface CachedMetaHealth extends MetaUsage {
  lastCheckedAt: string | null
}

/** Read cached probes (no live API calls). */
export async function getCachedMetaHealth(): Promise<CachedMetaHealth> {
  const configured = !!process.env.INSTAGRAM_APP_ID && !!process.env.INSTAGRAM_APP_SECRET
  const admin = createAdminClient()
  const { data } = await admin
    .from('meta_health_checks')
    .select('channel_account_id, workspace_id, channel, handle, ok, status_label, latency_ms, token_state, expires_at, app_usage, checked_at, channel_accounts(workspaces(name))')
    .order('checked_at', { ascending: false })
    .limit(60)

  let appUsage: MetaUsage['appUsage'] = null
  let lastCheckedAt: string | null = null
  const channels: MetaChannelProbe[] = (data ?? []).map((r) => {
    const usage = (r.app_usage as { callCount?: number; cpuTime?: number; totalTime?: number } | null) ?? null
    if (usage && typeof usage.callCount === 'number' && (!appUsage || usage.callCount > appUsage.callCount)) {
      appUsage = { callCount: usage.callCount, cpuTime: usage.cpuTime ?? 0, totalTime: usage.totalTime ?? 0 }
    }
    if (!lastCheckedAt || (r.checked_at as string) > lastCheckedAt) lastCheckedAt = r.checked_at as string
    return {
      channelAccountId: r.channel_account_id as string,
      workspaceId: r.workspace_id as string,
      workspace: ((r.channel_accounts as unknown as { workspaces?: { name: string } } | null)?.workspaces?.name) ?? '—',
      channel: r.channel as string,
      handle: r.handle as string | null,
      ok: r.ok as boolean,
      statusLabel: (r.status_label as string) ?? '',
      latencyMs: (r.latency_ms as number) ?? 0,
      tokenState: (r.token_state as MetaChannelProbe['tokenState']) ?? 'unknown',
      expiresAt: r.expires_at as string | null,
      appUsage: null,
    }
  })

  return {
    configured,
    appId: process.env.INSTAGRAM_APP_ID ?? null,
    appUsage,
    bucWarnings: [],
    channels,
    activeChannels: channels.length,
    healthy: channels.filter((c) => c.ok).length,
    lastCheckedAt,
  }
}
