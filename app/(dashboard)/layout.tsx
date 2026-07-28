import { redirect } from 'next/navigation'
import { getUser, getActiveMembership, type WorkspaceMembership } from '@/lib/authz'
import { getImpersonation } from '@/lib/impersonation'
import { createAdminClient } from '@/lib/supabase/admin'
import { Sidebar } from '@/components/dashboard/sidebar'
import { Topbar } from '@/components/dashboard/topbar'
import { ImpersonationBanner } from '@/components/dashboard/impersonation-banner'

async function unreadCount(userId: string): Promise<number> {
  const admin = createAdminClient()
  const { count } = await admin
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('is_read', false)
  return count ?? 0
}

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getUser()
  if (!user) redirect('/welcome')

  // Impersonation takes precedence over the user's own memberships.
  const impersonation = await getImpersonation(user.id)

  let active: WorkspaceMembership
  let all: WorkspaceMembership[] = []
  if (impersonation) {
    active = {
      workspaceId: impersonation.workspaceId,
      name: impersonation.workspaceName,
      slug: '',
      plan: impersonation.plan,
      role: impersonation.mode === 'full' ? 'super_admin' : 'agent',
    }
  } else {
    const resolved = await getActiveMembership(user.id)
    if (!resolved.active) redirect('/workspace/new')
    active = resolved.active
    all = resolved.all
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      {impersonation && (
        <ImpersonationBanner workspaceName={impersonation.workspaceName} mode={impersonation.mode} />
      )}
      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          workspaceName={active.name}
          plan={active.plan}
          role={active.role}
          memberships={impersonation ? [] : all}
          activeWorkspaceId={active.workspaceId}
        />
        <div className="flex flex-1 flex-col overflow-hidden">
          <Topbar email={user.email ?? ''} unread={await unreadCount(user.id)} />
          <main className="flex-1 overflow-y-auto bg-[#eaf4fe] p-6">{children}</main>
        </div>
      </div>
    </div>
  )
}
