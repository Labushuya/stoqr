import { redirect, error } from '@sveltejs/kit'
import { requireHouseholdId, getUnits } from '$lib/server/queries/households'
import { getTrip } from '$lib/server/queries/shopping-trips'
import { getCurrentPricesForProducts } from '$lib/server/queries/prices'
import { buildUnitMetaMap } from '$lib/utils/stock'
import { estimateLineCost, summarizeCosts, type LineEstimate } from '$lib/utils/prices'
import type { PageServerLoad } from './$types'

// ---------------------------------------------------------------------------
// Einkauf-Detail (Block E / M2): Positionen eines Runs, Status-Aktionen, Einbuchen.
// Block F: Kosten-Schätzung je Position + Summe (wenn der Run einem Markt zugeordnet ist).
// ---------------------------------------------------------------------------

export const load: PageServerLoad = async ({ locals, params }) => {
  if (!locals.user) redirect(302, '/login')
  const householdId = await requireHouseholdId(locals.user.id)

  const [trip, units] = await Promise.all([getTrip(params.id, householdId), getUnits(householdId)])
  if (!trip) error(404, 'Einkauf nicht gefunden')

  // Kosten-Schätzung: nur wenn der Run einem Markt zugeordnet ist.
  const estimates: Record<string, LineEstimate> = {}
  let costSummary: ReturnType<typeof summarizeCosts> | null = null
  if (trip.storeId) {
    const productIds = trip.items.map((i) => i.productId).filter((p): p is string => !!p)
    const priceMap = await getCurrentPricesForProducts(productIds, trip.storeId, householdId)
    const metaMap = buildUnitMetaMap(units)
    const lines: LineEstimate[] = []
    for (const it of trip.items) {
      const price = it.productId ? priceMap.get(it.productId) : undefined
      const est = estimateLineCost(
        Number(it.quantity),
        it.unit,
        price ? { priceCt: price.priceCt, unit: price.unit } : null,
        metaMap,
      )
      estimates[it.id] = est
      lines.push(est)
    }
    costSummary = summarizeCosts(lines)
  }

  return { trip, units, estimates, costSummary }
}
