// Standalone migration runner — executed by entrypoint.sh before app start
// Uses drizzle-orm/postgres-js/migrator directly against DATABASE_URL

import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))

const url = process.env.DATABASE_URL
if (!url) {
  console.error('[migrate] DATABASE_URL not set')
  process.exit(1)
}

const client = postgres(url, { max: 1 })
const db = drizzle(client)

try {
  await migrate(db, { migrationsFolder: join(__dirname, 'drizzle') })
  console.log('[migrate] Migrations applied successfully')
} catch (err) {
  console.error('[migrate] Migration failed:', err)
  process.exit(1)
} finally {
  await client.end()
}
