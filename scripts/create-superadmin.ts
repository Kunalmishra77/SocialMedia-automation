/**
 * One-off: create (or reuse) a user and grant platform_owner.
 * Usage: npx tsx scripts/create-superadmin.ts <email> <password>
 */
import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'

config({ path: '.env.local' })

async function main() {
  const email = process.argv[2]?.toLowerCase()
  const password = process.argv[3]
  if (!email || !password) {
    console.error('Usage: npx tsx scripts/create-superadmin.ts <email> <password>')
    process.exit(1)
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })

  // Create the auth user (confirmed), or reuse if already registered.
  let userId: string
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })

  if (created?.user) {
    userId = created.user.id
    console.log('✅ Auth user created:', email)
  } else if (createErr && /already|registered|exists/i.test(createErr.message)) {
    const { data: prof } = await admin.from('profiles').select('id').eq('email', email).maybeSingle()
    if (!prof) {
      console.error('User exists in auth but no profile row found — try logging in once.')
      process.exit(1)
    }
    userId = prof.id
    console.log('ℹ️  User already existed — reusing.')
    // Update password to the one provided.
    await admin.auth.admin.updateUserById(userId, { password })
  } else {
    console.error('❌ createUser failed:', createErr?.message)
    process.exit(1)
  }

  // Grant platform_owner.
  await admin
    .from('platform_admins')
    .upsert(
      { user_id: userId, email, role: 'platform_owner', is_active: true, totp_enabled: false },
      { onConflict: 'user_id' },
    )
  await admin.from('profiles').update({ is_platform_admin: true }).eq('id', userId)

  console.log(`✅ ${email} is now a platform_owner.`)
  console.log('   Login:  https://social-media.aiagentixdev.com/login')
  console.log('   Admin:  https://social-media.aiagentixdev.com/platform-admin')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
