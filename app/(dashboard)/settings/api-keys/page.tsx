import { redirect } from 'next/navigation'
import { requireUser, getActiveMembership, roleCan } from '@/lib/authz'
import { createAdminClient } from '@/lib/supabase/admin'
import { revokeApiKeyAction } from '@/lib/actions/api-keys'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { CreateKey } from './create-key'

export default async function ApiKeysPage() {
  const user = await requireUser()
  const { active } = await getActiveMembership(user.id)
  if (!active) redirect('/workspace/new')
  if (!roleCan(active.role, 'manage_workspace')) redirect('/')

  const admin = createAdminClient()
  const { data: keys } = await admin
    .from('workspace_api_keys')
    .select('id, name, key_prefix, last_used_at, revoked_at, created_at')
    .eq('workspace_id', active.workspaceId)
    .order('created_at', { ascending: false })

  const base = process.env.NEXT_PUBLIC_APP_URL ?? ''

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">API keys</h1>
        <p className="text-sm text-muted-foreground">Programmatic access to your workspace data.</p>
      </div>

      <Card>
        <CardHeader><CardTitle>Create a key</CardTitle></CardHeader>
        <CardContent><CreateKey /></CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Your keys</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {(!keys || keys.length === 0) && <p className="text-sm text-muted-foreground">No keys yet.</p>}
          {keys?.map((k) => (
            <div key={k.id} className="flex items-center justify-between border-b border-border pb-2 last:border-0">
              <div>
                <p className="text-sm font-medium">{k.name} {k.revoked_at && <span className="text-xs text-destructive">(revoked)</span>}</p>
                <p className="text-xs text-muted-foreground">{k.key_prefix}••••••• · {k.last_used_at ? `used ${new Date(k.last_used_at).toLocaleDateString()}` : 'never used'}</p>
              </div>
              {!k.revoked_at && (
                <form action={revokeApiKeyAction}>
                  <input type="hidden" name="id" value={k.id} />
                  <button className="rounded-md px-2 py-1 text-xs text-destructive hover:bg-destructive/10">Revoke</button>
                </form>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Usage</CardTitle>
          <CardDescription>Authenticate with a Bearer token.</CardDescription>
        </CardHeader>
        <CardContent>
          <pre className="overflow-x-auto rounded-md bg-muted/50 p-3 text-xs">
{`curl ${base}/api/v1/contacts \\
  -H "Authorization: Bearer sf_live_..."`}
          </pre>
          <p className="mt-2 text-xs text-muted-foreground">Endpoints: /api/v1/contacts, /api/v1/conversations</p>
        </CardContent>
      </Card>
    </div>
  )
}
