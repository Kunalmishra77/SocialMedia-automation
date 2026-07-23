import { redirect } from 'next/navigation'
import { requireUser, getMemberships } from '@/lib/authz'
import { Sidebar } from '@/components/dashboard/sidebar'
import { Topbar } from '@/components/dashboard/topbar'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser()
  const memberships = await getMemberships(user.id)
  if (memberships.length === 0) redirect('/workspace/new')

  // Active workspace: first membership for now (switcher comes later).
  const active = memberships[0]

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar workspaceName={active.name} plan={active.plan} role={active.role} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar email={user.email ?? ''} />
        <main className="flex-1 overflow-y-auto bg-muted/30 p-6">{children}</main>
      </div>
    </div>
  )
}
