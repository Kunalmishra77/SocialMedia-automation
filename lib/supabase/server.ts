import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { env } from '@/lib/env'

/**
 * Server Supabase client (anon key, RLS-enforced, reads the user's session
 * from cookies). Use in Server Components, Route Handlers, and Server Actions.
 */
export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(env.supabaseUrl, env.supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          )
        } catch {
          // Called from a Server Component — safe to ignore; middleware refreshes the session.
        }
      },
    },
  })
}
