import { db } from '$lib/server/db'
import { categories, products } from '@stoqr/db'
import { eq, asc, sql } from 'drizzle-orm'
import { isSeedCategorySlug, slugify } from './category-slug'

// ---------------------------------------------------------------------------
// Kategorie-Verwaltung (Stufe 1: CRUD). categories ist GLOBAL (kein household_id) —
// die 9 Seed-Kategorien bilden die Basis und sind loeschgeschuetzt (bearbeitbar).
// Nesting (parentId) folgt in einer spaeteren Stufe; hier bleibt es unangetastet.
// Reine Helfer (slugify/isSeedCategorySlug/SEED_CATEGORY_SLUGS) leben in
// ./category-slug (DB-frei, unit-testbar) und werden hier re-exportiert.
// ---------------------------------------------------------------------------

export { SEED_CATEGORY_SLUGS, isSeedCategorySlug, slugify } from './category-slug'

export type CategoryRow = typeof categories.$inferSelect

/** Freien, eindeutigen Slug finden (Kollision → Suffix -2, -3, …). */
async function uniqueSlug(base: string): Promise<string> {
  const root = base || 'kategorie'
  const existing = await db
    .select({ slug: categories.slug })
    .from(categories)
    .where(sql`${categories.slug} = ${root} OR ${categories.slug} LIKE ${root + '-%'}`)
  const taken = new Set(existing.map((r) => r.slug))
  if (!taken.has(root)) return root
  let n = 2
  while (taken.has(`${root}-${n}`)) n++
  return `${root}-${n}`
}

export function listCategories(): Promise<CategoryRow[]> {
  return db
    .select()
    .from(categories)
    .orderBy(asc(categories.sortOrder), asc(categories.name))
}

export async function createCategory(input: {
  name: string
  icon?: string | null
}): Promise<CategoryRow> {
  const name = input.name.trim()
  const slug = await uniqueSlug(slugify(name))
  const [{ max }] = await db
    .select({ max: sql<number>`coalesce(max(${categories.sortOrder}), 0)` })
    .from(categories)
  const [row] = await db
    .insert(categories)
    .values({
      name,
      slug,
      icon: input.icon?.trim() || null,
      sortOrder: Number(max) + 1,
    })
    .returning()
  return row
}

export async function updateCategory(
  id: string,
  input: { name?: string; icon?: string | null }
): Promise<CategoryRow | null> {
  const patch: Partial<{ name: string; icon: string | null }> = {}
  if (input.name !== undefined) patch.name = input.name.trim()
  if (input.icon !== undefined) patch.icon = input.icon?.trim() || null
  if (Object.keys(patch).length === 0) return (await getCategoryById(id)) ?? null
  const [row] = await db.update(categories).set(patch).where(eq(categories.id, id)).returning()
  return row ?? null
}

export function getCategoryById(id: string): Promise<CategoryRow | undefined> {
  return db.query.categories.findFirst({ where: eq(categories.id, id) })
}

export type DeleteResult =
  | { ok: true }
  | { ok: false; reason: 'not-found' | 'seed' | 'in-use'; detail?: string }

/**
 * Loescht eine Kategorie. Verweigert bei:
 *  - Seed-Kategorie (loeschgeschuetzt),
 *  - Verwendung an Produkten (409).
 * Kindkategorien (Stufe 2) werden hier noch nicht beruecksichtigt.
 */
export async function deleteCategory(id: string): Promise<DeleteResult> {
  const cat = await getCategoryById(id)
  if (!cat) return { ok: false, reason: 'not-found' }
  if (isSeedCategorySlug(cat.slug)) {
    return { ok: false, reason: 'seed', detail: 'Basis-Kategorien können nicht gelöscht werden.' }
  }

  const [prod] = await db
    .select({ n: sql<number>`count(*)` })
    .from(products)
    .where(eq(products.categoryId, id))
  if (Number(prod.n) > 0) {
    return { ok: false, reason: 'in-use', detail: `Kategorie wird von ${Number(prod.n)} Artikel(n) verwendet.` }
  }

  // Vorwaertskompatibel (Stufe 2): keine Kategorie mit Unterkategorien loeschen.
  const [child] = await db
    .select({ n: sql<number>`count(*)` })
    .from(categories)
    .where(eq(categories.parentId, id))
  if (Number(child.n) > 0) {
    return { ok: false, reason: 'in-use', detail: 'Kategorie hat Unterkategorien.' }
  }

  await db.delete(categories).where(eq(categories.id, id))
  return { ok: true }
}
