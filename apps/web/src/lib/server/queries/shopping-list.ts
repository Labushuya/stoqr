import { db } from '$lib/server/db'
import { shoppingListItems } from '@stoqr/db'
import { and, eq, asc, desc } from 'drizzle-orm'
import { getStockTargets } from './stock-targets'
import { getProductStockTotals } from './products'
import { listStoresForProduct } from './product-stores'
import { getUnits } from './households'
import { buildUnitMetaMap, compareToTarget } from '$lib/utils/stock'

// ---------------------------------------------------------------------------
// Einkaufsliste (shopping_list_items). auto-Einträge = „virtuelle Bestände"
// aus dem Soll-Ist-Bedarf; manuelle Einträge frei per Freitext.
// ---------------------------------------------------------------------------

export async function getShoppingList(householdId: string) {
  return db.query.shoppingListItems.findMany({
    where: (s, { eq }) => eq(s.householdId, householdId),
    orderBy: [asc(shoppingListItems.isChecked), desc(shoppingListItems.priority), asc(shoppingListItems.createdAt)],
    with: {
      product: { columns: { id: true, name: true } },
      preferredStore: { columns: { id: true, name: true } },
    },
  })
}

export async function addManualItem(input: {
  householdId: string
  freeTextName: string
  quantity?: number | string
  unit?: string
  notes?: string | null
}) {
  const [row] = await db
    .insert(shoppingListItems)
    .values({
      householdId: input.householdId,
      freeTextName: input.freeTextName,
      quantity: input.quantity != null ? String(input.quantity) : '1',
      unit: input.unit ?? 'piece',
      source: 'manual',
      notes: input.notes ?? null,
    })
    .returning()
  return row
}

export async function updateShoppingItem(
  id: string,
  householdId: string,
  data: Partial<{ isChecked: boolean; quantity: number | string; unit: string; notes: string | null }>
) {
  const patch: Record<string, unknown> = { updatedAt: new Date() }
  if (data.isChecked !== undefined) {
    patch.isChecked = data.isChecked
    patch.checkedAt = data.isChecked ? new Date() : null
  }
  if (data.quantity !== undefined) patch.quantity = String(data.quantity)
  if (data.unit !== undefined) patch.unit = data.unit
  if (data.notes !== undefined) patch.notes = data.notes

  const [row] = await db
    .update(shoppingListItems)
    .set(patch)
    .where(and(eq(shoppingListItems.id, id), eq(shoppingListItems.householdId, householdId)))
    .returning()
  return row ?? null
}

export async function deleteShoppingItem(id: string, householdId: string) {
  const [row] = await db
    .delete(shoppingListItems)
    .where(and(eq(shoppingListItems.id, id), eq(shoppingListItems.householdId, householdId)))
    .returning({ id: shoppingListItems.id })
  return { deleted: !!row }
}

/**
 * Erzeugt/aktualisiert auto-Bedarf-Einträge aus dem Soll-Ist-Vergleich.
 * Pro Artikel max. EIN offener auto-Eintrag (Dedup). Fehlmenge = Soll − Ist (in Soll-Einheit).
 * Gedeckte Artikel: offenen auto-Eintrag entfernen. Abgehakte auto-Einträge werden nicht angefasst.
 * not_comparable / needsIncrease-Fälle werden übersprungen.
 */
export async function generateAutoNeeds(householdId: string): Promise<{ created: number; updated: number; removed: number }> {
  const [targets, units] = await Promise.all([getStockTargets(householdId), getUnits(householdId)])
  const metaMap = buildUnitMetaMap(units)

  // Bestehende offene auto-Einträge (nicht abgehakt), gekeyed nach (productId|storeId).
  const existing = await db.query.shoppingListItems.findMany({
    where: (s, { and, eq }) =>
      and(eq(s.householdId, householdId), eq(s.source, 'auto'), eq(s.isChecked, false)),
  })
  const key = (productId: string | null, storeId: string | null) => `${productId ?? ''}::${storeId ?? ''}`
  const openByKey = new Map<string, (typeof existing)[number]>()
  for (const e of existing) openByKey.set(key(e.productId, e.preferredStoreId), e)
  // Alle offenen auto-Einträge, die in diesem Lauf bestätigt werden — der Rest wird bereinigt.
  const stillNeeded = new Set<string>()

  let created = 0
  let updated = 0
  let removed = 0

  for (const t of targets) {
    const totals = await getProductStockTotals(t.productId, householdId)
    const cmp = compareToTarget(
      totals,
      { targetQuantity: t.targetQuantity, unit: t.unit, minQuantity: t.minQuantity },
      metaMap
    )

    // Kein sinnvoller Bedarf → alle offenen auto-Einträge dieses Artikels laufen aus.
    if (cmp.status === 'not_comparable' || cmp.status === 'ok') continue

    const meta = metaMap.get(t.unit)
    const factor = meta ? meta.toBaseFactor : 1
    const shortfallInBase = cmp.targetInBase - cmp.currentInBase
    const qty = shortfallInBase / (factor || 1)
    if (qty <= 0) continue

    // Zielmärkte: alle zugeordneten Märkte des Artikels (M:N); ohne Zuordnung → ein Eintrag ohne Markt.
    const storeRows = await listStoresForProduct(t.productId, householdId)
    const storeIds: (string | null)[] = storeRows.length > 0 ? storeRows.map((r) => r.storeId) : [null]

    for (const storeId of storeIds) {
      const k = key(t.productId, storeId)
      stillNeeded.add(k)
      const open = openByKey.get(k)
      if (open) {
        await db
          .update(shoppingListItems)
          .set({ quantity: String(qty), unit: t.unit, updatedAt: new Date() })
          .where(eq(shoppingListItems.id, open.id))
        updated++
      } else {
        await db.insert(shoppingListItems).values({
          householdId,
          productId: t.productId,
          quantity: String(qty),
          unit: t.unit,
          source: 'auto',
          preferredStoreId: storeId,
        })
        created++
      }
    }
  }

  // Verwaiste offene auto-Einträge entfernen (Bedarf gedeckt / Markt-Zuordnung geändert).
  for (const [k, item] of openByKey) {
    if (!stillNeeded.has(k)) {
      await db.delete(shoppingListItems).where(eq(shoppingListItems.id, item.id))
      removed++
    }
  }

  return { created, updated, removed }
}
