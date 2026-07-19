import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { db } from '$lib/server/db'
import { stores, products } from '@stoqr/db'
import { eq, and, inArray } from 'drizzle-orm'
import { requireHouseholdId } from '$lib/server/queries/households'
import { writeAudit } from '$lib/server/queries/audit'
import { recordProposedPrice } from '$lib/server/queries/prices'
import { suggestStockUnitForProduct } from '$lib/server/queries/products'
import { scrapeGlobusPrice, isPriceScrapeEnabled, resolveScrapeUrl } from '$lib/server/scrape/globus'
import { listProductIdsForStore } from '$lib/server/queries/product-stores'

// ---------------------------------------------------------------------------
// POST /api/stores/[id]/prices/fetch-all  — Sammel-Abruf je Markt (F2/G2)
//
// Failsafe: sequenziell + Rate-Limit (Sleep), jeder Artikel isoliert
// (try/catch → failed++, nie Abbruch), immer 200 (ausser Auth/Guard).
// Abruf-URL je Artikel = store.scrapeUrl-Vorlage mit {EAN} → products.gtin.
// Artikel ohne aufloesbare URL (z.B. ohne EAN bei {EAN}-Vorlage) → skipped.
// ---------------------------------------------------------------------------

const RATE_LIMIT_MS = 800

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export const POST: RequestHandler = async ({ locals, params }) => {
  if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 })

  const householdId = await requireHouseholdId(locals.user.id)
  if (!(await isPriceScrapeEnabled(householdId))) {
    return json({ error: 'Online-Preis-Abruf ist deaktiviert' }, { status: 403 })
  }

  const [store] = await db
    .select({ id: stores.id, scrapeUrl: stores.scrapeUrl })
    .from(stores)
    .where(and(eq(stores.id, params.id), eq(stores.householdId, householdId)))
  if (!store) return json({ error: 'Markt nicht gefunden' }, { status: 404 })
  if (!store.scrapeUrl) {
    return json({ error: 'Für diesen Markt ist keine Abruf-URL hinterlegt' }, { status: 400 })
  }

  const productIds = await listProductIdsForStore(store.id, householdId)
  const prodRows = productIds.length
    ? await db
        .select({ id: products.id, defaultUnit: products.defaultUnit, gtin: products.gtin })
        .from(products)
        .where(inArray(products.id, productIds))
    : []

  let proposedCreated = 0
  let skipped = 0
  let failed = 0

  for (let i = 0; i < prodRows.length; i++) {
    const p = prodRows[i]
    const url = resolveScrapeUrl(store, p.gtin)
    if (!url || !p.gtin) {
      // Keine aufloesbare URL oder keine EAN am Artikel.
      skipped++
      continue
    }
    try {
      if (i > 0) await sleep(RATE_LIMIT_MS)
      const parsed = await scrapeGlobusPrice(url, p.gtin)
      if (!parsed) {
        skipped++
        continue
      }
      // Einheit: haeufigste Bestands-Einheit → defaultUnit → 'piece'.
      const stockUnit = await suggestStockUnitForProduct(p.id, householdId)
      const row = await recordProposedPrice({
        householdId,
        productId: p.id,
        storeId: store.id,
        priceCt: parsed.priceCt,
        unit: stockUnit ?? p.defaultUnit ?? 'piece',
        createdBy: locals.user.id,
      })
      proposedCreated++
      await writeAudit({
        householdId,
        userId: locals.user.id,
        action: 'INSERT',
        tableName: 'product_prices',
        recordId: row.id,
        newValues: {
          status: 'proposed',
          source: 'online',
          priceCt: row.priceCt,
          unit: row.unit,
          storeId: store.id,
        },
      })
    } catch (err) {
      console.error('[prices/fetch-all] Artikel fehlgeschlagen', p.id, err)
      failed++
    }
  }

  return json({ requested: prodRows.length, proposedCreated, skipped, failed })
}
