import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { db } from '$lib/server/db'
import { stores, inventoryItems } from '@stoqr/db'
import { eq, and, count } from 'drizzle-orm'
import { requireHouseholdId } from '$lib/server/queries/households'

// ---------------------------------------------------------------------------
// GET /api/stores/[id]
// ---------------------------------------------------------------------------

export const GET: RequestHandler = async ({ locals, params }) => {
  if (!locals.user) {
    return json({ error: 'Unauthorized' }, { status: 401 })
  }

  const householdId = await requireHouseholdId(locals.user.id)

  const [store] = await db
    .select()
    .from(stores)
    .where(and(eq(stores.id, params.id), eq(stores.householdId, householdId)))

  if (!store) {
    return json({ error: 'Not found' }, { status: 404 })
  }

  return json(store)
}

// ---------------------------------------------------------------------------
// PATCH /api/stores/[id]
// ---------------------------------------------------------------------------

export const PATCH: RequestHandler = async ({ locals, params, request }) => {
  if (!locals.user) {
    return json({ error: 'Unauthorized' }, { status: 401 })
  }

  const householdId = await requireHouseholdId(locals.user.id)
  const body = await request.json()
  const { name, chain, address, city } = body as { name?: string; chain?: string; address?: string; city?: string }

  const patch: Partial<typeof stores.$inferInsert> = {}
  if (name !== undefined) patch.name = name
  if (chain !== undefined) patch.chain = chain ?? null
  if (address !== undefined) patch.address = address ?? null
  if (city !== undefined) patch.city = city ?? null

  if (Object.keys(patch).length === 0) {
    return json({ error: 'No fields to update' }, { status: 400 })
  }

  const [updated] = await db
    .update(stores)
    .set(patch)
    .where(and(eq(stores.id, params.id), eq(stores.householdId, householdId)))
    .returning()

  if (!updated) {
    return json({ error: 'Not found' }, { status: 404 })
  }

  return json(updated)
}

// ---------------------------------------------------------------------------
// DELETE /api/stores/[id]
// ---------------------------------------------------------------------------

export const DELETE: RequestHandler = async ({ locals, params }) => {
  if (!locals.user) {
    return json({ error: 'Unauthorized' }, { status: 401 })
  }

  const householdId = await requireHouseholdId(locals.user.id)

  // Verify store belongs to this household
  const [store] = await db
    .select({ id: stores.id })
    .from(stores)
    .where(and(eq(stores.id, params.id), eq(stores.householdId, householdId)))

  if (!store) {
    return json({ error: 'Not found' }, { status: 404 })
  }

  // Check for inventory items still referencing this store before deleting
  const [{ value: refCount }] = await db
    .select({ value: count() })
    .from(inventoryItems)
    .where(eq(inventoryItems.storeId, params.id))

  if (refCount > 0) {
    return json(
      { error: 'Markt wird noch von Beständen verwendet', count: refCount },
      { status: 409 }
    )
  }

  await db.delete(stores).where(eq(stores.id, params.id))

  return json({ ok: true })
}
