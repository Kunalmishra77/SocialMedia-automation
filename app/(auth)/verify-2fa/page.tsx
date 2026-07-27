import { redirect } from 'next/navigation'
import { resolvePlatformAdmin } from '@/lib/platform-admin/auth'
import { isTwoFactorVerified } from '@/lib/platform-admin/2fa'
import { VerifyForm } from './verify-form'

export default async function VerifyTwoFactorPage() {
  // resolvePlatformAdmin (not the gated require) — this page IS the gate.
  const ctx = await resolvePlatformAdmin()
  if (!ctx.totpEnabled) redirect('/platform-admin')
  if (await isTwoFactorVerified(ctx.userId)) redirect('/platform-admin')

  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <h1 className="text-2xl font-bold tracking-tight">Two-factor verification</h1>
        <p className="text-sm text-muted-foreground">Enter the 6-digit code from your authenticator app to access the Platform Console.</p>
      </div>
      <VerifyForm />
    </div>
  )
}
