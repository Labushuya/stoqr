import { redirect, fail } from '@sveltejs/kit'
import { db } from '$lib/server/db'
import { expiryConfig, categories } from '@stoqr/db'
import { eq, asc } from 'drizzle-orm'
import type { PageServerLoad, Actions } from './$types'

export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.user) redirect(302, '/login')

  const userId = locals.user.id

  const [configRows, categoryRows] = await Promise.all([
    db
      .select()
      .from(expiryConfig)
      .where(eq(expiryConfig.userId, userId))
      .limit(1),

    db.query.categories.findMany({
      orderBy: [asc(categories.sortOrder), asc(categories.name)],
      columns: {
        id: true,
        name: true,
        slug: true,
        icon: true,
        defaultExpiryToleranceDays: true,
      },
    }),
  ])

  const config = configRows[0] ?? {
    yellowDaysBefore: 7,
    redDaysBefore: 2,
    graceDaysAfter: 0,
  }

  return {
    expiryConfig: {
      yellowDaysBefore: config.yellowDaysBefore,
      redDaysBefore: config.redDaysBefore,
      graceDaysAfter: config.graceDaysAfter,
    },
    categories: categoryRows,
  }
}

export const actions: Actions = {
  updateGlobalTolerance: async ({ locals, request }) => {
    if (!locals.user) redirect(302, '/login')
    const userId = locals.user.id

    const data = await request.formData()
    const yellowRaw = data.get('yellow_days_before')
    const redRaw = data.get('red_days_before')
    const graceRaw = data.get('grace_days_after')

    const yellowDaysBefore = parseInt(String(yellowRaw), 10)
    const redDaysBefore = parseInt(String(redRaw), 10)
    const graceDaysAfter = parseInt(String(graceRaw), 10)

    if (
      isNaN(yellowDaysBefore) ||
      isNaN(redDaysBefore) ||
      isNaN(graceDaysAfter) ||
      yellowDaysBefore < 0 ||
      redDaysBefore < 0 ||
      graceDaysAfter < 0 ||
      redDaysBefore > yellowDaysBefore
    ) {
      return fail(422, {
        action: 'updateGlobalTolerance',
        error: 'Ungültige Werte. Rot-Schwelle muss kleiner oder gleich Gelb-Schwelle sein.',
      })
    }

    await db
      .insert(expiryConfig)
      .values({ userId, yellowDaysBefore, redDaysBefore, graceDaysAfter })
      .onConflictDoUpdate({
        target: expiryConfig.userId,
        set: { yellowDaysBefore, redDaysBefore, graceDaysAfter },
      })

    return { action: 'updateGlobalTolerance', success: true }
  },

  updateCategoryTolerance: async ({ locals, request }) => {
    if (!locals.user) redirect(302, '/login')

    const data = await request.formData()
    const categoryId = String(data.get('category_id') ?? '')
    const toleranceRaw = data.get('tolerance_days')
    const toleranceDays = parseInt(String(toleranceRaw), 10)

    if (!categoryId || isNaN(toleranceDays)) {
      return fail(422, {
        action: 'updateCategoryTolerance',
        error: 'Ungültige Eingabe.',
      })
    }

    await db
      .update(categories)
      .set({ defaultExpiryToleranceDays: toleranceDays })
      .where(eq(categories.id, categoryId))

    return { action: 'updateCategoryTolerance', success: true, categoryId }
  },
}
