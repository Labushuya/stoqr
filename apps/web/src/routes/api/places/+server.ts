import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { db } from '$lib/server/db'
import { places, storages, locations } from '@stoqr/db'
import { eq } from 'drizzle-orm'

export const POST: RequestHandler = async ({ locals, request }) => {
  if (!locals.user) {
    return json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { storageId, name, icon, sortOrder } = body

  if (!storageId || !name) {
    return json({ error: 'storageId and name are required' }, { status: 400 })
  }

  // Verify that the storage belongs to the authenticated user via location
  const [row] = await db
    .select({ locationUserId: locations.userId })
    .from(storages)
    .innerJoin(locations, eq(storages.locationId, locations.id))
    .where(eq(storages.id, storageId))

  if (!row || row.locationUserId !== locals.user.id) {
    return json({ error: 'Storage not found' }, { status: 404 })
  }

  const [place] = await db
    .insert(places)
    .values({
      storageId,
      name,
      icon: icon ?? null,
      sortOrder: sortOrder ?? 0,
    })
    .returning()

  return json(place, { status: 201 })
}
