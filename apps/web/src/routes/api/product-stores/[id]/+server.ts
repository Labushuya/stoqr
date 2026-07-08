import { json, error } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { db } from '$lib/server/db'
import { productStores } from '@stoqr/db'
import { eq, and } from 'drizzle-orm'
import { requireHouseholdId } from '$lib/server/queries/households'

export const PATCH: RequestHandler = async ({ locals, params, request }) => {
  if (!locals.user) {
    throw error(401, 'Unauthorized')
  }

  const householdId = await requireHouseholdId(locals.user.id)

  const body = await request.json()
  const { sortOrder }: { sortOrder: number } = body

  const [existing] = await db
    .select({ id: productStores.id })
    .from(productStores)
    .where(and(eq(productStores.id, params.id), eq(productStores.householdId, householdId)))

  if (!existing) {
    throw error(404, 'Not found')
  }

  await db
    .update(productStores)
    .set({ sortOrder })
    .where(and(eq(productStores.id, params.id), eq(productStores.householdId, householdId)))

  return json({ ok: true })
}

export const DELETE: RequestHandler = async ({ locals, params }) => {
  if (!locals.user) {
    throw error(401, 'Unauthorized')
  }

  const householdId = await requireHouseholdId(locals.user.id)

  const [deleted] = await db
    .delete(productStores)
    .where(and(eq(productStores.id, params.id), eq(productStores.householdId, householdId)))
    .returning({ id: productStores.id })

  if (!deleted) {
    throw error(404, 'Not found')
  }

  return json({ ok: true })
}

