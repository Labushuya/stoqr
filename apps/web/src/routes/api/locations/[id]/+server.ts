import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { db } from '$lib/server/db'
import { locations } from '@stoqr/db'
import { eq, and } from 'drizzle-orm'
import { requireHouseholdId } from '$lib/server/queries/households'

export const GET: RequestHandler = async ({ locals, params }) => {
  if (!locals.user) {
    return json({ error: 'Unauthorized' }, { status: 401 })
  }

  const householdId = await requireHouseholdId(locals.user.id)

  const [location] = await db
    .select()
    .from(locations)
    .where(and(eq(locations.id, params.id), eq(locations.householdId, householdId)))

  if (!location) {
    return json({ error: 'Not found' }, { status: 404 })
  }

  return json(location)
}

export const PATCH: RequestHandler = async ({ locals, params, request }) => {
  if (!locals.user) {
    return json({ error: 'Unauthorized' }, { status: 401 })
  }

  const householdId = await requireHouseholdId(locals.user.id)

  const body = await request.json()
  const { name, icon, sortOrder } = body

  const updates: Record<string, unknown> = {}
  if (name !== undefined) updates.name = name
  if (icon !== undefined) updates.icon = icon
  if (sortOrder !== undefined) updates.sortOrder = sortOrder

  if (Object.keys(updates).length === 0) {
    return json({ error: 'No fields to update' }, { status: 400 })
  }

  const [updated] = await db
    .update(locations)
    .set(updates)
    .where(and(eq(locations.id, params.id), eq(locations.householdId, householdId)))
    .returning()

  if (!updated) {
    return json({ error: 'Not found' }, { status: 404 })
  }

  return json(updated)
}

export const DELETE: RequestHandler = async ({ locals, params }) => {
  if (!locals.user) {
    return json({ error: 'Unauthorized' }, { status: 401 })
  }

  const householdId = await requireHouseholdId(locals.user.id)

  const [deleted] = await db
    .delete(locations)
    .where(and(eq(locations.id, params.id), eq(locations.householdId, householdId)))
    .returning()

  if (!deleted) {
    return json({ error: 'Not found' }, { status: 404 })
  }

  return new Response(null, { status: 204 })
}
