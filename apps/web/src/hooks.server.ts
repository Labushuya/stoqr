import { auth } from '$lib/server/auth'
import { AUTH_DISABLED, getBypassUser, makeBypassSession } from '$lib/server/auth-bypass'
import type { Handle } from '@sveltejs/kit'

export const handle: Handle = async ({ event, resolve }) => {
  // Login deaktiviert (AUTH_DISABLED=true): feste Default-Identität injizieren,
  // statt eine Better-Auth-Session zu lesen. Existiert noch kein Nutzer (frische DB),
  // fällt der Ablauf bewusst auf den normalen Login-Pfad zurück, damit die
  // Erst-Registrierung via /register möglich bleibt.
  if (AUTH_DISABLED) {
    const user = await getBypassUser()
    if (user) {
      event.locals.user = user
      event.locals.session = makeBypassSession(user)
      return resolve(event)
    }
  }

  const session = await auth.api.getSession({
    headers: event.request.headers,
  })
  event.locals.user = session?.user ?? null
  event.locals.session = session?.session ?? null
  return resolve(event)
}
