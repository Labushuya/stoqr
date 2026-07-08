// Standalone migration runner — lives at /app/migrate.js in the runtime image.
// drizzle-orm and postgres are available in /app/node_modules.

import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const migrationsFolder = join(__dirname, 'drizzle')

const url = process.env.DATABASE_URL
if (!url) {
  console.error('[migrate] DATABASE_URL not set')
  process.exit(1)
}

const client = postgres(url, { max: 1 })
const db = drizzle(client)

try {
  console.log('[migrate] Running migrations from:', migrationsFolder)
  await migrate(db, { migrationsFolder })
  console.log('[migrate] Migrations applied successfully')

  // Safety net: ensure username/display_name/password_hash are nullable.
  // This is idempotent — DROP NOT NULL on an already-nullable column is a no-op in Postgres.
  // Guards against cases where migration tracking state diverges from schema state.
  console.log('[migrate] Applying safety-net nullable constraints...')
  await client.unsafe(`
    ALTER TABLE users ALTER COLUMN username DROP NOT NULL;
    ALTER TABLE users ALTER COLUMN display_name DROP NOT NULL;
    ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
  `)
  console.log('[migrate] Safety-net constraints applied')
} catch (err) {
  console.error('[migrate] Migration failed:', err)
  process.exit(1)
} finally {
  await client.end()
}
