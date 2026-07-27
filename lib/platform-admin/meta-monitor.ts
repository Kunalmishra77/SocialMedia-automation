import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { decryptToken } from '@/lib/crypto'

const GRAPH = 'https://graph.instagram.com/v24.0'
const DAY = 86400_000

export interface MetaChannelProbe {
  workspace: string
  channel: string
  handle: string | null
  ok: boolean
  statusLabel: string
  latencyMs: number
  tokenState: 'ok' | 'expiring' | 'expired' | 'unknown'
  expiresAt: string | null
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
    .select('external_id, handle, access_token, token_expires_at, channel, workspaces(name)')
    .in('channel', ['instagram', 'facebook'])
    .eq('is_active', true)
    .limit(40)

  const now = Date.now()
  let appUsage: MetaUsage['appUsage'] = null
  let bucWarnings: MetaUsage['bucWarnings'] = []

  const channels: MetaChannelProbe[] = await Promise.all(
    (rows ?? []).map(async (r) => {
      const workspace = (r.workspaces as unknown as { name: string } | null)?.name ?? '—'
      const expiresAt = (r.token_expires_at as string | null) ?? null
      const tokenState: MetaChannelProbe['tokenState'] = !expiresAt
        ? 'unknown'
        : new Date(expiresAt).getTime() < now ? 'expired'
        : new Date(expiresAt).getTime() < now + 7 * DAY ? 'expiring' : 'ok'

      const token = decryptToken(r.access_token as string | null)
      const id = r.external_id as string
      if (!token) {
        return { workspace, channel: r.channel as string, handle: r.handle as string | null, ok: false, statusLabel: 'no token', latencyMs: 0, tokenState, expiresAt }
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

        if (res.ok) return { workspace, channel: r.channel as string, handle: r.handle as string | null, ok: true, statusLabel: 'operational', latencyMs, tokenState, expiresAt }
        const body = await res.json().catch(() => null)
        const msg = (body as { error?: { message?: string } } | null)?.error?.message ?? `HTTP ${res.status}`
        return { workspace, channel: r.channel as string, handle: r.handle as string | null, ok: false, statusLabel: msg.slice(0, 60), latencyMs, tokenState, expiresAt }
      } catch {
        return { workspace, channel: r.channel as string, handle: r.handle as string | null, ok: false, statusLabel: 'unreachable / timeout', latencyMs: Date.now() - t0, tokenState, expiresAt }
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
