import { redirect } from 'next/navigation'
import { requireUser, getActiveMembership, roleCan } from '@/lib/authz'
import { createAdminClient } from '@/lib/supabase/admin'
import { disconnectChannelAction } from '@/lib/actions/channels'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ConnectTelegram } from './connect-telegram'

const CATALOG = [
  { channel: 'instagram', name: 'Instagram', status: 'oauth', note: 'DM, comments, story replies' },
  { channel: 'facebook', name: 'Facebook / Messenger', status: 'oauth', note: 'DM, comments' },
  { channel: 'telegram', name: 'Telegram', status: 'ready', note: 'Full DM automation' },
  { channel: 'linkedin', name: 'LinkedIn', status: 'soon', note: 'Page posting + comments' },
  { channel: 'youtube', name: 'YouTube', status: 'soon', note: 'Comment moderation' },
]

export default async function ChannelsPage() {
  const user = await requireUser()
  const { active } = await getActiveMembership(user.id)
  if (!active) redirect('/workspace/new')
  if (!roleCan(active.role, 'manage_workspace')) redirect('/')

  const admin = createAdminClient()
  const { data: connected } = await admin
    .from('channel_accounts')
    .select('id, channel, handle, display_name, is_active, connected_at')
    .eq('workspace_id', active.workspaceId)

  const connectedByChannel = new Map((connected ?? []).map((c) => [c.channel, c]))

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Channels</h1>
        <p className="text-sm text-muted-foreground">Connect the platforms you want to automate.</p>
      </div>

      <div className="space-y-3">
        {CATALOG.map((item) => {
          const conn = connectedByChannel.get(item.channel)
          return (
            <Card key={item.channel}>
              <CardHeader className="flex-row items-start justify-between">
                <div>
                  <CardTitle className="text-base">{item.name}</CardTitle>
                  <CardDescription>{item.note}</CardDescription>
                </div>
                {conn ? (
                  <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs text-emerald-600">
                    Connected
                  </span>
                ) : item.status === 'ready' ? (
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">Available</span>
                ) : item.status === 'oauth' ? (
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                    Needs Meta app
                  </span>
                ) : (
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">Soon</span>
                )}
              </CardHeader>
              <CardContent>
                {conn ? (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">
                      {conn.display_name}{conn.handle ? ` · @${conn.handle}` : ''}
                    </span>
                    <form action={disconnectChannelAction}>
                      <input type="hidden" name="id" value={conn.id} />
                      <button className="rounded-md px-2 py-1 text-xs text-destructive hover:bg-destructive/10">
                        Disconnect
                      </button>
                    </form>
                  </div>
                ) : item.channel === 'telegram' ? (
                  <ConnectTelegram />
                ) : item.status === 'oauth' ? (
                  process.env.META_APP_ID ? (
                    <a
                      href="/api/integrations/instagram/connect"
                      className="inline-block rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90"
                    >
                      Connect with Meta
                    </a>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Set META_APP_ID / META_APP_SECRET / META_VERIFY_TOKEN on your live domain to enable
                      OAuth connect.
                    </p>
                  )
                ) : (
                  <p className="text-xs text-muted-foreground">Coming soon.</p>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
