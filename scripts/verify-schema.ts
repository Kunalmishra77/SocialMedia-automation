import { config } from 'dotenv'
import { Client } from 'pg'

config({ path: '.env.local' })

async function main() {
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
  await c.connect()
  const t = await c.query(
    `select table_name from information_schema.tables where table_schema='public' order by table_name`,
  )
  console.log('Tables   :', t.rows.map((r) => r.table_name).join(', '))
  const e = await c.query(
    `select typname from pg_type where typtype='e' and typnamespace='public'::regnamespace order by typname`,
  )
  console.log('Enums    :', e.rows.map((r) => r.typname).join(', '))
  const f = await c.query(
    `select proname from pg_proc where pronamespace='public'::regnamespace order by proname`,
  )
  console.log('Functions:', f.rows.map((r) => r.proname).join(', '))
  await c.end()
}

main().catch((e) => { console.error(e); process.exit(1) })
