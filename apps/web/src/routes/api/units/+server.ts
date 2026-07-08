import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { requireHouseholdId, getUnits } from '$lib/server/queries/households'
import { db } from '$lib/server/db'
import { units } from '@stoqr/db'

// ---------------------------------------------------------------------------
// GET /api/units
// ---------------------------------------------------------------------------

export const GET: RequestHandler = async ({ locals }) => {
  if (!locals.user) {
    return json({ error: 'Unauthorized' }, { status: 401 })
  }

  const householdId = await requireHouseholdId(locals.user.id)
  const result = await getUnits(householdId)
  return json(result)
}

// ---------------------------------------------------------------------------
// POST /api/units
// ---------------------------------------------------------------------------

export const POST: RequestHandler = async ({ locals, request }) => {
  if (!locals.user) {
    return json({ error: 'Unauthorized' }, { status: 401 })
  }

  const householdId = await requireHouseholdId(locals.user.id)

  const body = await request.json()
  const { name, symbol } = body as { name?: string; symbol?: string }

  if (!name?.trim() || !symbol?.trim()) {
    return json({ error: 'name and symbol are required' }, { status: 400 })
  }

  const [newUnit] = await db
    .insert(units)
    .values({
      householdId,
      name: name.trim(),
      symbol: symbol.trim(),
      isSystem: false,
    })
    .returning()

  return json(newUnit, { status: 201 })
}
