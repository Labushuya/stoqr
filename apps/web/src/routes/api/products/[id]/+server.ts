import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { deleteProduct } from '$lib/server/queries/products'
import { requireHouseholdId } from '$lib/server/queries/households'
import { db } from '$lib/server/db'

/**
 * DELETE /api/products/:id
 *
 * Hard-deletes a product from the catalog.
 * Guards: product must have no active inventory items for the current household.
 * Products that are referenced by other households' inventory are not blocked —
 * those foreign-key rows will be handled by the DB cascade (inventoryItems
 * has no FK to products by design; they hold a productId but products are
 * shared across households).
 *
 * The caller (UI) is responsible for showing a confirmation dialog.
 */
export const DELETE: RequestHandler = async ({ locals, params }) => {
  if (!locals.user) {
    return json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const householdId = await requireHouseholdId(locals.user.id)

    const activeItem = await db.query.inventoryItems.findFirst({
      where: (item, { and, eq }) =>
        and(eq(item.productId, params.id), eq(item.householdId, householdId)),
      columns: { id: true },
    })

    if (activeItem) {
      return json(
        { error: 'Produkt hat noch Bestandseinträge. Bitte zuerst alle Einträge entfernen.' },
        { status: 409 }
      )
    }

    const deleted = await deleteProduct(params.id)
    if (!deleted) return json({ error: 'Not found' }, { status: 404 })

    return new Response(null, { status: 204 })
  } catch (err) {
    console.error('[DELETE /api/products/[id]]', err)
    return json({ error: 'Fehler beim Löschen des Produkts' }, { status: 500 })
  }
}
