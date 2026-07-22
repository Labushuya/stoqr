import { redirect } from '@sveltejs/kit'
import { requireHouseholdId } from '$lib/server/queries/households'
import { listCategoryMappings } from '$lib/server/queries/category-mapping'
import { listCategories } from '$lib/server/queries/categories'
import type { PageServerLoad } from './$types'

// ---------------------------------------------------------------------------
// Kategorie-Zuordnung (G29): Regeln OFF-Tag / Globus-Segment → stoqr-Kategorie.
// Mutationen laufen ueber /api/category-mappings.
// ---------------------------------------------------------------------------

export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.user) redirect(302, '/login')
  const householdId = await requireHouseholdId(locals.user.id)

  try {
    const [mappings, categories] = await Promise.all([
      listCategoryMappings(householdId),
      listCategories(),
    ])
    return { mappings, categories, loadError: null }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[kategorie-zuordnung] load error:', msg)
    return { mappings: [], categories: [], loadError: 'Regeln konnten nicht geladen werden. Bitte Seite neu laden.' }
  }
}
