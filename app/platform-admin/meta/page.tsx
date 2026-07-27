import { notFound } from 'next/navigation'
import { Network, Gauge, KeyRound, RefreshCw, AlertTriangle } from 'lucide-react'
import { requirePlatformAdmin, can } from '@/lib/platform-admin/auth'
import { getCachedMetaHealth } from '@/lib/platform-admin/meta-monitor'
import { refreshMetaHealthAction } from '@/lib/actions/platform-admin'
import { PageHeader, Panel, Stat, Bar, StatusDot, timeAgo } from '../ui'

export default async function MetaMonitorPage() {
  const ctx = await requirePlatformAdmin()
  if (!can(ctx, 'view_system_health')) notFound()
  const m = await getCachedMetaHealth() // cached — no live API calls on load

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title="Meta API monitor"
        subtitle="Rate-limit usage + token health across every connected Instagram/Facebook account."
        action={
          <form action={refreshMetaHealthAction}>
            <button className="inline-flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800"><RefreshCw className="h-4 w-4" />Check now</button>
          </form>
        }
      />

      <p className="text-xs text-zinc-500">
        {m.lastCheckedAt ? <>Last checked {timeAgo(m.lastCheckedAt)} · auto-probed every 15 min</> : 'Not probed yet — click “Check now” or wait for the scheduled probe.'}
      </p>

      {!m.configured && (
        <div className="rounded-lg border border-amber-900/50 bg-amber-950/30 px-4 py-2.5 text-sm text-amber-300">
          INSTAGRAM_APP_ID / SECRET not set — token debugging limited.
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Connected accounts" value={m.activeChannels} icon={Network} />
        <Stat label="Healthy" value={`${m.healthy}/${m.activeChannels}`} icon={Network} tone={m.healthy === m.activeChannels ? 'positive' : 'warning'} />
        <Stat label="App ID" value={m.appId ? `…${m.appId.slice(-6)}` : '—'} icon={KeyRound} />
      </div>

      {/* App-level rate limit */}
      <Panel title="App rate-limit usage" right={<Gauge className="h-4 w-4 text-zinc-600" />}>
        {m.appUsage ? (
          <div className="space-y-3">
            <Bar label="Call count" value={m.appUsage.callCount} max={100} suffix={`${m.appUsage.callCount}%`} tone={m.appUsage.callCount > 80 ? 'amber' : 'emerald'} />
            <Bar label="CPU time" value={m.appUsage.cpuTime} max={100} suffix={`${m.appUsage.cpuTime}%`} tone={m.appUsage.cpuTime > 80 ? 'amber' : 'emerald'} />
            <Bar label="Total time" value={m.appUsage.totalTime} max={100} suffix={`${m.appUsage.totalTime}%`} tone={m.appUsage.totalTime > 80 ? 'amber' : 'emerald'} />
            <p className="text-xs text-zinc-600">From Meta&apos;s <span className="font-mono">X-App-Usage</span> header (% of hourly limit). Throttling begins near 100%.</p>
          </div>
        ) : (
          <p className="text-sm text-zinc-500">No usage headers yet — connect an account or re-probe. (Meta returns usage only on live API calls.)</p>
        )}
        {m.bucWarnings.length > 0 && (
          <div className="mt-4 space-y-1 border-t border-zinc-800 pt-3">
            {m.bucWarnings.map((b, i) => (
              <p key={i} className="flex items-center gap-2 text-xs text-amber-400"><AlertTriangle className="h-3.5 w-3.5" />{b.type}: throttled, regain in ~{Math.round(b.regainSec / 60)} min</p>
            ))}
          </div>
        )}
      </Panel>

      {/* Per-account probes */}
      <Panel title="Connected accounts (live probe)">
        {m.channels.length === 0 ? (
          <p className="text-sm text-zinc-500">No Instagram/Facebook accounts connected yet.</p>
        ) : (
          <div className="divide-y divide-zinc-800">
            {m.channels.map((c, i) => (
              <div key={i} className="flex items-center justify-between gap-3 py-3 text-sm">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-zinc-200">
                    <StatusDot state={c.ok ? 'operational' : 'down'} />
                    <span className="capitalize">{c.channel}</span>
                    {c.handle && <span className="text-zinc-500">@{c.handle}</span>}
                    <span className="text-xs text-zinc-600">{c.workspace}</span>
                  </p>
                  <p className="mt-0.5 text-xs text-zinc-500">{c.ok ? `operational · ${c.latencyMs}ms` : c.statusLabel}</p>
                </div>
                <div className="shrink-0 text-right text-xs">
                  <span className={c.tokenState === 'expired' ? 'text-red-400' : c.tokenState === 'expiring' ? 'text-amber-400' : 'text-zinc-500'}>
                    {c.tokenState === 'unknown' ? 'no expiry' : c.tokenState === 'expired' ? 'token expired' : `token ${c.tokenState}`}
                  </span>
                  {c.expiresAt && <p className="text-zinc-600">{new Date(c.expiresAt).toLocaleDateString()}</p>}
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  )
}
