import { db } from '@stoqr/db'
export { db }
export type { Database } from '@stoqr/db'

// getDb()-Provider, damit die Transfer-Endpoints byte-gleich zum App-Repo bleiben
// (dort wird die On-Device-SQLite via setDb/getDb injiziert). Auf dem Pi gibt es
// nur das eine Postgres-Singleton.
export function getDb() {
  return db
}
