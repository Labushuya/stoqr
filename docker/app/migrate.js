// Standalone migration runner — /app/migrate.js
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
  console.log('[migrate] Running Drizzle migrations...')
  await migrate(db, { migrationsFolder })
  console.log('[migrate] Drizzle migrations done')

  // Safety-net: DROP NOT NULL on stoqr-internal columns that Better Auth does not populate.
  // ALTER COLUMN DROP NOT NULL is idempotent in PostgreSQL — safe to run on every startup.
  // This ensures the DB is correct even if the migration tracking table has inconsistencies.
  console.log('[migrate] Applying nullable safety-net for Better Auth compatibility...')
  await client.unsafe(`
    DO $$ BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'username' AND is_nullable = 'NO'
      ) THEN
        ALTER TABLE users ALTER COLUMN username DROP NOT NULL;
        RAISE NOTICE 'Dropped NOT NULL on users.username';
      END IF;
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'display_name' AND is_nullable = 'NO'
      ) THEN
        ALTER TABLE users ALTER COLUMN display_name DROP NOT NULL;
        RAISE NOTICE 'Dropped NOT NULL on users.display_name';
      END IF;
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'password_hash' AND is_nullable = 'NO'
      ) THEN
        ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
        RAISE NOTICE 'Dropped NOT NULL on users.password_hash';
      END IF;
    END $$;
  `)
  console.log('[migrate] Safety-net applied successfully')

  console.log('[migrate] All migrations complete')
} catch (err) {
  console.error('[migrate] Migration failed:', err)
  process.exit(1)
} finally {
  await client.end()
}
