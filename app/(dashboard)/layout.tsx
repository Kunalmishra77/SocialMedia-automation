import { redirect } from 'next/navigation'
import { requireUser, getMemberships, type WorkspaceMembership } from '@/lib/authz'
import { getImpersonation } from '@/lib/impersonation'
import { Sidebar } from '@/components/dashboard/sidebar'
import { Topbar } from '@/components/dashboard/topbar'
import { ImpersonationBanner } from '@/components/dashboard/impersonation-banner'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser()

  // Impersonation takes precedence over the user's own memberships.
  const impersonation = await getImpersonation(user.id)

  let active: WorkspaceMembership
  if (impersonation) {
    active = {
      workspaceId: impersonation.workspaceId,
      name: impersonation.workspaceName,
      slug: '',
      plan: impersonation.plan,
      // Full-access impersonation acts as super_admin; read-only maps to a viewer (agent-like).
      role: impersonation.mode === 'full' ? 'super_admin' : 'agent',
    }
  } else {
    const memberships = await getMemberships(user.id)
    if (memberships.length === 0) redirect('/workspace/new')
    active = memberships[0]
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      {impersonation && (
        <ImpersonationBanner workspaceName={impersonation.workspaceName} mode={impersonation.mode} />
      )}
      <div className="flex flex-1 overflow-hidden">
        <Sidebar workspaceName={active.name} plan={active.plan} role={active.role} />
        <div className="flex flex-1 flex-col overflow-hidden">
          <Topbar email={user.email ?? ''} />
          <main className="flex-1 overflow-y-auto bg-muted/30 p-6">{children}</main>
        </div>
      </div>
    </div>
  )
}
