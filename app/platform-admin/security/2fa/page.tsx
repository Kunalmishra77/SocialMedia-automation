import Link from 'next/link'
import { ShieldCheck, Smartphone } from 'lucide-react'
import { requirePlatformAdmin } from '@/lib/platform-admin/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { generateTotpSecret, otpauthUrl } from '@/lib/totp'
import { PageHeader, Panel } from '../../ui'
import { EnrollForm, DisableForm } from './forms'

export default async function TwoFactorPage() {
  const ctx = await requirePlatformAdmin()
  const admin = createAdminClient()
  const { data } = await admin.from('platform_admins').select('totp_enabled').eq('user_id', ctx.userId).maybeSingle()
  const enabled = !!data?.totp_enabled

  // Fresh ephemeral secret for enrollment (persisted only after a valid code confirms it).
  const secret = enabled ? '' : generateTotpSecret()
  const uri = enabled ? '' : otpauthUrl(secret, ctx.email)

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Link href="/platform-admin/security" className="text-sm text-indigo-400 hover:underline">← Security</Link>
      </div>
      <PageHeader title="Two-factor authentication" subtitle="Protect your operator account with a time-based code (TOTP)." />

      {enabled ? (
        <Panel>
          <div className="mb-4 flex items-center gap-2 text-emerald-400">
            <ShieldCheck className="h-5 w-5" />
            <span className="text-sm font-medium">2FA is enabled on your account.</span>
          </div>
          <p className="mb-4 text-sm text-zinc-400">You&apos;ll be asked for a code from your authenticator each time you sign in to the console.</p>
          <DisableForm />
        </Panel>
      ) : (
        <Panel>
          <div className="mb-4 flex items-center gap-2 text-zinc-300">
            <Smartphone className="h-5 w-5 text-zinc-500" />
            <span className="text-sm font-medium">Set up with Google Authenticator, Authy, 1Password, etc.</span>
          </div>

          <ol className="mb-4 space-y-3 text-sm text-zinc-400">
            <li>
              <span className="font-medium text-zinc-200">1. Add this key to your authenticator app</span>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <code className="rounded-md bg-zinc-950 px-3 py-2 font-mono text-sm tracking-wider text-emerald-400">{secret}</code>
              </div>
              <p className="mt-1 break-all text-xs text-zinc-600">Or open this link on the phone: <span className="text-zinc-500">{uri}</span></p>
            </li>
            <li><span className="font-medium text-zinc-200">2. Enter the current 6-digit code to confirm</span></li>
          </ol>

          <EnrollForm secret={secret} />

          <p className="mt-4 text-xs text-zinc-600">Keep this tab open until you&apos;ve confirmed — refreshing generates a new key. If you ever lose your device, an owner can reset 2FA from the database.</p>
        </Panel>
      )}
    </div>
  )
}
