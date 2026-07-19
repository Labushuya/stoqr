import { db } from '$lib/server/db'
import { globusSnapshots, products, categories } from '@stoqr/db'
import { and, eq, desc } from 'drizzle-orm'
import { snapshotDiffers, type SnapshotComparable } from '$lib/utils/snapshot-diff'
import { updateProduct } from '$lib/server/queries/products'

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

export async function getSnapshotCounts(householdId: string) {
  const proposed = await db.query.globusSnapshots.findMany({
    where: (s, { and, eq }) => and(eq(s.householdId, householdId), eq(s.status, 'proposed')),
    columns: { id: true },
  })
  return { proposed: proposed.length }
}

/**
 * Uebernimmt gewaehlte Katalog-Felder eines Snapshots in den zugeordneten Artikel
 * und setzt den Snapshot auf 'confirmed'. Nur wenn der Snapshot offen ist, dem
 * Haushalt gehoert UND einem Artikel zugeordnet ist (productId gesetzt).
 * fields: welche Felder uebernommen werden (angekreuzt). image nutzt den lokalen
 * /media-Pfad. „leere Felder fuellen" ist Default; angekreuzte Felder ueberschreiben.
 * Kategorie best-effort per Namensabgleich; ohne Treffer nicht gesetzt.
 * Return: { ok, reason? }.
 */
export async function applySnapshotToProduct(
  id: string,
  householdId: string,
  fields: { image?: boolean; name?: boolean; category?: boolean },
  reviewedBy?: string | null
): Promise<{ ok: boolean; reason?: string }> {
  const snap = await db.query.globusSnapshots.findFirst({
    where: (s, { and, eq }) =>
      and(eq(s.id, id), eq(s.householdId, householdId), eq(s.status, 'proposed')),
  })
  if (!snap) return { ok: false, reason: 'not-found' }
  if (!snap.productId) return { ok: false, reason: 'no-product' }

  const product = await db.query.products.findFirst({
    where: eq(products.id, snap.productId),
    columns: { id: true, name: true, imageUrl: true, categoryId: true },
  })
  if (!product) return { ok: false, reason: 'no-product' }

  const patch: { name?: string; imageUrl?: string | null; categoryId?: string | null } = {}

  // Bild: lokaler /media-Pfad; angekreuzt -> immer setzen, sonst nur wenn leer.
  if (snap.localImagePath) {
    const localUrl = `/media/${snap.localImagePath}`
    if (fields.image || !product.imageUrl) patch.imageUrl = localUrl
  }
  // Name: angekreuzt -> setzen; ohne Ankreuzen NICHT (Name ist Kern-Stammdatum).
  if (fields.name && snap.name && snap.name.trim() !== '') {
    patch.name = snap.name.trim()
  }
  // Kategorie best-effort: letzte (spezifischste) Kategorie per Name matchen.
  if (fields.category && Array.isArray(snap.category) && snap.category.length > 0) {
    const wanted = snap.category[snap.category.length - 1].trim().toLowerCase()
    const cats = await db.select({ id: categories.id, name: categories.name }).from(categories)
    const match = cats.find((c) => c.name.trim().toLowerCase() === wanted)
    if (match && (fields.category || !product.categoryId)) patch.categoryId = match.id
  }

  if (Object.keys(patch).length > 0) {
    await updateProduct(product.id, patch)
  }

  await db
    .update(globusSnapshots)
    .set({ status: 'confirmed', reviewedAt: new Date(), reviewedBy: reviewedBy ?? null })
    .where(eq(globusSnapshots.id, id))

  return { ok: true }
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
