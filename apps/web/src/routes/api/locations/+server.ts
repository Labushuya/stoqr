import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { db } from '$lib/server/db'
import { locations } from '@stoqr/db'
import { eq } from 'drizzle-orm'
import { requireHouseholdId } from '$lib/server/queries/households'

export const GET: RequestHandler = async ({ locals }) => {
  if (!locals.user) {
    return json({ error: 'Unauthorized' }, { status: 401 })
  }

  const householdId = await requireHouseholdId(locals.user.id)

  const rows = await db
    .select()
    .from(locations)
    .where(eq(locations.householdId, householdId))
    .orderBy(locations.sortOrder, locations.createdAt)

  return json(rows)
}

export const POST: RequestHandler = async ({ locals, request }) => {
  if (!locals.user) {
    return json({ error: 'Unauthorized' }, { status: 401 })
  }

  const householdId = await requireHouseholdId(locals.user.id)

  const body = await request.json()
  const { name, icon, sortOrder } = body

  if (!name) {
    return json({ error: 'name is required' }, { status: 400 })
  }

  const [location] = await db
    .insert(locations)
    .values({
      householdId: householdId,
      name,
      icon: icon ?? null,
      sortOrder: sortOrder ?? 0,
    })
    .returning()

  return json(location, { status: 201 })
}
