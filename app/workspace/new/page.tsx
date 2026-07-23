import { redirect } from 'next/navigation'
import { requireUser, getMemberships } from '@/lib/authz'
import { logoutAction } from '@/lib/actions/auth'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { CreateWorkspaceForm } from './create-workspace-form'

export default async function NewWorkspacePage() {
  const user = await requireUser()
  const memberships = await getMemberships(user.id)
  // Already has a workspace → straight to the dashboard.
  if (memberships.length > 0) redirect('/')

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <span className="brand-gradient-text mb-2 text-lg font-bold">◐ Socialflow</span>
          <CardTitle>Create your workspace</CardTitle>
          <CardDescription>
            A workspace holds your connected accounts, team, and all your data.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <CreateWorkspaceForm />
          <form action={logoutAction}>
            <button type="submit" className="text-sm text-muted-foreground hover:underline">
              Sign out ({user.email})
            </button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
