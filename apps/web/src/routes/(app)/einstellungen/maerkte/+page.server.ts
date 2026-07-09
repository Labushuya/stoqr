import { redirect, fail } from '@sveltejs/kit'
import { db } from '$lib/server/db'
import { stores } from '@stoqr/db'
import { eq, asc } from 'drizzle-orm'
import { requireHouseholdId } from '$lib/server/queries/households'
import type { PageServerLoad, Actions } from './$types'

export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.user) redirect(302, '/login')

  const householdId = await requireHouseholdId(locals.user.id)

  const storeRows = await db.query.stores.findMany({
    where: (s, { eq }) => eq(s.householdId, householdId),
    orderBy: [asc(stores.name)],
    columns: {
      id: true,
      name: true,
      chain: true,
    },
  })

  return { stores: storeRows }
}

export const actions: Actions = {
  addStore: async ({ locals, request }) => {
    if (!locals.user) redirect(302, '/login')

    const householdId = await requireHouseholdId(locals.user.id)
    const data = await request.formData()

    const name = String(data.get('name') ?? '').trim()
    const chain = String(data.get('chain') ?? '').trim() || null

    if (!name) {
      return fail(400, { action: 'addStore', error: 'Name ist erforderlich.' })
    }

    const [created] = await db
      .insert(stores)
      .values({ householdId, name, chain })
      .returning({ id: stores.id, name: stores.name, chain: stores.chain })

    return { action: 'addStore', success: true, store: created }
  },

  editStore: async ({ locals, request }) => {
    if (!locals.user) redirect(302, '/login')

    await requireHouseholdId(locals.user.id)
    const data = await request.formData()

    const id = String(data.get('id') ?? '').trim()
    const name = String(data.get('name') ?? '').trim()
    const chain = String(data.get('chain') ?? '').trim() || null

    if (!id || !name) {
      return fail(400, { action: 'editStore', error: 'ID und Name sind erforderlich.' })
    }

    const [updated] = await db
      .update(stores)
      .set({ name, chain })
      .where(eq(stores.id, id))
      .returning({ id: stores.id, name: stores.name, chain: stores.chain })

    if (!updated) {
      return fail(404, { action: 'editStore', error: 'Markt nicht gefunden.' })
    }

    return { action: 'editStore', success: true, store: updated }
  },

  deleteStore: async ({ locals, request }) => {
    if (!locals.user) redirect(302, '/login')

    await requireHouseholdId(locals.user.id)
    const data = await request.formData()

    const id = String(data.get('id') ?? '').trim()

    if (!id) {
      return fail(400, { action: 'deleteStore', error: 'ID ist erforderlich.' })
    }

    try {
      await db.delete(stores).where(eq(stores.id, id))
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes('foreign key') || msg.includes('violates') || msg.includes('constraint')) {
        return fail(409, {
          action: 'deleteStore',
          error: 'Dieser Markt kann nicht gelöscht werden, da er noch Artikeln zugeordnet ist.',
        })
      }
      return fail(500, { action: 'deleteStore', error: 'Unbekannter Fehler beim Löschen.' })
    }

    return { action: 'deleteStore', success: true, id }
  },
}
