import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { deleteProduct, updateProduct, getProductById } from '$lib/server/queries/products'
import { requireHouseholdId } from '$lib/server/queries/households'
import { writeAudit } from '$lib/server/queries/audit'
import { db } from '$lib/server/db'

/**
 * PATCH /api/products/:id
 *
 * Updates an article's master data (name, description, category, default unit,
 * notes). Products are global/shared across households, so no household scoping
 * on the row itself — auth is still required.
 */
export const PATCH: RequestHandler = async ({ locals, params, request }) => {
  if (!locals.user) {
    return json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    // Enforce the caller belongs to a household (consistent with other routes)
    const householdId = await requireHouseholdId(locals.user.id)

    const body = await request.json()
    const { name, description, notes, categoryId, defaultUnit, gtin } = body as {
      name?: string
      description?: string | null
      notes?: string | null
      categoryId?: string | null
      defaultUnit?: string
      gtin?: string | null
    }

    const patch: Parameters<typeof updateProduct>[1] = {}
    if (name !== undefined) patch.name = name
    if (description !== undefined) patch.description = description
    if (notes !== undefined) patch.notes = notes
    if (categoryId !== undefined) patch.categoryId = categoryId || null
    if (defaultUnit !== undefined) patch.defaultUnit = defaultUnit
    // EAN/GTIN: leerer String → null (Feld leeren)
    if (gtin !== undefined) patch.gtin = gtin ? String(gtin).trim() : null

    if (Object.keys(patch).length === 0) {
      return json({ error: 'Keine Felder zum Aktualisieren' }, { status: 400 })
    }

    // Vorher-Zustand fuer Audit-Diff (nur die potenziell geaenderten Felder)
    const before = await getProductById(params.id)

    const updated = await updateProduct(params.id, patch)
    if (!updated) return json({ error: 'Not found' }, { status: 404 })

    // Return the full product (with category) for optimistic UI updates
    const product = await getProductById(params.id)

    const auditKeys = Object.keys(patch)
    const beforeRow = before as Record<string, unknown> | null
    await writeAudit({
      householdId,
      userId: locals.user.id,
      action: 'UPDATE',
      tableName: 'products',
      recordId: params.id,
      oldValues: beforeRow ? Object.fromEntries(auditKeys.map((k) => [k, beforeRow[k]])) : null,
      newValues: patch as Record<string, unknown>,
    })

    return json(product ?? updated)
  } catch (err) {
    // Unique-Konflikt auf gtin → verstaendliche Meldung
    if (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === '23505') {
      return json({ error: 'Diese EAN ist bereits einem anderen Artikel zugeordnet.' }, { status: 409 })
    }
    console.error('[PATCH /api/products/[id]]', err)
    return json({ error: 'Fehler beim Speichern des Artikels' }, { status: 500 })
  }
}

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

    const before = await getProductById(params.id)

    const deleted = await deleteProduct(params.id)
    if (!deleted) return json({ error: 'Not found' }, { status: 404 })

    const beforeRow = before as Record<string, unknown> | null
    await writeAudit({
      householdId,
      userId: locals.user.id,
      action: 'DELETE',
      tableName: 'products',
      recordId: params.id,
      oldValues: beforeRow ? { name: beforeRow.name, gtin: beforeRow.gtin } : null,
    })

    return new Response(null, { status: 204 })
  } catch (err) {
    console.error('[DELETE /api/products/[id]]', err)
    return json({ error: 'Fehler beim Löschen des Produkts' }, { status: 500 })
  }
}
