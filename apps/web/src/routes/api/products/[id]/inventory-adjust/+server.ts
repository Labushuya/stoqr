import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { requireHouseholdId, getUnits } from '$lib/server/queries/households'
import { listInventoryForProduct, updateInventoryItem } from '$lib/server/queries/products'
import { generateAutoNeeds } from '$lib/server/queries/shopping-list'
import { writeAudit } from '$lib/server/queries/audit'
import { buildUnitMetaMap, planInventoryAdjustment, resolveUnitMeta, buildPackSize } from '$lib/utils/stock'
import { db } from '$lib/server/db'
import { products } from '@stoqr/db'
import { eq } from 'drizzle-orm'

// ---------------------------------------------------------------------------
// POST /api/products/:id/inventory-adjust  { newQuantity, unit }
//
// Bestandskorrektur/Inventur pro Artikel: setzt den tatsächlichen Gesamtbestand
// der Dimension/Einheit von `unit`. Reduktion wird FIFO auf die Bestände verteilt.
// Aufstocken (neuer Ist > aktuell) wird NICHT automatisch gemacht (needsIncrease).
// Danach wird der auto-Bedarf neu berechnet.
// ---------------------------------------------------------------------------

export const POST: RequestHandler = async ({ locals, params, request }) => {
  if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const householdId = await requireHouseholdId(locals.user.id)
    const body = await request.json()
    const unit = typeof body?.unit === 'string' ? body.unit.trim() : ''
    const newQuantity = Number(body?.newQuantity)

    if (!unit) return json({ error: 'unit ist erforderlich' }, { status: 400 })
    if (!Number.isFinite(newQuantity) || newQuantity < 0) {
      return json({ error: 'newQuantity muss eine Zahl >= 0 sein' }, { status: 400 })
    }

    const [items, units, product] = await Promise.all([
      listInventoryForProduct(params.id, householdId),
      getUnits(householdId),
      db.query.products.findFirst({
        where: eq(products.id, params.id),
        columns: { defaultUnit: true, defaultVolumeMl: true, defaultWeightG: true },
      }),
    ])
    const metaMap = buildUnitMetaMap(units)
    const packSize = product ? buildPackSize(product) : undefined
    const meta = resolveUnitMeta(unit, metaMap, packSize)
    const newTotalInBase = newQuantity * meta.toBaseFactor

    const plan = planInventoryAdjustment(
      items.map((i) => ({
        id: i.id,
        quantity: i.quantity,
        unit: i.unit,
        status: i.status,
        bestBeforeDate: i.bestBeforeDate,
      })),
      newTotalInBase,
      { dimension: meta.dimension, symbol: meta.symbol },
      metaMap,
      packSize
    )

    // Reduktions-Updates anwenden.
    for (const u of plan.updates) {
      await updateInventoryItem(u.id, householdId, { quantity: u.newQuantity })
    }

    // Bedarf neu berechnen (auto-Einträge aktualisieren).
    await generateAutoNeeds(householdId)

    // Audit-Log: EIN zusammenfassender Eintrag pro Bestandskorrektur (statt
    // eines Eintrags je FIFO-berührtem Item), da die Korrektur fachlich eine
    // einzige Aktion auf den Produkt-Gesamtbestand ist. recordId = productId.
    await writeAudit({
      householdId,
      userId: locals.user.id,
      action: 'UPDATE',
      tableName: 'inventory_items',
      recordId: params.id,
      newValues: {
        adjustedTo: newQuantity,
        unit,
        itemsTouched: plan.updates.length,
      },
    })

    return json({
      ok: true,
      applied: plan.updates.length,
      needsIncrease: plan.needsIncrease,
      shortfallInBase: plan.shortfallInBase,
    })
  } catch (err) {
    console.error('[POST /api/products/[id]/inventory-adjust]', err)
    return json({ error: 'Fehler bei der Bestandskorrektur' }, { status: 500 })
  }
}
