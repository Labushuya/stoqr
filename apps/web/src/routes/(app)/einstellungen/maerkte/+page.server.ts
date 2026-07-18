import { redirect, fail } from '@sveltejs/kit'
import { db } from '$lib/server/db'
import { stores } from '@stoqr/db'
import { eq, asc } from 'drizzle-orm'
import { requireHouseholdId } from '$lib/server/queries/households'
import { normalizeScrapeUrl, INVALID_URL, isPriceScrapeEnabled } from '$lib/server/scrape/globus'
import type { PageServerLoad, Actions } from './$types'

export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.user) redirect(302, '/login')

  const householdId = await requireHouseholdId(locals.user.id)

  try {
    const storeRows = await db.query.stores.findMany({
      where: (s, { eq }) => eq(s.householdId, householdId),
      orderBy: [asc(stores.name)],
      columns: {
        id: true,
        name: true,
        chain: true,
        address: true,
        city: true,
        scrapeUrl: true,
      },
    })

    return { stores: storeRows, priceScrapeEnabled: isPriceScrapeEnabled(), loadError: null }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[maerkte] load error:', msg)
    return {
      stores: [],
      priceScrapeEnabled: isPriceScrapeEnabled(),
      loadError: 'Märkte konnten nicht geladen werden. Bitte Seite neu laden.',
    }
  }
}

export const actions: Actions = {
  addStore: async ({ locals, request }) => {
    if (!locals.user) redirect(302, '/login')

    const householdId = await requireHouseholdId(locals.user.id)
    const data = await request.formData()

    const name = String(data.get('name') ?? '').trim()
    const chain = String(data.get('chain') ?? '').trim() || null
    const address = String(data.get('address') ?? '').trim() || null
    const city = String(data.get('city') ?? '').trim() || null
    const scrapeUrl = normalizeScrapeUrl(String(data.get('scrapeUrl') ?? ''))

    if (!name) {
      return fail(400, { action: 'addStore', error: 'Name ist erforderlich.' })
    }
    if (scrapeUrl === INVALID_URL) {
      return fail(400, { action: 'addStore', error: 'Ungültige Abruf-URL (nur http/https).' })
    }

    const [created] = await db
      .insert(stores)
      .values({ householdId, name, chain, address, city, scrapeUrl })
      .returning({ id: stores.id, name: stores.name, chain: stores.chain, address: stores.address, city: stores.city, scrapeUrl: stores.scrapeUrl })

    return { action: 'addStore', success: true, store: created }
  },

  editStore: async ({ locals, request }) => {
    if (!locals.user) redirect(302, '/login')

    await requireHouseholdId(locals.user.id)
    const data = await request.formData()

    const id = String(data.get('id') ?? '').trim()
    const name = String(data.get('name') ?? '').trim()
    const chain = String(data.get('chain') ?? '').trim() || null
    const address = String(data.get('address') ?? '').trim() || null
    const city = String(data.get('city') ?? '').trim() || null
    const scrapeUrl = normalizeScrapeUrl(String(data.get('scrapeUrl') ?? ''))

    if (!id || !name) {
      return fail(400, { action: 'editStore', error: 'ID und Name sind erforderlich.' })
    }
    if (scrapeUrl === INVALID_URL) {
      return fail(400, { action: 'editStore', error: 'Ungültige Abruf-URL (nur http/https).' })
    }

    const [updated] = await db
      .update(stores)
      .set({ name, chain, address, city, scrapeUrl })
      .where(eq(stores.id, id))
      .returning({ id: stores.id, name: stores.name, chain: stores.chain, address: stores.address, city: stores.city, scrapeUrl: stores.scrapeUrl })

    if (!updated) {
      return fail(404, { action: 'editStore', error: 'Markt nicht gefunden.' })
    }

    return { action: 'editStore', success: true, store: updated }
  },

  deleteStore: async ({ locals, request }) => {
    if (!locals.user) redirect(302, '/login')

    await requireHouseholdId(locals.user.id)
    const data = await request.formData()

    const id = String(data.get('id') ?? '').trim()

    if (!id) {
      return fail(400, { action: 'deleteStore', error: 'ID ist erforderlich.' })
    }

    try {
      await db.delete(stores).where(eq(stores.id, id))
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes('foreign key') || msg.includes('violates') || msg.includes('constraint')) {
        return fail(409, {
          action: 'deleteStore',
          error: 'Dieser Markt kann nicht gelöscht werden, da er noch Artikeln zugeordnet ist.',
        })
      }
      return fail(500, { action: 'deleteStore', error: 'Unbekannter Fehler beim Löschen.' })
    }

    return { action: 'deleteStore', success: true, id }
  },
}
