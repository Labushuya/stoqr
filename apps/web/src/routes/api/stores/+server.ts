import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { db } from '$lib/server/db'
import { stores } from '@stoqr/db'
import { eq, asc } from 'drizzle-orm'
import { requireHouseholdId } from '$lib/server/queries/households'

// ---------------------------------------------------------------------------
// GET /api/stores
// ---------------------------------------------------------------------------

export const GET: RequestHandler = async ({ locals }) => {
  if (!locals.user) {
    return json({ error: 'Unauthorized' }, { status: 401 })
  }

  const householdId = await requireHouseholdId(locals.user.id)

  const rows = await db
    .select()
    .from(stores)
    .where(eq(stores.householdId, householdId))
    .orderBy(asc(stores.name))

  return json(rows)
}

// ---------------------------------------------------------------------------
// POST /api/stores
// ---------------------------------------------------------------------------

export const POST: RequestHandler = async ({ locals, request }) => {
  if (!locals.user) {
    return json({ error: 'Unauthorized' }, { status: 401 })
  }

  const householdId = await requireHouseholdId(locals.user.id)
  const body = await request.json()
  const { name, chain, address, city } = body as { name?: string; chain?: string; address?: string; city?: string }

  if (!name) {
    return json({ error: 'name is required' }, { status: 400 })
  }

  const [store] = await db
    .insert(stores)
    .values({
      householdId,
      name,
      chain: chain ?? null,
      address: address ?? null,
      city: city ?? null,
    })
    .returning()

  return json(store, { status: 201 })
}
