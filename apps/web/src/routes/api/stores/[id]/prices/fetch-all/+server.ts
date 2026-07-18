import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { db } from '$lib/server/db'
import { stores, products } from '@stoqr/db'
import { eq, and, inArray } from 'drizzle-orm'
import { requireHouseholdId } from '$lib/server/queries/households'
import { writeAudit } from '$lib/server/queries/audit'
import { recordProposedPrice } from '$lib/server/queries/prices'
import { scrapeGlobusPrice, isPriceScrapeEnabled } from '$lib/server/scrape/globus'
import { listProductIdsForStore } from '$lib/server/queries/product-stores'

// ---------------------------------------------------------------------------
// POST /api/stores/[id]/prices/fetch-all  — Sammel-Abruf je Markt (F2)
//
// Failsafe/Gerüst: sequenziell + Rate-Limit (Sleep), jeder Artikel isoliert
// (try/catch → failed++, nie Abbruch), immer 200 (ausser Auth/Guard).
//
// Realitäts-Grenze: stores.scrapeUrl ist EINE URL je Markt. Ohne artikel-
// spezifische URL-Vorlage ist pro Artikel keine eigene Produkt-URL auflösbar
// → solche Artikel werden „skipped" gezählt (kein Silent-Cap; Aggregat sichtbar).
// Ein späterer Block ergänzt eine artikelspezifische URL (z.B. product_stores.scrapeUrl),
// dann liefert resolveArticleUrl() echte URLs.
// ---------------------------------------------------------------------------

const RATE_LIMIT_MS = 800

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Ermittelt die Produkt-URL für einen Artikel an diesem Markt. Aktuell existiert
 * nur die markt-weite stores.scrapeUrl (keine artikel-spezifische) → null, d.h.
 * bis eine artikelspezifische URL-Vorlage existiert, wird jeder Artikel „skipped".
 * Sobald ein product_stores.scrapeUrl-Feld existiert, wird es hier aufgelöst.
 */
function resolveArticleUrl(productId: string, storeScrapeUrl: string): string | null {
  // Platzhalter für die spätere artikelspezifische Auflösung (F2-Folge-Block).
  void productId
  void storeScrapeUrl
  return null
}

export const POST: RequestHandler = async ({ locals, params }) => {
  if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 })
  if (!isPriceScrapeEnabled()) {
    return json({ error: 'Online-Preis-Abruf ist deaktiviert' }, { status: 403 })
  }

  const householdId = await requireHouseholdId(locals.user.id)

  const [store] = await db
    .select({ id: stores.id, scrapeUrl: stores.scrapeUrl })
    .from(stores)
    .where(and(eq(stores.id, params.id), eq(stores.householdId, householdId)))
  if (!store) return json({ error: 'Markt nicht gefunden' }, { status: 404 })
  if (!store.scrapeUrl) {
    return json({ error: 'Für diesen Markt ist keine Abruf-URL hinterlegt' }, { status: 400 })
  }

  const productIds = await listProductIdsForStore(store.id, householdId)
  const unitRows = productIds.length
    ? await db
        .select({ id: products.id, defaultUnit: products.defaultUnit })
        .from(products)
        .where(inArray(products.id, productIds))
    : []
  const unitOf = new Map(unitRows.map((r) => [r.id, r.defaultUnit ?? 'piece']))

  let proposedCreated = 0
  let skipped = 0
  let failed = 0

  for (let i = 0; i < productIds.length; i++) {
    const productId = productIds[i]
    const url = resolveArticleUrl(productId, store.scrapeUrl)
    if (!url) {
      skipped++
      continue
    }
    try {
      if (i > 0) await sleep(RATE_LIMIT_MS)
      const parsed = await scrapeGlobusPrice(url)
      if (!parsed) {
        skipped++
        continue
      }
      const row = await recordProposedPrice({
        householdId,
        productId,
        storeId: store.id,
        priceCt: parsed.priceCt,
        unit: unitOf.get(productId) ?? 'piece',
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
      console.error('[prices/fetch-all] Artikel fehlgeschlagen', productId, err)
      failed++
    }
  }

  return json({ requested: productIds.length, proposedCreated, skipped, failed })
}
