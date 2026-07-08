import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { requireHouseholdId } from '$lib/server/queries/households'
import { db } from '$lib/server/db'
import { units } from '@stoqr/db'
import { eq } from 'drizzle-orm'

// ---------------------------------------------------------------------------
// DELETE /api/units/[id]
// ---------------------------------------------------------------------------

export const DELETE: RequestHandler = async ({ locals, params }) => {
  if (!locals.user) {
    return json({ error: 'Unauthorized' }, { status: 401 })
  }

  const householdId = await requireHouseholdId(locals.user.id)

  const [unit] = await db
    .select()
    .from(units)
    .where(eq(units.id, params.id))

  if (!unit) {
    return json({ error: 'Not found' }, { status: 404 })
  }

  if (unit.isSystem) {
    return json({ error: 'System units cannot be deleted' }, { status: 403 })
  }

  if (unit.householdId !== householdId) {
    return json({ error: 'Not found' }, { status: 404 })
  }

  await db.delete(units).where(eq(units.id, params.id))

  return json({ ok: true })
}
