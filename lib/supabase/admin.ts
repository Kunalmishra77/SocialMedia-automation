import 'server-only'

import { createClient } from '@supabase/supabase-js'
import { env } from '@/lib/env'
import { serverEnv } from '@/lib/env'

/**
 * Admin Supabase client (service-role key). BYPASSES RLS — server-only.
 * Use for webhooks, cron jobs, and privileged server actions. Never import
 * this into client code.
 */
export function createAdminClient() {
  const { serviceRoleKey } = serverEnv()
  return createClient(env.supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
