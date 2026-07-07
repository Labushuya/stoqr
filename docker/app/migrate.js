// Standalone migration runner — called by entrypoint.sh before app start.
// Placed under /app/packages/db/ in the runtime image so that Node.js
// can resolve drizzle-orm and postgres from /app/packages/db/node_modules
// via standard upward node_modules traversal.

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

// Migrations folder is at /app/drizzle (copied from packages/db/drizzle)
const migrationsFolder = join(__dirname, '../../drizzle')

const client = postgres(url, { max: 1 })
const db = drizzle(client)

try {
  await migrate(db, { migrationsFolder })
  console.log('[migrate] Migrations applied successfully')
} catch (err) {
  console.error('[migrate] Migration failed:', err)
  process.exit(1)
} finally {
  await client.end()
}
