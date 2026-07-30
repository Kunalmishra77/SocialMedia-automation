import { redirect } from 'next/navigation'
import { requireUser, getActiveMembership, roleCan } from '@/lib/authz'
import { createAdminClient } from '@/lib/supabase/admin'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { SettingsForm } from './settings-form'

export default async function SettingsPage() {
  const user = await requireUser()
  const { active } = await getActiveMembership(user.id)
  if (!active) redirect('/workspace/new')
  if (!roleCan(active.role, 'manage_workspace')) redirect('/')

  const admin = createAdminClient()
  const { data: ws } = await admin
    .from('workspaces')
    .select('name, industry, brand_color, plan')
    .eq('id', active.workspaceId)
    .single()

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">Manage your workspace profile.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Workspace</CardTitle>
          <CardDescription>
            Plan: <span className="font-medium capitalize">{ws?.plan}</span>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SettingsForm
            workspaceId={active.workspaceId}
            name={ws?.name ?? ''}
            industry={ws?.industry ?? ''}
            brandColor={ws?.brand_color ?? '#e1306c'}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Brand profile</CardTitle>
          <CardDescription>Teach the AI your voice, audience & products for on-brand content.</CardDescription>
        </CardHeader>
        <CardContent>
          <a href="/settings/brand" className="text-sm font-medium text-primary hover:underline">
            Edit brand profile →
          </a>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Channels</CardTitle>
          <CardDescription>Connect Instagram, Telegram and more.</CardDescription>
        </CardHeader>
        <CardContent>
          <a href="/settings/channels" className="text-sm font-medium text-primary hover:underline">
            Manage channels →
          </a>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Website chat widget</CardTitle>
          <CardDescription>Embed an AI chat widget on your website.</CardDescription>
        </CardHeader>
        <CardContent>
          <pre className="overflow-x-auto rounded-md bg-muted/50 p-3 text-xs">
{`<iframe src="${(process.env.NEXT_PUBLIC_APP_URL ?? '')}/widget/${active.workspaceId}"
  style="position:fixed;bottom:20px;right:20px;width:380px;height:560px;
  border:0;border-radius:16px;box-shadow:0 12px 32px rgba(0,0,0,.18);z-index:9999">
</iframe>`}
          </pre>
          <p className="mt-2 text-xs text-muted-foreground">Paste before &lt;/body&gt;. Uses your AI + knowledge base.</p>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Billing</CardTitle>
            <CardDescription>Plan, usage & subscription.</CardDescription>
          </CardHeader>
          <CardContent>
            <a href="/settings/billing" className="text-sm font-medium text-primary hover:underline">Manage billing →</a>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Developer</CardTitle>
            <CardDescription>API keys for programmatic access.</CardDescription>
          </CardHeader>
          <CardContent>
            <a href="/settings/api-keys" className="text-sm font-medium text-primary hover:underline">Manage API keys →</a>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
