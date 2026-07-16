import { redirect, error } from '@sveltejs/kit'
import { requireHouseholdId, getUnits } from '$lib/server/queries/households'
import { getTrip } from '$lib/server/queries/shopping-trips'
import type { PageServerLoad } from './$types'

// ---------------------------------------------------------------------------
// Einkauf-Detail (Block E / M2): Positionen eines Runs, Status-Aktionen, Einbuchen.
// ---------------------------------------------------------------------------

export const load: PageServerLoad = async ({ locals, params }) => {
  if (!locals.user) redirect(302, '/login')
  const householdId = await requireHouseholdId(locals.user.id)

  const [trip, units] = await Promise.all([getTrip(params.id, householdId), getUnits(householdId)])
  if (!trip) error(404, 'Einkauf nicht gefunden')

  return { trip, units }
}
