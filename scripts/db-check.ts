import { config } from 'dotenv'
import { Client } from 'pg'

config({ path: '.env.local' })

async function main() {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) throw new Error('DATABASE_URL missing in .env.local')

  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
  })

  const started = Date.now()
  await client.connect()
  const res = await client.query('select version(), current_database(), now()')
  console.log('✅ Connected in', Date.now() - started, 'ms')
  console.log('   version :', res.rows[0].version.split(' ').slice(0, 2).join(' '))
  console.log('   database:', res.rows[0].current_database)
  console.log('   time    :', res.rows[0].now)
  await client.end()
}

main().catch((err) => {
  console.error('❌ Connection failed:', err.message)
  process.exit(1)
})
