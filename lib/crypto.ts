import 'server-only'

import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'node:crypto'

/**
 * AES-256-GCM encryption for client credentials at rest.
 * Key derives from ENCRYPTION_KEY (preferred) or the service-role key as a
 * fallback so it always works; set ENCRYPTION_KEY in production.
 */
function key(): Buffer {
  const secret = process.env.ENCRYPTION_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || 'dev-fallback-key'
  return createHash('sha256').update(secret).digest()
}

export function encrypt(plain: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key(), iv)
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  // iv.tag.ciphertext — all base64
  return `${iv.toString('base64')}.${tag.toString('base64')}.${enc.toString('base64')}`
}

export function decrypt(payload: string): string | null {
  try {
    const [ivB64, tagB64, dataB64] = payload.split('.')
    const iv = Buffer.from(ivB64, 'base64')
    const tag = Buffer.from(tagB64, 'base64')
    const data = Buffer.from(dataB64, 'base64')
    const decipher = createDecipheriv('aes-256-gcm', key(), iv)
    decipher.setAuthTag(tag)
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8')
  } catch {
    return null
  }
}

// ─────────────────────────────────────────────────────────────
// Token-at-rest helpers (backward compatible).
// Newly stored tokens get an "enc:v1:" marker + AES-GCM ciphertext. Existing
// PLAINTEXT tokens (no marker) are returned as-is, so nothing breaks — they
// migrate to encrypted the next time they're written (e.g. token refresh).
// ─────────────────────────────────────────────────────────────

const TOKEN_MARKER = 'enc:v1:'

/** Encrypt a token/secret for storage. Empty/undefined passes through. */
export function encryptToken(plain: string | null | undefined): string | null {
  if (!plain) return plain ?? null
  if (plain.startsWith(TOKEN_MARKER)) return plain // already encrypted
  return TOKEN_MARKER + encrypt(plain)
}

/** Decrypt a stored token/secret. Legacy plaintext (no marker) is returned as-is. */
export function decryptToken(stored: string | null | undefined): string {
  if (!stored) return ''
  if (stored.startsWith(TOKEN_MARKER)) return decrypt(stored.slice(TOKEN_MARKER.length)) ?? ''
  return stored
}
