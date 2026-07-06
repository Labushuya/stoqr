import { getInventoryItems } from '$lib/server/queries/products'
import { getLocations } from '$lib/server/queries/locations'
import { redirect } from '@sveltejs/kit'
import type { PageServerLoad } from './$types'

export const load: PageServerLoad = async ({ locals, url }) => {
  if (!locals.user) redirect(302, '/login')
  const placeId = url.searchParams.get('placeId') ?? undefined
  const [items, locations] = await Promise.all([
    getInventoryItems(locals.user.id, { placeId }),
    getLocations(locals.user.id),
  ])
  return { items, locations }
}
