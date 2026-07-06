import { getDashboardStats, getExpiringItems, getExpiredItems } from '$lib/server/queries/dashboard'
import { redirect } from '@sveltejs/kit'
import type { PageServerLoad } from './$types'

export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.user) redirect(302, '/login')
  const [stats, expiringSoon, expired] = await Promise.all([
    getDashboardStats(locals.user.id),
    getExpiringItems(locals.user.id, 14),
    getExpiredItems(locals.user.id),
  ])
  return { stats, expiringSoon, expired }
}
