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
    </div>
  )
}
