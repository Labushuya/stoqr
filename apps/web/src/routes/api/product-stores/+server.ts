import { json, error } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { db } from '$lib/server/db'
import { productStores, stores } from '@stoqr/db'
import { eq, and } from 'drizzle-orm'
import { requireHouseholdId } from '$lib/server/queries/households'

export const POST: RequestHandler = async ({ locals, request }) => {
  if (!locals.user) {
    throw error(401, 'Unauthorized')
  }

  const householdId = await requireHouseholdId(locals.user.id)

  const body = await request.json()
  const { productId, storeId, sortOrder } = body as {
    productId: string
    storeId: string
    sortOrder?: number
  }

  if (!productId || !storeId) {
    throw error(400, 'productId and storeId are required')
  }

  // Verify the store belongs to this household
  const [store] = await db
    .select({ id: stores.id, name: stores.name })
    .from(stores)
    .where(and(eq(stores.id, storeId), eq(stores.householdId, householdId)))

  if (!store) {
    throw error(404, 'Store not found')
  }

  const [inserted] = await db
    .insert(productStores)
    .values({
      productId,
      storeId,
      householdId,
      sortOrder: sortOrder ?? 1,
    })
    .returning()

  return json({
    id: inserted.id,
    sortOrder: inserted.sortOrder,
    store: { id: store.id, name: store.name },
  })
}
