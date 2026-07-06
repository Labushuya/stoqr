import { getLocations } from '$lib/server/queries/locations'
import { redirect } from '@sveltejs/kit'
import type { PageServerLoad } from './$types'

export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.user) redirect(302, '/login')
  const locations = await getLocations(locals.user.id)
  return { locations }
}
