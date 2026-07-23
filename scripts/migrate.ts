/**
 * Migration runner.
 * Usage: npx tsx scripts/migrate.ts
 *
 * Reads supabase/migrations/*.sql in filename order, runs any not yet applied,
 * and records them in a _migrations table. Each file runs in its own transaction.
 */
import { config } from 'dotenv'
import { Client } from 'pg'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

config({ path: '.env.local' })

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations')

async function main() {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) throw new Error('DATABASE_URL missing in .env.local')

  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } })
  await client.connect()

  await client.query(`
    CREATE TABLE IF NOT EXISTS public._migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)

  const applied = new Set(
    (await client.query('SELECT name FROM public._migrations')).rows.map((r) => r.name),
  )

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort()

  let ran = 0
  for (const file of files) {
    if (applied.has(file)) {
      console.log(`⏭  skip   ${file}`)
      continue
    }
    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8')
    process.stdout.write(`▶  apply  ${file} ... `)
    try {
      await client.query('BEGIN')
      await client.query(sql)
      await client.query('INSERT INTO public._migrations (name) VALUES ($1)', [file])
      await client.query('COMMIT')
      console.log('✅')
      ran++
    } catch (err) {
      await client.query('ROLLBACK')
      console.log('❌')
      console.error(err)
      await client.end()
      process.exit(1)
    }
  }

  await client.end()
  console.log(`\nDone. ${ran} migration(s) applied, ${files.length - ran} already up to date.`)
}

main().catch((err) => {
  console.error('❌ Migration runner failed:', err.message)
  process.exit(1)
})
