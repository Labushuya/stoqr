import { redirect } from '@sveltejs/kit'
import { requireHouseholdId, getUnits } from '$lib/server/queries/households'
import { getShoppingList } from '$lib/server/queries/shopping-list'
import { listTrips } from '$lib/server/queries/shopping-trips'
import { db } from '$lib/server/db'
import { stores } from '@stoqr/db'
import { asc } from 'drizzle-orm'
import type { PageServerLoad } from './$types'

export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.user) redirect(302, '/login')
  const householdId = await requireHouseholdId(locals.user.id)
  try {
    const [items, units, storeRows, trips] = await Promise.all([
      getShoppingList(householdId),
      getUnits(householdId),
      db.query.stores.findMany({
        where: (s, { eq }) => eq(s.householdId, householdId),
        orderBy: [asc(stores.name)],
        columns: { id: true, name: true, chain: true },
      }),
      listTrips(householdId),
    ])
    return { items, units, stores: storeRows, trips, loadError: null }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[einkaufsliste] load error:', msg)
    return { items: [], units: [], stores: [], trips: [], loadError: 'Einkaufsliste konnte nicht geladen werden.' }
  }
}
