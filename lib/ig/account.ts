import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { decryptToken } from '@/lib/crypto'

export interface ConnectedIg {
  token: string
  externalId: string
  handle: string | null
}

/** The workspace's active Instagram connection with a usable token, or null. */
export async function getConnectedIg(admin: SupabaseClient, workspaceId: string): Promise<ConnectedIg | null> {
  const { data: acct } = await admin
    .from('channel_accounts')
    .select('external_id, handle, access_token')
    .eq('workspace_id', workspaceId)
    .eq('channel', 'instagram')
    .eq('is_active', true)
    .limit(1)
    .maybeSingle()
  const token = decryptToken(acct?.access_token)
  if (!acct?.external_id || !token) return null
  return { token, externalId: String(acct.external_id), handle: (acct.handle as string | null) ?? null }
}
