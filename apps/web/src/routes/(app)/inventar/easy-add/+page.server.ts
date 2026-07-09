import { getCategories, getProductById } from '$lib/server/queries/products'
import { getLocations } from '$lib/server/queries/locations'
import { requireHouseholdId, getUnits } from '$lib/server/queries/households'
import { redirect } from '@sveltejs/kit'
import type { PageServerLoad } from './$types'

export const load: PageServerLoad = async ({ locals, url }) => {
  if (!locals.user) redirect(302, '/login')
  const householdId = await requireHouseholdId(locals.user.id)
  const [categories, locations, units] = await Promise.all([
    getCategories(),
    getLocations(householdId),
    getUnits(householdId),
  ])

  const productId = url.searchParams.get('productId')
  let preselectedProduct = null
  if (productId) {
    preselectedProduct = await getProductById(productId)
  }

  return { categories, locations, units, preselectedProduct }
}
