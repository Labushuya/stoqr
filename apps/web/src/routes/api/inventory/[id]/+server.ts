import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import {
  getInventoryItem,
  updateInventoryItem,
  deleteInventoryItem,
} from '$lib/server/queries/products'

export const GET: RequestHandler = async ({ locals, params }) => {
  if (!locals.user) {
    return json({ error: 'Unauthorized' }, { status: 401 })
  }

  const item = await getInventoryItem(params.id, locals.user.id)
  if (!item) {
    return json({ error: 'Not found' }, { status: 404 })
  }

  return json(item)
}

export const PATCH: RequestHandler = async ({ locals, params, request }) => {
  if (!locals.user) {
    return json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const {
    quantity,
    unit,
    bestBeforeDate,
    purchaseDate,
    placeId,
    storeId,
    notes,
    status,
    openedAt,
    openedExpiryDays,
    purchasePriceCt,
    lotNumber,
    weightG,
    volumeMl,
  } = body

  const patch: Parameters<typeof updateInventoryItem>[2] = {}
  if (quantity !== undefined) patch.quantity = quantity
  if (unit !== undefined) patch.unit = unit
  if (bestBeforeDate !== undefined) patch.bestBeforeDate = bestBeforeDate
  if (purchaseDate !== undefined) patch.purchaseDate = purchaseDate
  if (placeId !== undefined) patch.placeId = placeId
  if (storeId !== undefined) patch.storeId = storeId
  if (notes !== undefined) patch.notes = notes
  if (status !== undefined) patch.status = status
  if (openedAt !== undefined) patch.openedAt = openedAt ? new Date(openedAt) : null
  if (openedExpiryDays !== undefined) patch.openedExpiryDays = openedExpiryDays
  if (purchasePriceCt !== undefined) patch.purchasePriceCt = purchasePriceCt
  if (lotNumber !== undefined) patch.lotNumber = lotNumber
  if (weightG !== undefined) patch.weightG = weightG
  if (volumeMl !== undefined) patch.volumeMl = volumeMl

  if (Object.keys(patch).length === 0) {
    return json({ error: 'No fields to update' }, { status: 400 })
  }

  const updated = await updateInventoryItem(params.id, locals.user.id, patch)
  if (!updated) {
    return json({ error: 'Not found' }, { status: 404 })
  }

  return json(updated)
}

export const DELETE: RequestHandler = async ({ locals, params }) => {
  if (!locals.user) {
    return json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Soft delete: sets status → 'discarded'
  const discarded = await deleteInventoryItem(params.id, locals.user.id)
  if (!discarded) {
    return json({ error: 'Not found' }, { status: 404 })
  }

  return new Response(null, { status: 204 })
}
