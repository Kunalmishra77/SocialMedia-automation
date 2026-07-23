import Link from 'next/link'
import { getInvite } from '@/lib/actions/invite'
import { getUser } from '@/lib/authz'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { AcceptForm } from './accept-form'

export default async function AcceptInvitePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>
}) {
  const { token } = await searchParams
  const invite = token ? await getInvite(token) : { ok: false as const, reason: 'No invite token provided.' }
  const user = await getUser()

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <span className="brand-gradient-text mb-2 text-lg font-bold">◐ Socialflow</span>
          {invite.ok ? (
            <>
              <CardTitle>Join {invite.workspaceName}</CardTitle>
              <CardDescription>
                You&apos;ve been invited as <span className="capitalize">{invite.role}</span> ({invite.email}).
              </CardDescription>
            </>
          ) : (
            <>
              <CardTitle>Invite unavailable</CardTitle>
              <CardDescription>{invite.reason}</CardDescription>
            </>
          )}
        </CardHeader>
        <CardContent>
          {invite.ok && token ? (
            <AcceptForm token={token} loggedIn={!!user} />
          ) : (
            <Link href="/login" className="text-sm font-medium text-primary hover:underline">
              Go to login
            </Link>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
