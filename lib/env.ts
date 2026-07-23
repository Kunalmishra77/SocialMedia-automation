/**
 * Central env access. Server-only secrets are read lazily so importing this
 * module in a client component never leaks them.
 */

function required(name: string, value: string | undefined): string {
  if (!value) throw new Error(`Missing required env var: ${name}`)
  return value
}

// Public — safe in the browser (NEXT_PUBLIC_*).
export const env = {
  supabaseUrl: required('NEXT_PUBLIC_SUPABASE_URL', process.env.NEXT_PUBLIC_SUPABASE_URL),
  supabaseAnonKey: required('NEXT_PUBLIC_SUPABASE_ANON_KEY', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
  appUrl: process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
}

// Server-only. Call from server code only; throws if used without the secret set.
export function serverEnv() {
  return {
    serviceRoleKey: required('SUPABASE_SERVICE_ROLE_KEY', process.env.SUPABASE_SERVICE_ROLE_KEY),
    cronSecret: process.env.CRON_SECRET ?? '',
    databaseUrl: process.env.DATABASE_URL ?? '',
  }
}
