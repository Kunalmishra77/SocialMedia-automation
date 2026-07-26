import 'server-only'

import { createHash, randomBytes } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'

export function generateApiKey(): { key: string; prefix: string; hash: string } {
  const raw = 'sf_live_' + randomBytes(24).toString('hex')
  return { key: raw, prefix: raw.slice(0, 12), hash: hashKey(raw) }
}
export function hashKey(key: string): string {
  return createHash('sha256').update(key).digest('hex')
}

/** Verify an API key from a request; returns the workspace id or null. */
export async function verifyApiKey(req: Request): Promise<string | null> {
  const auth = req.headers.get('authorization') || ''
  const key = auth.startsWith('Bearer ') ? auth.slice(7).trim() : req.headers.get('x-api-key')?.trim()
  if (!key) return null
  const admin = createAdminClient()
  const { data } = await admin
    .from('workspace_api_keys')
    .select('workspace_id, revoked_at')
    .eq('key_hash', hashKey(key))
    .maybeSingle()
  if (!data || data.revoked_at) return null
  await admin.from('workspace_api_keys').update({ last_used_at: new Date().toISOString() }).eq('key_hash', hashKey(key))
  return data.workspace_id
}
