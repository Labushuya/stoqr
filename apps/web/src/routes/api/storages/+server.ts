import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { db } from '$lib/server/db'
import { storages, locations } from '@stoqr/db'
import { eq } from 'drizzle-orm'

export const POST: RequestHandler = async ({ locals, request }) => {
  if (!locals.user) {
    return json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { locationId, name, storageType, temperatureZone, icon, sortOrder } = body

  if (!locationId || !name) {
    return json({ error: 'locationId and name are required' }, { status: 400 })
  }

  // Verify that the location belongs to the authenticated user
  const [location] = await db
    .select()
    .from(locations)
    .where(eq(locations.id, locationId))

  if (!location || location.userId !== locals.user.id) {
    return json({ error: 'Location not found' }, { status: 404 })
  }

  const [storage] = await db
    .insert(storages)
    .values({
      locationId,
      name,
      storageType: storageType ?? null,
      temperatureZone: temperatureZone ?? null,
      icon: icon ?? null,
      sortOrder: sortOrder ?? 0,
    })
    .returning()

  return json(storage, { status: 201 })
}
