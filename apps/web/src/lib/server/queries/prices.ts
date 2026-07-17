import { db } from '$lib/server/db'
import { productPrices } from '@stoqr/db'
import { and, eq, desc, inArray } from 'drizzle-orm'

// ---------------------------------------------------------------------------
// Preise je Artikel+Markt mit Historie (Block F / M3)
//
// Append-only: jede Erfassung ist ein neuer Eintrag. Genau EINER je
// (productId, storeId, householdId) traegt isCurrent=true = massgeblicher Preis
// fuers Estimate. Ein reduzierter Preis (isReduced) wird nur dann isCurrent,
// wenn er ausdruecklich als Dauerpreis uebernommen wird (makePermanent).
// ---------------------------------------------------------------------------

export type PriceSource = 'manual' | 'booked' | 'online'

export interface RecordPriceInput {
  householdId: string
  productId: string
  storeId: string
  priceCt: number
  unit: string
  isReduced?: boolean
  makePermanent?: boolean
  source: PriceSource
  note?: string | null
  createdBy?: string | null
}

/**
 * Schreibt einen Preis-Eintrag. Setzt isCurrent transaktional: ein regulaerer
 * Preis (oder ein als Dauerpreis uebernommener reduzierter) wird der neue
 * massgebliche Preis; der bisherige isCurrent-Eintrag wird zurueckgesetzt
 * (raeumt den partiellen Unique-Index).
 */
export async function recordPrice(input: RecordPriceInput) {
  const willBeCurrent = !input.isReduced || input.makePermanent === true
  return db.transaction(async (tx) => {
    if (willBeCurrent) {
      await tx
        .update(productPrices)
        .set({ isCurrent: false })
        .where(
          and(
            eq(productPrices.productId, input.productId),
            eq(productPrices.storeId, input.storeId),
            eq(productPrices.householdId, input.householdId),
            eq(productPrices.isCurrent, true),
          ),
        )
    }
    const [row] = await tx
      .insert(productPrices)
      .values({
        householdId: input.householdId,
        productId: input.productId,
        storeId: input.storeId,
        priceCt: input.priceCt,
        unit: input.unit,
        isReduced: input.isReduced ?? false,
        isCurrent: willBeCurrent,
        source: input.source,
        note: input.note ?? null,
        createdBy: input.createdBy ?? null,
      })
      .returning()
    return row
  })
}

/** Aktueller (massgeblicher) Preis fuer (Artikel, Markt) oder null. */
export async function getCurrentPrice(productId: string, storeId: string, householdId: string) {
  const row = await db.query.productPrices.findFirst({
    where: (p, { and, eq }) =>
      and(
        eq(p.productId, productId),
        eq(p.storeId, storeId),
        eq(p.householdId, householdId),
        eq(p.isCurrent, true),
      ),
  })
  return row ?? null
}

/**
 * Aktuelle Preise mehrerer Artikel fuer EINEN Markt (Batch, fuers Run-Estimate).
 * Liefert Map<productId, PriceRow>.
 */
export async function getCurrentPricesForProducts(
  productIds: string[],
  storeId: string,
  householdId: string,
) {
  const map = new Map<string, typeof productPrices.$inferSelect>()
  if (productIds.length === 0) return map
  const rows = await db
    .select()
    .from(productPrices)
    .where(
      and(
        eq(productPrices.householdId, householdId),
        eq(productPrices.storeId, storeId),
        eq(productPrices.isCurrent, true),
        inArray(productPrices.productId, productIds),
      ),
    )
  for (const r of rows) map.set(r.productId, r)
  return map
}

/** Alle aktuellen Preise eines Artikels ueber alle Maerkte (Detailseite-Card). */
export async function getCurrentPricesForProductAllStores(productId: string, householdId: string) {
  return db.query.productPrices.findMany({
    where: (p, { and, eq }) =>
      and(eq(p.productId, productId), eq(p.householdId, householdId), eq(p.isCurrent, true)),
    with: { store: { columns: { id: true, name: true, chain: true } } },
  })
}

/**
 * Aktuelle Preise (alle Maerkte) mehrerer Listen-Produkte — fuer die client-reaktive
 * Einkaufslisten-Schaetzung. Liefert flache Row-Liste (Client gruppiert nach store/product).
 */
export async function getCurrentPricesForListProducts(householdId: string, productIds: string[]) {
  if (productIds.length === 0) return []
  return db
    .select({
      productId: productPrices.productId,
      storeId: productPrices.storeId,
      priceCt: productPrices.priceCt,
      unit: productPrices.unit,
      isReduced: productPrices.isReduced,
    })
    .from(productPrices)
    .where(
      and(
        eq(productPrices.householdId, householdId),
        eq(productPrices.isCurrent, true),
        inArray(productPrices.productId, productIds),
      ),
    )
}

/** Preis-Historie eines Artikels (alle Maerkte), neueste zuerst. */
export async function listPriceHistory(
  productId: string,
  householdId: string,
  opts?: { limit?: number },
) {
  const limit = Math.min(Math.max(opts?.limit ?? 50, 1), 200)
  return db.query.productPrices.findMany({
    where: (p, { and, eq }) => and(eq(p.productId, productId), eq(p.householdId, householdId)),
    orderBy: [desc(productPrices.recordedAt)],
    limit,
    with: { store: { columns: { id: true, name: true, chain: true } } },
  })
}
