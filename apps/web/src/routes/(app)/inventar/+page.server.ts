import { getInventoryItems, getCategories } from '$lib/server/queries/products'
import { getLocations } from '$lib/server/queries/locations'
import { requireHouseholdId, getUnits } from '$lib/server/queries/households'
import { redirect } from '@sveltejs/kit'
import type { PageServerLoad } from './$types'

export const load: PageServerLoad = async ({ locals, url }) => {
  if (!locals.user) redirect(302, '/login')
  const placeId = url.searchParams.get('placeId') ?? undefined
  const householdId = await requireHouseholdId(locals.user.id)
  const [items, locations, units, categories] = await Promise.all([
    // Alle Status laden, damit der „Nur verfuegbare"-Toggle clientseitig wirkt
    // (Default: nur verfuegbare sichtbar; abgeschaltet -> auch verbraucht/gespendet/entsorgt).
    getInventoryItems(householdId, { placeId, allStatuses: true }),
    getLocations(householdId),
    getUnits(householdId),
    getCategories(),
  ])
  return { items, locations, units, categories }
}
