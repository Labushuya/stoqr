import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { db } from '$lib/server/db'
import { stores, products, productStores } from '@stoqr/db'
import { eq, and, isNotNull } from 'drizzle-orm'
import { requireHouseholdId } from '$lib/server/queries/households'
import { writeAudit } from '$lib/server/queries/audit'
import { recordSnapshot } from '$lib/server/queries/globus-snapshots'
import { downloadCatalogImage } from '$lib/server/media'
import { scrapeGlobusSnapshot, isPriceScrapeEnabled, resolveScrapeUrl } from '$lib/server/scrape/globus'

// ---------------------------------------------------------------------------
// POST /api/catalog/sync — Globus-Katalog-Sicherung (G7)
//
// Geht sequenziell + rate-limitiert alle Artikel mit EAN durch, die einem Markt
// mit Abruf-URL zugeordnet sind. Je Treffer: Bild laden (failsafe) + Snapshot
// als 'proposed' anlegen (nur bei Aenderung). Failsafe: jeder Artikel isoliert
// (try/catch), immer 200. Struktur-Check: EANs vorhanden, aber 0 Treffer gesamt
// → structureWarning (Globus-Format evtl. geaendert).
// ---------------------------------------------------------------------------

const RATE_LIMIT_MS = 800

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export const POST: RequestHandler = async ({ locals }) => {
  if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 })

  const householdId = await requireHouseholdId(locals.user.id)
  if (!(await isPriceScrapeEnabled(householdId))) {
    return json({ error: 'Online-Preis-Abruf ist deaktiviert' }, { status: 403 })
  }

  // Alle (Artikel, Markt)-Paare des Haushalts, bei denen der Markt eine Abruf-URL
  // hat und der Artikel eine EAN — die Kandidaten fuer den Katalog-Abruf.
  const rows = await db
    .select({
      productId: products.id,
      gtin: products.gtin,
      storeId: stores.id,
      scrapeUrl: stores.scrapeUrl,
    })
    .from(productStores)
    .innerJoin(products, eq(productStores.productId, products.id))
    .innerJoin(stores, eq(productStores.storeId, stores.id))
    .where(
      and(
        eq(productStores.householdId, householdId),
        isNotNull(products.gtin),
        isNotNull(stores.scrapeUrl)
      )
    )

  let proposedCreated = 0
  let unchanged = 0
  let skipped = 0
  let failed = 0
  let totalHits = 0

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]
    const url = resolveScrapeUrl({ scrapeUrl: r.scrapeUrl }, r.gtin)
    if (!url || !r.gtin) {
      skipped++
      continue
    }
    try {
      if (i > 0) await sleep(RATE_LIMIT_MS)
      const { product: hit, totalHits: hits } = await scrapeGlobusSnapshot(url, r.gtin)
      totalHits += hits
      if (!hit) {
        skipped++
        continue
      }
      const localImagePath = await downloadCatalogImage(householdId, r.gtin, hit.imageUrl)
      const result = await recordSnapshot({
        householdId,
        productId: r.productId,
        storeId: r.storeId,
        gtin: hit.ean,
        name: hit.name,
        category: hit.category,
        priceCt: hit.priceCt,
        currency: hit.currency,
        imageRemoteUrl: hit.imageUrl,
        localImagePath,
        rawJson: hit.raw,
        createdBy: locals.user.id,
      })
      if (result.changed && result.row) {
        proposedCreated++
        await writeAudit({
          householdId,
          userId: locals.user.id,
          action: 'INSERT',
          tableName: 'globus_snapshots',
          recordId: result.row.id,
          newValues: { status: 'proposed', gtin: hit.ean, name: hit.name, priceCt: hit.priceCt },
        })
      } else {
        unchanged++
      }
    } catch (err) {
      console.error('[catalog/sync] Artikel fehlgeschlagen', r.gtin, err)
      failed++
    }
  }

  // Struktur-Check: Kandidaten vorhanden, aber Globus lieferte NIRGENDS Treffer.
  const structureWarning = rows.length > 0 && totalHits === 0

  return json({ requested: rows.length, proposedCreated, unchanged, skipped, failed, structureWarning })
}
