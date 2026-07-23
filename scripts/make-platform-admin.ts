/**
 * Grant platform-admin access to a user by email.
 * Usage: npx tsx scripts/make-platform-admin.ts <email> [role]
 *   role: platform_owner (default) | platform_admin | platform_support | platform_billing
 */
import { config } from 'dotenv'
import { Client } from 'pg'

config({ path: '.env.local' })

async function main() {
  const email = process.argv[2]
  const role = process.argv[3] ?? 'platform_owner'
  if (!email) {
    console.error('Usage: npx tsx scripts/make-platform-admin.ts <email> [role]')
    process.exit(1)
  }

  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
  await c.connect()

  const prof = await c.query('select id, email from profiles where email = $1', [email.toLowerCase()])
  if (prof.rows.length === 0) {
    console.error(`❌ No user found with email ${email}. Sign up first.`)
    await c.end()
    process.exit(1)
  }
  const { id, email: foundEmail } = prof.rows[0]

  await c.query(
    `INSERT INTO platform_admins (user_id, email, role, is_active, totp_enabled)
     VALUES ($1, $2, $3, true, false)
     ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role, is_active = true`,
    [id, foundEmail, role],
  )
  // Mirror the lightweight flag on the profile too.
  await c.query('update profiles set is_platform_admin = true where id = $1', [id])

  console.log(`✅ ${foundEmail} is now a ${role}. Visit /platform-admin`)
  await c.end()
}

main().catch((e) => { console.error(e); process.exit(1) })
