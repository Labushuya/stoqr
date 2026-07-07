// Standalone migration runner — lives at /app/migrate.js in the runtime image.
// drizzle-orm and postgres are available in /app/node_modules (merged in Dockerfile).

import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
// __dirname = /app  →  migrationsFolder = /app/drizzle
const migrationsFolder = join(__dirname, 'drizzle')

const url = process.env.DATABASE_URL
if (!url) {
  console.error('[migrate] DATABASE_URL not set')
  process.exit(1)
}

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
