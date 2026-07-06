import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import {
  getInventoryItems,
  createInventoryItem,
  createProduct,
  getOrCreateProductByGtin,
} from '$lib/server/queries/products'
import { db } from '$lib/server/db'
import { places, storages, locations } from '@stoqr/db'
import { eq } from 'drizzle-orm'

export const GET: RequestHandler = async ({ locals, url }) => {
  if (!locals.user) {
    return json({ error: 'Unauthorized' }, { status: 401 })
  }

  const placeId = url.searchParams.get('placeId') ?? undefined
  const status = url.searchParams.get('status') ?? undefined

  const items = await getInventoryItems(locals.user.id, { placeId, status })
  return json(items)
}

export const POST: RequestHandler = async ({ locals, request }) => {
  if (!locals.user) {
    return json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const {
    productId,
    productName,
    gtin,
    placeId,
    quantity,
    unit,
    bestBeforeDate,
    notes,
  } = body

  if (!quantity || !unit) {
    return json({ error: 'quantity and unit are required' }, { status: 400 })
  }

  // Resolve productId — create product if only a name (and optional GTIN) given
  let resolvedProductId: string = productId

  if (!resolvedProductId) {
    if (!productName) {
      return json({ error: 'productId or productName is required' }, { status: 400 })
    }

    // When a GTIN is supplied, reuse an existing product record to avoid duplicates
    if (gtin) {
      const existing = await getOrCreateProductByGtin(gtin)
      if (existing) {
        resolvedProductId = existing.id
      }
    }

    if (!resolvedProductId) {
      resolvedProductId = await createProduct({
        name: productName,
        gtin: gtin ?? undefined,
        defaultUnit: unit,
        createdBy: locals.user.id,
      })
    }
  }

  // When placeId is provided, verify it belongs to the authenticated user
  if (placeId) {
    const [placeRow] = await db
      .select({ locationUserId: locations.userId })
      .from(places)
      .innerJoin(storages, eq(places.storageId, storages.id))
      .innerJoin(locations, eq(storages.locationId, locations.id))
      .where(eq(places.id, placeId))

    if (!placeRow || placeRow.locationUserId !== locals.user.id) {
      return json({ error: 'Place not found' }, { status: 404 })
    }
  }

  const item = await createInventoryItem({
    productId: resolvedProductId,
    userId: locals.user.id,
    placeId: placeId ?? undefined,
    quantity,
    unit,
    bestBeforeDate: bestBeforeDate ?? undefined,
    notes: notes ?? undefined,
  })

  return json(item, { status: 201 })
}
