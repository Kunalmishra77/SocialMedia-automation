import 'server-only'
import { createHmac } from 'node:crypto'

/** Parse & verify a Meta signed_request (base64url sig "." base64url payload). */
export function parseSignedRequest(signed: string | null, appSecret: string | undefined): { user_id?: string } | null {
  if (!signed || !appSecret || !signed.includes('.')) return null
  const [sig, payload] = signed.split('.')
  try {
    const expected = createHmac('sha256', appSecret).update(payload).digest('base64url')
    if (sig !== expected) return null
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
  } catch {
    return null
  }
}
