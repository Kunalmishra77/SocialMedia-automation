import 'server-only'

import { createHmac, timingSafeEqual } from 'node:crypto'
import { cookies } from 'next/headers'

const COOKIE = 'pa_2fa'
const TTL_MS = 12 * 60 * 60 * 1000 // 12 hours

function signingKey(): string {
  return process.env.ENCRYPTION_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || 'dev-2fa-key'
}

function sign(payload: string): string {
  return createHmac('sha256', signingKey()).update(payload).digest('base64url')
}

/** Mark this browser session as 2FA-verified for the given admin (12h). */
export async function setTwoFactorVerified(userId: string): Promise<void> {
  const exp = Date.now() + TTL_MS
  const payload = `${userId}.${exp}`
  const token = `${payload}.${sign(payload)}`
  const jar = await cookies()
  jar.set(COOKIE, token, { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: TTL_MS / 1000 })
}

/** True if a valid, unexpired 2FA cookie exists for this admin. */
export async function isTwoFactorVerified(userId: string): Promise<boolean> {
  const jar = await cookies()
  const token = jar.get(COOKIE)?.value
  if (!token) return false
  const parts = token.split('.')
  if (parts.length !== 3) return false
  const [uid, expStr, sig] = parts
  if (uid !== userId) return false
  const exp = Number(expStr)
  if (!Number.isFinite(exp) || Date.now() > exp) return false
  const expected = sign(`${uid}.${expStr}`)
  try {
    return timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
  } catch {
    return false
  }
}

export async function clearTwoFactor(): Promise<void> {
  const jar = await cookies()
  jar.delete(COOKIE)
}
