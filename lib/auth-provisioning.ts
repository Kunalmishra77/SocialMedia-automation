import 'server-only'

import { randomBytes } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'

function baseUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
}

/** An unguessable password the client never learns — they set their own via the link. */
function throwawayPassword(): string {
  return randomBytes(24).toString('base64url') + 'Aa1!'
}

export interface ProvisionResult {
  userId: string
  /** One-time secure "set your password" link to email / share. Null if link generation failed. */
  setPasswordUrl: string | null
}

/**
 * Create (or reuse) the owner auth user WITHOUT disclosing a password, and mint a
 * one-time recovery ("set password") link. No plaintext password is ever emailed
 * or stored. redirectTo lands on /set-password.
 *
 * NOTE: the redirect URL `${APP_URL}/set-password` must be whitelisted in
 * Supabase → Auth → URL Configuration → Redirect URLs.
 */
export async function provisionOwnerWithSetPasswordLink(
  admin: SupabaseClient,
  email: string,
): Promise<ProvisionResult | null> {
  let userId: string
  const { data: existing } = await admin.from('profiles').select('id').eq('email', email).maybeSingle()
  if (existing) {
    userId = existing.id
  } else {
    const { data: created, error } = await admin.auth.admin.createUser({
      email,
      password: throwawayPassword(),
      email_confirm: true,
    })
    if (error || !created.user) return null
    userId = created.user.id
  }

  const { data: link } = await admin.auth.admin.generateLink({
    type: 'recovery',
    email,
    options: { redirectTo: `${baseUrl()}/set-password` },
  })

  return { userId, setPasswordUrl: link?.properties?.action_link ?? null }
}
