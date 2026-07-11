import { getCategories, getProductById } from '$lib/server/queries/products'
import { getLocations } from '$lib/server/queries/locations'
import { requireHouseholdId, getUnits } from '$lib/server/queries/households'
import { db } from '$lib/server/db'
import { stores } from '@stoqr/db'
import { asc } from 'drizzle-orm'
import { redirect } from '@sveltejs/kit'
import type { PageServerLoad } from './$types'

export const load: PageServerLoad = async ({ locals, url }) => {
  if (!locals.user) redirect(302, '/login')
  const householdId = await requireHouseholdId(locals.user.id)
  const [categories, locations, units, storeRows] = await Promise.all([
    getCategories(),
    getLocations(householdId),
    getUnits(householdId),
    db.query.stores.findMany({
      where: (s, { eq }) => eq(s.householdId, householdId),
      orderBy: [asc(stores.name)],
      columns: { id: true, name: true, chain: true },
    }),
  ])

  const productId = url.searchParams.get('productId')
  let preselectedProduct = null
  if (productId) {
    preselectedProduct = await getProductById(productId)
  }

  return { categories, locations, units, stores: storeRows, preselectedProduct }
}
