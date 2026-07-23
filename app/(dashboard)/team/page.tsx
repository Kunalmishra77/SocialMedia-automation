import { redirect } from 'next/navigation'
import { requireUser, getActiveMembership, roleCan } from '@/lib/authz'
import { createAdminClient } from '@/lib/supabase/admin'
import { updateMemberRoleAction, removeMemberAction } from '@/lib/actions/workspace'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { InviteForm } from './invite-form'

export default async function TeamPage() {
  const user = await requireUser()
  const { active } = await getActiveMembership(user.id)
  if (!active) redirect('/workspace/new')
  if (!roleCan(active.role, 'manage_team')) redirect('/')

  const admin = createAdminClient()
  const { data: members } = await admin
    .from('workspace_members')
    .select('id, role, user_id, profiles(email, full_name)')
    .eq('workspace_id', active.workspaceId)
    .order('created_at')

  const { data: invites } = await admin
    .from('team_invites')
    .select('id, email, role, status, expires_at')
    .eq('workspace_id', active.workspaceId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Team</h1>
        <p className="text-sm text-muted-foreground">Invite teammates and manage roles.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Invite a teammate</CardTitle>
          <CardDescription>They&apos;ll join this workspace with the role you choose.</CardDescription>
        </CardHeader>
        <CardContent>
          <InviteForm workspaceId={active.workspaceId} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Members</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {(members ?? []).map((m) => {
            const profile = m.profiles as unknown as { email: string; full_name: string | null } | null
            const isSelf = m.user_id === user.id
            const isOwner = m.role === 'super_admin'
            return (
              <div key={m.id} className="flex items-center justify-between gap-3 border-b border-border pb-3 last:border-0">
                <div>
                  <p className="text-sm font-medium">{profile?.full_name || profile?.email}</p>
                  <p className="text-xs text-muted-foreground">{profile?.email}</p>
                </div>
                <div className="flex items-center gap-2">
                  {isOwner || isSelf ? (
                    <span className="text-sm capitalize text-muted-foreground">{m.role.replace('_', ' ')}</span>
                  ) : (
                    <>
                      <form action={updateMemberRoleAction}>
                        <input type="hidden" name="workspaceId" value={active.workspaceId} />
                        <input type="hidden" name="memberId" value={m.id} />
                        <select
                          name="role"
                          defaultValue={m.role}
                          onChange={(e) => e.currentTarget.form?.requestSubmit()}
                          className="h-8 rounded-md border border-input bg-background px-2 text-sm capitalize"
                        >
                          <option value="agent">Agent</option>
                          <option value="manager">Manager</option>
                          <option value="admin">Admin</option>
                        </select>
                      </form>
                      <form action={removeMemberAction}>
                        <input type="hidden" name="workspaceId" value={active.workspaceId} />
                        <input type="hidden" name="memberId" value={m.id} />
                        <button className="rounded-md px-2 py-1 text-xs text-destructive hover:bg-destructive/10">
                          Remove
                        </button>
                      </form>
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </CardContent>
      </Card>

      {invites && invites.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Pending invites</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {invites.map((inv) => (
              <div key={inv.id} className="flex items-center justify-between text-sm">
                <span>{inv.email}</span>
                <span className="capitalize text-muted-foreground">{inv.role} · pending</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
