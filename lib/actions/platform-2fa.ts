'use server'

import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolvePlatformAdmin, writeAudit } from '@/lib/platform-admin/auth'
import { setTwoFactorVerified, clearTwoFactor } from '@/lib/platform-admin/2fa'
import { verifyTotp } from '@/lib/totp'
import { encrypt, decrypt } from '@/lib/crypto'

export interface TwoFactorState { error?: string }

/** Confirm enrollment: the code proves the authenticator has the secret. */
export async function confirmEnrollAction(_prev: TwoFactorState, formData: FormData): Promise<TwoFactorState> {
  const ctx = await resolvePlatformAdmin()
  const secret = String(formData.get('secret') ?? '')
  const code = String(formData.get('code') ?? '')
  if (!secret) return { error: 'Enrollment expired — reload and try again.' }
  if (!verifyTotp(secret, code, Date.now())) return { error: 'Incorrect code. Check your authenticator and try again.' }

  const admin = createAdminClient()
  await admin.from('platform_admins').update({ totp_secret: encrypt(secret), totp_enabled: true }).eq('user_id', ctx.userId)
  await setTwoFactorVerified(ctx.userId)
  await writeAudit(ctx, 'admin.2fa_enabled', { type: 'platform_admin', id: ctx.userId, label: ctx.email })
  redirect('/platform-admin/security/2fa')
}

/** Verify the second factor at login (the /verify-2fa gate). */
export async function verifyLoginAction(_prev: TwoFactorState, formData: FormData): Promise<TwoFactorState> {
  const ctx = await resolvePlatformAdmin()
  const code = String(formData.get('code') ?? '')

  const admin = createAdminClient()
  const { data } = await admin.from('platform_admins').select('totp_secret').eq('user_id', ctx.userId).maybeSingle()
  const secret = data?.totp_secret ? decrypt(data.totp_secret as string) : null
  if (!secret) redirect('/platform-admin') // 2FA not actually configured
  if (!verifyTotp(secret as string, code, Date.now())) return { error: 'Incorrect code. Try again.' }

  await setTwoFactorVerified(ctx.userId)
  redirect('/platform-admin')
}

/** Disable 2FA (requires a current code). */
export async function disable2faAction(_prev: TwoFactorState, formData: FormData): Promise<TwoFactorState> {
  const ctx = await resolvePlatformAdmin()
  const code = String(formData.get('code') ?? '')

  const admin = createAdminClient()
  const { data } = await admin.from('platform_admins').select('totp_secret').eq('user_id', ctx.userId).maybeSingle()
  const secret = data?.totp_secret ? decrypt(data.totp_secret as string) : null
  if (secret && !verifyTotp(secret, code, Date.now())) return { error: 'Incorrect code — 2FA not disabled.' }

  await admin.from('platform_admins').update({ totp_secret: null, totp_enabled: false }).eq('user_id', ctx.userId)
  await clearTwoFactor()
  await writeAudit(ctx, 'admin.2fa_disabled', { type: 'platform_admin', id: ctx.userId, label: ctx.email })
  redirect('/platform-admin/security/2fa')
}
