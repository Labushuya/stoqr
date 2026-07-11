import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import {
  getInventoryItem,
  updateInventoryItem,
  deleteInventoryItem,
} from '$lib/server/queries/products'
import { requireHouseholdId } from '$lib/server/queries/households'
import { db } from '$lib/server/db'
import { products } from '@stoqr/db'
import { eq } from 'drizzle-orm'

export const GET: RequestHandler = async ({ locals, params }) => {
  if (!locals.user) {
    return json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const householdId = await requireHouseholdId(locals.user.id)
    const item = await getInventoryItem(params.id, householdId)
    if (!item) return json({ error: 'Not found' }, { status: 404 })
    return json(item)
  } catch (err) {
    console.error('[GET /api/inventory/[id]]', err)
    return json({ error: 'Interner Fehler' }, { status: 500 })
  }
}

export const PATCH: RequestHandler = async ({ locals, params, request }) => {
  if (!locals.user) {
    return json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const householdId = await requireHouseholdId(locals.user.id)
    const body = await request.json()
    const {
      productName, quantity, unit, bestBeforeDate, purchaseDate, placeId, storeId,
      notes, status, openedAt, openedExpiryDays, purchasePriceCt,
      lotNumber, weightG, volumeMl, categoryId,
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

    if (Object.keys(patch).length === 0 && categoryId === undefined && !productName) {
      return json({ error: 'Keine Felder zum Aktualisieren' }, { status: 400 })
    }

    const updated = await updateInventoryItem(params.id, householdId, patch)
    if (!updated) return json({ error: 'Not found' }, { status: 404 })

    // Update product name and/or category if provided
    if (productName || categoryId !== undefined) {
      const itemForProduct = await getInventoryItem(params.id, householdId)
      if (itemForProduct?.productId) {
        const productPatch: Record<string, unknown> = {}
        if (productName) productPatch.name = productName
        if (categoryId !== undefined) productPatch.categoryId = categoryId || null
        if (Object.keys(productPatch).length > 0) {
          await db.update(products)
            .set(productPatch)
            .where(eq(products.id, itemForProduct.productId))
        }
      }
    }


    return json(updated)
  } catch (err) {
    console.error('[PATCH /api/inventory/[id]]', err)
    return json({ error: 'Fehler beim Speichern. Bitte erneut versuchen.' }, { status: 500 })
  }
}

export const DELETE: RequestHandler = async ({ locals, params }) => {
  if (!locals.user) {
    return json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const householdId = await requireHouseholdId(locals.user.id)
    const deleted = await deleteInventoryItem(params.id, householdId)
    if (!deleted) return json({ error: 'Not found' }, { status: 404 })
    return new Response(null, { status: 204 })
  } catch (err) {
    console.error('[DELETE /api/inventory/[id]]', err)
    return json({ error: 'Fehler beim Löschen' }, { status: 500 })
  }
}
