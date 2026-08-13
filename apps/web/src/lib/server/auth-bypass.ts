import { db } from '$lib/server/db'
import { asc } from 'drizzle-orm'
import type { User, Session } from 'better-auth'

/**
 * Auth-Bypass — Login vollständig deaktivierbar per ENV-Flag.
 *
 * Ist AUTH_DISABLED=true gesetzt, injiziert der Hook (hooks.server.ts) eine feste
 * Default-Identität statt eine Better-Auth-Session zu lesen. Damit passieren alle
 * `if (!locals.user)`-Guards, die App-Shell rendert und `requireHouseholdId(userId)`
 * löst normal auf — vorausgesetzt, mindestens ein Nutzer existiert in der DB
 * (auf dem Pi der Fall). Kein Code, kein Schema, keine Query wird sonst angefasst.
 *
 * Reversibel: Flag entfernen → Login-Verhalten exakt wie zuvor.
 */
export const AUTH_DISABLED = process.env.AUTH_DISABLED === 'true'

// Prozessweiter Cache: der Default-Nutzer wird höchstens einmal aus der DB gelesen.
// `undefined` = noch nicht geladen, `null` = geladen, aber kein Nutzer vorhanden.
let cachedUser: User | null | undefined = undefined

/**
 * Liest den ersten (ältesten) existierenden Nutzer als Default-Identität.
 * Gibt `null` zurück, wenn kein Nutzer existiert (frische DB) — dann fällt der
 * Hook auf den normalen Login-Pfad zurück, damit Erst-Registrierung möglich bleibt.
 */
export async function getBypassUser(): Promise<User | null> {
  if (cachedUser !== undefined) return cachedUser

  const row = await db.query.users.findFirst({
    orderBy: (u) => [asc(u.createdAt)],
  })

  if (!row) {
    cachedUser = null
    return null
  }

  // In die Form von Better Auths `User` bringen (name = displayName).
  cachedUser = {
    id: row.id,
    name: row.displayName ?? row.email ?? row.id,
    email: row.email ?? '',
    emailVerified: row.emailVerified,
    image: row.image ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  } as User

  return cachedUser
}

/**
 * Minimales, typkonformes Session-Objekt für den Bypass. `locals.session` wird
 * aktuell nirgends gelesen, soll aber nicht `null` sein, wenn ein Nutzer da ist.
 */
export function makeBypassSession(user: User): Session {
  const now = new Date()
  const farFuture = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000)
  return {
    id: 'bypass',
    token: 'bypass',
    userId: user.id,
    expiresAt: farFuture,
    createdAt: now,
    updatedAt: now,
    ipAddress: null,
    userAgent: null,
  } as Session
}
