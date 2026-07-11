import { redirect } from '@sveltejs/kit'
import { requireHouseholdId, getUnits } from '$lib/server/queries/households'
import { getShoppingList } from '$lib/server/queries/shopping-list'
import type { PageServerLoad } from './$types'

export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.user) redirect(302, '/login')
  const householdId = await requireHouseholdId(locals.user.id)
  try {
    const [items, units] = await Promise.all([getShoppingList(householdId), getUnits(householdId)])
    return { items, units, loadError: null }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[einkaufsliste] load error:', msg)
    return { items: [], units: [], loadError: 'Einkaufsliste konnte nicht geladen werden.' }
  }
}
