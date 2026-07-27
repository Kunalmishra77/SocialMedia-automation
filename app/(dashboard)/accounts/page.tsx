import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Plus, RefreshCw, Unplug } from 'lucide-react'
import { requireUser, getActiveMembership, roleCan } from '@/lib/authz'
import { createAdminClient } from '@/lib/supabase/admin'
import { PageHeader } from '@/components/dashboard/page-header'
import { Card, CardContent } from '@/components/ui/card'
import { PLATFORMS, platformByKey } from '@/lib/platforms'
import { disconnectChannelAction } from '@/lib/actions/channels'

const DAY = 86400_000

type Health = { dot: string; label: string; cls: string }
function health(isActive: boolean, expiresAt: string | null): Health {
  if (!isActive) return { dot: 'bg-zinc-400', label: 'Inactive', cls: 'text-muted-foreground' }
  if (expiresAt) {
    const t = new Date(expiresAt).getTime()
    if (t < Date.now()) return { dot: 'bg-red-500', label: 'Token expired — reconnect', cls: 'text-red-600' }
    if (t < Date.now() + 7 * DAY) return { dot: 'bg-amber-500', label: 'Token expiring soon', cls: 'text-amber-600' }
  }
  return { dot: 'bg-emerald-500', label: 'Connected', cls: 'text-emerald-600' }
}

export default async function ConnectedAccountsPage() {
  const user = await requireUser()
  const { active } = await getActiveMembership(user.id)
  if (!active) redirect('/workspace/new')
  const canManage = roleCan(active.role, 'manage_workspace')

  const admin = createAdminClient()
  const { data: accounts } = await admin
    .from('channel_accounts')
    .select('id, channel, handle, display_name, is_active, token_expires_at, connected_at')
    .eq('workspace_id', active.workspaceId)
    .order('connected_at', { ascending: false })

  const connected = accounts ?? []
  const connectedKeys = new Set(connected.map((a) => a.channel))

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Connected Accounts"
        subtitle="Manage your social connections and monitor their health."
        action={canManage ? <Link href="/settings/channels" className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:brightness-110"><Plus className="h-4 w-4" />Connect account</Link> : undefined}
      />

      {connected.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center">
            <p className="text-sm text-muted-foreground">No accounts connected yet.</p>
            {canManage && <Link href="/settings/channels" className="mt-2 inline-block text-sm font-medium text-primary hover:underline">Connect your first account →</Link>}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {connected.map((a) => {
            const p = platformByKey(a.channel)
            const h = health(a.is_active, a.token_expires_at)
            const caps = (p?.capabilities ?? []).filter((c) => c.status === 'now').length
            return (
              <Card key={a.id}>
                <CardContent className="flex flex-wrap items-center justify-between gap-4 py-4">
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-lg text-sm font-bold text-white" style={{ background: p?.accent ?? '#666' }}>
                      {(p?.name ?? a.channel).slice(0, 1)}
                    </span>
                    <div>
                      <p className="text-sm font-semibold">{a.display_name || p?.name || a.channel}{a.handle && <span className="ml-1 font-normal text-muted-foreground">@{a.handle}</span>}</p>
                      <p className="flex items-center gap-1.5 text-xs">
                        <span className={`inline-block h-2 w-2 rounded-full ${h.dot}`} />
                        <span className={h.cls}>{h.label}</span>
                        <span className="text-muted-foreground">· {caps} active capabilities</span>
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span>connected {a.connected_at ? new Date(a.connected_at).toLocaleDateString() : '—'}</span>
                    {canManage && (
                      <>
                        <Link href="/settings/channels" className="inline-flex items-center gap-1 text-primary hover:underline"><RefreshCw className="h-3.5 w-3.5" />Reconnect</Link>
                        <form action={disconnectChannelAction}>
                          <input type="hidden" name="id" value={a.id} />
                          <button className="inline-flex items-center gap-1 text-red-600 hover:underline"><Unplug className="h-3.5 w-3.5" />Disconnect</button>
                        </form>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Available to connect */}
      <p className="mb-2 mt-8 text-sm font-semibold text-muted-foreground">Available platforms</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {PLATFORMS.map((p) => {
          const isConnected = connectedKeys.has(p.key)
          const liveNow = p.capabilities.some((c) => c.status === 'now') && (p.key === 'instagram' || p.key === 'telegram')
          return (
            <Card key={p.key}>
              <CardContent className="flex items-center justify-between py-4">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg text-xs font-bold text-white" style={{ background: p.accent }}>{p.name.slice(0, 1)}</span>
                  <div>
                    <p className="text-sm font-medium">{p.name}</p>
                    <p className="text-xs text-muted-foreground">{p.tagline}</p>
                  </div>
                </div>
                {isConnected ? (
                  <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-medium text-emerald-600">Connected</span>
                ) : liveNow ? (
                  canManage ? <Link href="/settings/channels" className="text-sm font-medium text-primary hover:underline">Connect</Link> : null
                ) : (
                  <span className="rounded-full bg-sky-500/15 px-2 py-0.5 text-[11px] font-medium text-sky-600">Coming soon</span>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
