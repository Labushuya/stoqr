import { db } from '$lib/server/db'
import { globusSnapshots, products, categories, inventoryItems, productStores } from '@stoqr/db'
import { and, eq, desc } from 'drizzle-orm'
import { snapshotDiffers, type SnapshotComparable } from '$lib/utils/snapshot-diff'
import { computeMirrorDiff, type MirrorDiff } from '$lib/utils/mirror-diff'
import { updateProduct, createProduct, suggestStockUnitForProduct, setFieldSources, type ProductField } from '$lib/server/queries/products'
import { recordProposedPrice } from '$lib/server/queries/prices'

export { snapshotDiffers }

// ---------------------------------------------------------------------------
// Globus-Katalog-Snapshots (Block G7) — Roh-Landing-Zone + Historie + Approval.
//
// Beim Katalog-Sync landet je EAN das komplette verifizierte Suggest-JSON als
// 'proposed'. Nur wenn sich etwas gegenueber dem letzten Snapshot geaendert hat,
// entsteht ein neuer Vorschlag (der alte offene wird superseded). Bestaetigen/
// Verwerfen setzt status auf 'confirmed'/'rejected' (Historie bleibt).
// ---------------------------------------------------------------------------

export interface SnapshotInput {
  householdId: string
  productId?: string | null
  storeId?: string | null
  gtin: string
  name: string | null
  category: string[]
  priceCt: number | null
  currency: string | null
  imageRemoteUrl: string | null
  localImagePath?: string | null
  rawJson: unknown
  createdBy?: string | null
}

/**
 * Legt einen Snapshot als 'proposed' an — aber nur, wenn er sich vom letzten
 * bekannten Stand (proposed ODER confirmed) derselben EAN unterscheidet. Ein
 * offener 'proposed' desselben Tripels wird zuvor superseded ('rejected').
 * Return: { changed:true, row } bei neuem Vorschlag, sonst { changed:false }.
 */
export async function recordSnapshot(
  input: SnapshotInput
): Promise<{ changed: boolean; row?: typeof globusSnapshots.$inferSelect }> {
  return db.transaction(async (tx) => {
    // Letzten Stand (egal welcher Status) dieser EAN heranziehen.
    const last = await tx.query.globusSnapshots.findFirst({
      where: (s, { and, eq }) => and(eq(s.gtin, input.gtin), eq(s.householdId, input.householdId)),
      orderBy: [desc(globusSnapshots.fetchedAt)],
    })

    const incoming: SnapshotComparable = {
      name: input.name,
      category: input.category,
      priceCt: input.priceCt,
      currency: input.currency,
      imageRemoteUrl: input.imageRemoteUrl,
    }

    if (last && !snapshotDiffers(incoming, last)) {
      // Nichts geaendert -> nur Zeitstempel des letzten Snapshots auffrischen.
      await tx
        .update(globusSnapshots)
        .set({ fetchedAt: new Date(), localImagePath: input.localImagePath ?? last.localImagePath })
        .where(eq(globusSnapshots.id, last.id))
      return { changed: false }
    }

    // Offenen Vorschlag derselben EAN superseden (haelt den Partial-Unique frei).
    await tx
      .update(globusSnapshots)
      .set({ status: 'rejected', reviewedAt: new Date() })
      .where(
        and(
          eq(globusSnapshots.gtin, input.gtin),
          eq(globusSnapshots.householdId, input.householdId),
          eq(globusSnapshots.status, 'proposed')
        )
      )

    const [row] = await tx
      .insert(globusSnapshots)
      .values({
        householdId: input.householdId,
        productId: input.productId ?? null,
        storeId: input.storeId ?? null,
        gtin: input.gtin,
        name: input.name,
        category: input.category,
        priceCt: input.priceCt,
        currency: input.currency,
        imageRemoteUrl: input.imageRemoteUrl,
        localImagePath: input.localImagePath ?? null,
        rawJson: input.rawJson,
        status: 'proposed',
        source: 'globus',
        createdBy: input.createdBy ?? null,
      })
      .returning()
    return { changed: true, row }
  })
}

/** Offene Snapshot-Vorschlaege des Haushalts (mit product/store), neueste zuerst. */
export async function listProposedSnapshots(householdId: string) {
  return db.query.globusSnapshots.findMany({
    where: (s, { and, eq }) => and(eq(s.householdId, householdId), eq(s.status, 'proposed')),
    with: {
      product: { columns: { id: true, name: true } },
      store: { columns: { id: true, name: true } },
    },
    orderBy: [desc(globusSnapshots.fetchedAt)],
  })
}

/** Offene Snapshot-Vorschlaege eines Artikels (Detailseite). */
export async function listProposedSnapshotsForProduct(productId: string, householdId: string) {
  return db.query.globusSnapshots.findMany({
    where: (s, { and, eq }) =>
      and(eq(s.productId, productId), eq(s.householdId, householdId), eq(s.status, 'proposed')),
    orderBy: [desc(globusSnapshots.fetchedAt)],
  })
}

// ---------------------------------------------------------------------------
// Katalog-Spiegel (G10): je Bestands-Artikel-mit-EAN der neueste Globus-Snapshot
// derselben EAN + Feld-Diff (Artikel vs. Katalog). IMMER sichtbar, unabhaengig
// vom Snapshot-Status — der Abgleich bleibt so lange bestehen, bis die Felder
// uebereinstimmen. Ersetzt die alte „nur offene Vorschlaege"-Liste, die leer
// blieb, sobald ein Snapshot einmal confirmed/rejected war.
// ---------------------------------------------------------------------------

export type CatalogMirrorRow = {
  product: {
    id: string
    name: string
    gtin: string
    imageUrl: string | null
    categoryId: string | null
    categoryName: string | null
  }
  snapshot: {
    id: string
    name: string | null
    category: string[] | null
    priceCt: number | null
    currency: string | null
    storeId: string | null
    localImagePath: string | null
    catalogCategoryId: string | null
    fetchedAt: Date
  } | null
  diff: MirrorDiff
}

/**
 * Liefert je im Haushalt verwendeten Artikel-mit-EAN (Bestand ODER Markt-
 * Zuordnung) den neuesten Katalog-Snapshot derselben EAN + Feld-Diff. Sortiert:
 * abweichende zuerst. Preis bleibt aussen vor (F2-Flow).
 */
export async function listCatalogMirror(householdId: string): Promise<CatalogMirrorRow[]> {
  // Artikel-IDs, die im Haushalt verwendet werden (Bestand oder Markt-Zuordnung).
  const invRows = await db
    .selectDistinct({ productId: inventoryItems.productId })
    .from(inventoryItems)
    .where(eq(inventoryItems.householdId, householdId))
  const psRows = await db
    .selectDistinct({ productId: productStores.productId })
    .from(productStores)
    .where(eq(productStores.householdId, householdId))
  const productIds = [...new Set([...invRows, ...psRows].map((r) => r.productId))]
  if (productIds.length === 0) return []

  // Nur Artikel mit EAN.
  const prods = await db.query.products.findMany({
    where: (p, { and, inArray, isNotNull }) =>
      and(inArray(p.id, productIds), isNotNull(p.gtin)),
    columns: { id: true, name: true, gtin: true, imageUrl: true, categoryId: true },
    with: { category: { columns: { name: true } } },
  })
  if (prods.length === 0) return []

  // Neuesten Snapshot je EAN dieses Haushalts holen (ein Query, dann in JS je EAN
  // den neuesten behalten).
  const gtins = prods.map((p) => p.gtin!).filter(Boolean)
  const snaps = await db.query.globusSnapshots.findMany({
    where: (s, { and, eq, inArray }) =>
      and(eq(s.householdId, householdId), inArray(s.gtin, gtins)),
    orderBy: [desc(globusSnapshots.fetchedAt)],
  })
  const latestByGtin = new Map<string, (typeof snaps)[number]>()
  for (const s of snaps) {
    if (!latestByGtin.has(s.gtin)) latestByGtin.set(s.gtin, s) // erster = neuester (orderBy)
  }

  const rows: CatalogMirrorRow[] = []
  for (const p of prods) {
    const snap = latestByGtin.get(p.gtin!) ?? null
    // Katalog-Kategorie best-effort auf stoqr-categoryId mappen (fuer den Diff).
    const catalogCategoryId = snap ? await matchCategoryId(snap.category) : null
    const diff = computeMirrorDiff(
      { name: p.name, imageUrl: p.imageUrl, categoryId: p.categoryId },
      snap
        ? { name: snap.name, localImagePath: snap.localImagePath, categoryId: catalogCategoryId }
        : null
    )
    rows.push({
      product: {
        id: p.id,
        name: p.name,
        gtin: p.gtin!,
        imageUrl: p.imageUrl,
        categoryId: p.categoryId,
        categoryName: p.category?.name ?? null,
      },
      snapshot: snap
        ? {
            id: snap.id,
            name: snap.name,
            category: snap.category,
            priceCt: snap.priceCt,
            currency: snap.currency,
            storeId: snap.storeId,
            localImagePath: snap.localImagePath,
            catalogCategoryId,
            fetchedAt: snap.fetchedAt,
          }
        : null,
      diff,
    })
  }

  // Abweichende zuerst, dann alphabetisch nach Artikelname.
  rows.sort((a, b) => {
    if (a.diff.any !== b.diff.any) return a.diff.any ? -1 : 1
    return a.product.name.localeCompare(b.product.name, 'de')
  })
  return rows
}

/**
 * Durchsucht den lokalen Katalog (globus_snapshots) nach Name oder EAN. Liefert je
 * EAN den neuesten Eintrag (dedupe), unabhaengig vom Status (auch confirmed/rejected
 * sind gueltige Katalog-Daten). Fuer die On-demand-Suche beim Artikel-Anlegen (G8-4).
 */
export async function searchCatalogSnapshots(householdId: string, q: string, limit = 20) {
  const term = q.trim()
  if (term === '') return []
  const rows = await db.query.globusSnapshots.findMany({
    where: (s, { and, eq, or, ilike }) =>
      and(eq(s.householdId, householdId), or(ilike(s.name, `%${term}%`), eq(s.gtin, term))),
    orderBy: [desc(globusSnapshots.fetchedAt)],
    limit: 200,
    columns: { id: true, gtin: true, name: true, category: true, priceCt: true, localImagePath: true },
  })
  // Dedupe je EAN (neuester zuerst durch orderBy), auf limit kuerzen.
  const seen = new Set<string>()
  const out: typeof rows = []
  for (const r of rows) {
    if (seen.has(r.gtin)) continue
    seen.add(r.gtin)
    out.push(r)
    if (out.length >= limit) break
  }
  return out
}

export async function getSnapshotCounts(householdId: string) {
  const proposed = await db.query.globusSnapshots.findMany({
    where: (s, { and, eq }) => and(eq(s.householdId, householdId), eq(s.status, 'proposed')),
    columns: { id: true },
  })
  return { proposed: proposed.length }
}

/**
 * Uebernimmt gewaehlte Katalog-Felder eines Snapshots in den passenden Artikel
 * (G10: EAN-Spiegel). Status-agnostisch — der Snapshot muss NICHT 'proposed'
 * sein (der Spiegel zeigt auch confirmed/rejected). Der Artikel wird ueber
 * snap.productId ODER — falls null (easy-add-Snapshots) — ueber die EAN im
 * Haushalt aufgeloest. fields: welche Felder uebernommen werden (angekreuzt).
 * image nutzt den lokalen /media-Pfad. Angekreuzte Felder ueberschreiben; nicht
 * angekreuzte fuellen nur leere Artikelfelder. Kategorie best-effort per Name.
 * Setzt den Snapshot danach auf 'confirmed'. Return: { ok, reason? }.
 */
export async function applySnapshotToProduct(
  id: string,
  householdId: string,
  fields: { image?: boolean; name?: boolean; category?: boolean; price?: boolean },
  reviewedBy?: string | null
): Promise<{ ok: boolean; reason?: string }> {
  const snap = await db.query.globusSnapshots.findFirst({
    where: (s, { and, eq }) => and(eq(s.id, id), eq(s.householdId, householdId)),
  })
  if (!snap) return { ok: false, reason: 'not-found' }

  // Artikel aufloesen: bevorzugt ueber die Verknuepfung, sonst ueber die EAN
  // (verwendet im Haushalt). So funktioniert die Uebernahme auch fuer Snapshots
  // ohne productId.
  let product = snap.productId
    ? await db.query.products.findFirst({
        where: eq(products.id, snap.productId),
        columns: { id: true, name: true, imageUrl: true, categoryId: true, defaultUnit: true },
      })
    : undefined
  if (!product && snap.gtin) {
    product = await db.query.products.findFirst({
      where: eq(products.gtin, snap.gtin),
      columns: { id: true, name: true, imageUrl: true, categoryId: true, defaultUnit: true },
    })
  }
  if (!product) return { ok: false, reason: 'no-product' }

  const patch: { name?: string; imageUrl?: string | null; categoryId?: string | null } = {}

  // Bild: lokaler /media-Pfad; angekreuzt -> immer setzen, sonst nur wenn leer.
  if (snap.localImagePath) {
    const localUrl = `/media/${snap.localImagePath}`
    if (fields.image || !product.imageUrl) patch.imageUrl = localUrl
  }
  // Name: angekreuzt -> setzen; ohne Ankreuzen nur wenn Artikelname leer.
  if (snap.name && snap.name.trim() !== '' && (fields.name || !product.name?.trim())) {
    patch.name = snap.name.trim()
  }
  // Kategorie best-effort: letzte (spezifischste) Kategorie per Name matchen.
  if (Array.isArray(snap.category) && snap.category.length > 0) {
    const catId = await matchCategoryId(snap.category)
    if (catId && (fields.category || !product.categoryId)) patch.categoryId = catId
  }

  if (Object.keys(patch).length > 0) {
    await updateProduct(product.id, patch)
    // Herkunft der uebernommenen Felder auf 'globus' setzen (G15).
    const srcs: Partial<Record<ProductField, 'globus'>> = {}
    if (patch.name !== undefined) srcs.name = 'globus'
    if (patch.imageUrl !== undefined) srcs.image = 'globus'
    if (patch.categoryId !== undefined) srcs.category = 'globus'
    await setFieldSources(product.id, srcs)
  }

  // Preis: angekreuzt + Katalog hat Preis + Markt-Bezug → als Preis-VORSCHLAG
  // anlegen (product_prices, proposed), analog zum Online-Preis-Abruf (F2).
  // Kein Direkt-Confirm (Staging bleibt). Ohne storeId nicht moeglich (der
  // Preis ist markt-gebunden) → dann still uebersprungen.
  if (fields.price && snap.priceCt != null && snap.storeId) {
    const unit = (await suggestStockUnitForProduct(product.id, householdId)) ?? product.defaultUnit ?? 'piece'
    await recordProposedPrice({
      householdId,
      productId: product.id,
      storeId: snap.storeId,
      priceCt: snap.priceCt,
      unit,
      note: 'aus Katalog-Spiegel',
      createdBy: reviewedBy ?? null,
    })
  }

  // Snapshot mit dem Artikel verknuepfen (falls noch nicht) + auf confirmed setzen.
  await db
    .update(globusSnapshots)
    .set({
      productId: snap.productId ?? product.id,
      status: 'confirmed',
      reviewedAt: new Date(),
      reviewedBy: reviewedBy ?? null,
    })
    .where(eq(globusSnapshots.id, id))

  return { ok: true }
}

/**
 * Globus-Kategorie-Pfad best-effort auf categories.id mappen (G19-2).
 * Robuster als frueher: es werden ALLE Pfad-Segmente geprueft (nicht nur das
 * letzte), und zwar gegen Name UND Slug der Seed-Kategorien. Reihenfolge:
 * spezifischste Segmente (hinten im Pfad) zuerst — so gewinnt "Joghurt" vor dem
 * Ober-Segment "Kühlregal", wenn beide zufaellig treffen wuerden.
 * Ergibt sich KEIN Treffer, wird null zurueckgegeben (→ "nicht zuordenbar" in der UI),
 * NICHT stillschweigend eine Default-Kategorie.
 */
async function matchCategoryId(category: string[] | null | undefined): Promise<string | null> {
  if (!Array.isArray(category) || category.length === 0) return null
  const cats = await db
    .select({ id: categories.id, name: categories.name, slug: categories.slug })
    .from(categories)

  const norm = (s: string) => s.trim().toLowerCase()
  // Spezifischste zuerst (Pfad ist grob → fein): von hinten nach vorne.
  for (let i = category.length - 1; i >= 0; i--) {
    const seg = norm(category[i] ?? '')
    if (seg === '') continue
    const hit = cats.find((c) => norm(c.name) === seg || norm(c.slug) === seg)
    if (hit) return hit.id
  }
  return null
}

/**
 * Legt aus einem Katalog-Snapshot einen Artikel an (Name/EAN/Bild/Kategorie) und
 * verknuepft den Snapshot damit (productId). Fuer die On-demand-Katalog-Suche
 * beim Anlegen (G9-3). Kein status-Wechsel (Snapshot bleibt Katalog-Eintrag).
 * Liefert das angelegte Produkt (id + Anzeige-Felder) oder null.
 */
export async function materializeSnapshotToProduct(
  snapshotId: string,
  householdId: string,
  createdBy?: string | null
): Promise<{ id: string; name: string; imageUrl: string | null; categoryId: string | null } | null> {
  const snap = await db.query.globusSnapshots.findFirst({
    where: (s, { and, eq }) => and(eq(s.id, snapshotId), eq(s.householdId, householdId)),
  })
  if (!snap) return null

  const categoryId = await matchCategoryId(snap.category)
  const imageUrl = snap.localImagePath ? `/media/${snap.localImagePath}` : undefined

  const productId = await createProduct({
    name: snap.name?.trim() || snap.gtin,
    gtin: snap.gtin,
    imageUrl,
    categoryId: categoryId ?? undefined,
    createdBy: createdBy ?? undefined,
  })

  // Snapshot mit dem neuen Artikel verknuepfen (best-effort).
  await db
    .update(globusSnapshots)
    .set({ productId })
    .where(eq(globusSnapshots.id, snapshotId))

  // Herkunft der aus dem Katalog gesetzten Felder → 'globus' (G15).
  const srcs: Partial<Record<ProductField, 'globus'>> = { name: 'globus' }
  if (imageUrl) srcs.image = 'globus'
  if (categoryId) srcs.category = 'globus'
  await setFieldSources(productId, srcs)

  return {
    id: productId,
    name: snap.name?.trim() || snap.gtin,
    imageUrl: imageUrl ?? null,
    categoryId: categoryId ?? null,
  }
}

/** Snapshot bestaetigen (status='confirmed'). Nur offene Vorschlaege. */
export async function confirmSnapshot(id: string, householdId: string, reviewedBy?: string | null) {
  const [row] = await db
    .update(globusSnapshots)
    .set({ status: 'confirmed', reviewedAt: new Date(), reviewedBy: reviewedBy ?? null })
    .where(
      and(
        eq(globusSnapshots.id, id),
        eq(globusSnapshots.householdId, householdId),
        eq(globusSnapshots.status, 'proposed')
      )
    )
    .returning()
  return row ?? null
}

/** Snapshot verwerfen (status='rejected'). Nur offene Vorschlaege. */
export async function rejectSnapshot(id: string, householdId: string, reviewedBy?: string | null) {
  const [row] = await db
    .update(globusSnapshots)
    .set({ status: 'rejected', reviewedAt: new Date(), reviewedBy: reviewedBy ?? null })
    .where(
      and(
        eq(globusSnapshots.id, id),
        eq(globusSnapshots.householdId, householdId),
        eq(globusSnapshots.status, 'proposed')
      )
    )
    .returning()
  return row ?? null
}
