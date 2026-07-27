import 'server-only'

import { createHmac, randomBytes } from 'node:crypto'

// Minimal RFC 6238 TOTP (SHA-1, 6 digits, 30s step) — no external dependency.

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

function base32Encode(buf: Buffer): string {
  let bits = 0, value = 0, out = ''
  for (const byte of buf) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31]
  return out
}

function base32Decode(s: string): Buffer {
  const clean = s.toUpperCase().replace(/=+$/, '').replace(/\s/g, '')
  let bits = 0, value = 0
  const out: number[] = []
  for (const ch of clean) {
    const idx = B32.indexOf(ch)
    if (idx === -1) continue
    value = (value << 5) | idx
    bits += 5
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff)
      bits -= 8
    }
  }
  return Buffer.from(out)
}

/** Generate a new base32 TOTP secret. */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20))
}

/** otpauth:// URI for authenticator apps (Google Authenticator, Authy, etc.). */
export function otpauthUrl(secret: string, account: string, issuer = 'Socialflow'): string {
  const label = encodeURIComponent(`${issuer}:${account}`)
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`
}

function hotp(secret: string, counter: number): string {
  const key = base32Decode(secret)
  const buf = Buffer.alloc(8)
  buf.writeBigInt64BE(BigInt(counter))
  const hmac = createHmac('sha1', key).update(buf).digest()
  const offset = hmac[hmac.length - 1] & 0xf
  const code = ((hmac[offset] & 0x7f) << 24) | ((hmac[offset + 1] & 0xff) << 16) | ((hmac[offset + 2] & 0xff) << 8) | (hmac[offset + 3] & 0xff)
  return (code % 1_000_000).toString().padStart(6, '0')
}

/** Verify a 6-digit code against the secret, allowing ±1 time step for clock drift. */
export function verifyTotp(secret: string, code: string, nowMs: number, window = 1): boolean {
  const clean = (code ?? '').replace(/\s/g, '')
  if (!/^\d{6}$/.test(clean)) return false
  const step = Math.floor(nowMs / 1000 / 30)
  for (let i = -window; i <= window; i++) {
    if (hotp(secret, step + i) === clean) return true
  }
  return false
}
