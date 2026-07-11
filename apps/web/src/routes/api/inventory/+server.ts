import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import {
  getInventoryItems,
  getInventoryItem,
  createInventoryItem,
  createProduct,
  getOrCreateProductByGtin,
} from '$lib/server/queries/products'
import { requireHouseholdId } from '$lib/server/queries/households'
import { db } from '$lib/server/db'
import { places, storages, locations, nutrientTypes, productNutrients, products } from '@stoqr/db'
import { eq, inArray } from 'drizzle-orm'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface NutrientInput {
  slug: string
  value: number
  unit: string
}

// ---------------------------------------------------------------------------
// GET /api/inventory
// ---------------------------------------------------------------------------

export const GET: RequestHandler = async ({ locals, url }) => {
  if (!locals.user) {
    return json({ error: 'Unauthorized' }, { status: 401 })
  }

  const householdId = await requireHouseholdId(locals.user.id)
  const placeId = url.searchParams.get('placeId') ?? undefined
  const status = url.searchParams.get('status') ?? undefined

  const items = await getInventoryItems(householdId, { placeId, status })
  return json(items)
}

// ---------------------------------------------------------------------------
// POST /api/inventory
// ---------------------------------------------------------------------------

export const POST: RequestHandler = async ({ locals, request }) => {
  if (!locals.user) {
    return json({ error: 'Unauthorized' }, { status: 401 })
  }

  const householdId = await requireHouseholdId(locals.user.id)
  const body = await request.json()
  const {
    // Product resolution
    productId,
    productName,
    gtin,
    brand,
    imageUrl,
    categoryId,
    defaultUnit,
    defaultWeightG,
    defaultVolumeML,
    nutrients,
    // Inventory item fields
    placeId,
    quantity,
    unit,
    bestBeforeDate,
    notes,
    storeId,
  } = body as {
    productId?: string
    productName?: string
    gtin?: string
    brand?: string
    imageUrl?: string
    categoryId?: string
    defaultUnit?: string
    defaultWeightG?: number
    defaultVolumeML?: number
    nutrients?: NutrientInput[]
    placeId?: string
    quantity: number
    unit: string
    bestBeforeDate?: string
    notes?: string
    storeId?: string
  }

  const qty = Number(quantity)
  if (isNaN(qty) || qty < 0 || !unit) {
    return json({ error: 'Menge muss eine gültige Zahl >= 0 sein und Einheit ist erforderlich' }, { status: 400 })
  }

  // ---------------------------------------------------------------------------
  // Resolve / create product
  // ---------------------------------------------------------------------------

  let resolvedProductId: string | undefined = productId
  let existingProductReused = false

  if (!resolvedProductId) {
    if (!productName) {
      return json({ error: 'productId or productName is required' }, { status: 400 })
    }

    // When a GTIN is supplied, reuse an existing product record to avoid duplicates
    if (gtin) {
      const existing = await getOrCreateProductByGtin(gtin)
      if (existing) {
        resolvedProductId = existing.id
        existingProductReused = true
      }
    }

    if (!resolvedProductId) {
      resolvedProductId = await createProduct({
        name: productName,
        gtin: gtin ?? undefined,
        brand: brand ?? undefined,
        imageUrl: imageUrl ?? undefined,
        categoryId: categoryId ?? undefined,
        defaultUnit: defaultUnit ?? unit,
        defaultWeightG: defaultWeightG ?? undefined,
        defaultVolumeMl: defaultVolumeML ?? undefined,
        createdBy: locals.user.id,
      })
    }
  } else {
    // productId was supplied directly — treat as reusing an existing product
    existingProductReused = true
  }

  // Only update categoryId on the product if it was newly created (not reused).
  // Reused products keep their existing category to avoid silent overwrites.
  if (categoryId && resolvedProductId && !existingProductReused) {
    await db.update(products)
      .set({ categoryId })
      .where(eq(products.id, resolvedProductId))
  }

  // ---------------------------------------------------------------------------
  // Upsert nutrients when provided
  // ---------------------------------------------------------------------------

  if (nutrients && nutrients.length > 0) {
    const slugs = nutrients.map((n) => n.slug)

    // Fetch all matching nutrient_type rows in one query
    const typeRows = await db
      .select({ id: nutrientTypes.id, slug: nutrientTypes.slug })
      .from(nutrientTypes)
      .where(inArray(nutrientTypes.slug, slugs))

    const typeBySlug = new Map(typeRows.map((r) => [r.slug, r.id]))

    const rows = nutrients
      .filter((n) => typeBySlug.has(n.slug))
      .map((n) => ({
        productId: resolvedProductId as string,
        nutrientTypeId: typeBySlug.get(n.slug) as string,
        valuePer100: n.value.toString(),
        source: 'off' as const,
        updatedAt: new Date(),
      }))

    if (rows.length > 0) {
      // Upsert each row — ON CONFLICT (product_id, nutrient_type_id) DO UPDATE
      await Promise.all(
        rows.map((row) =>
          db
            .insert(productNutrients)
            .values(row)
            .onConflictDoUpdate({
              target: [productNutrients.productId, productNutrients.nutrientTypeId],
              set: {
                valuePer100: row.valuePer100,
                source: row.source,
                updatedAt: row.updatedAt,
              },
            })
        )
      )
    }
  }

  // ---------------------------------------------------------------------------
  // Verify place ownership
  // ---------------------------------------------------------------------------

  if (placeId) {
    const [placeRow] = await db
      .select({ locationHouseholdId: locations.householdId })
      .from(places)
      .innerJoin(storages, eq(places.storageId, storages.id))
      .innerJoin(locations, eq(storages.locationId, locations.id))
      .where(eq(places.id, placeId))

    if (!placeRow || placeRow.locationHouseholdId !== householdId) {
      return json({ error: 'Place not found' }, { status: 404 })
    }
  }

  // ---------------------------------------------------------------------------
  // Create inventory item
  // ---------------------------------------------------------------------------

  const item = await createInventoryItem({
    productId: resolvedProductId as string,
    householdId,
    placeId: placeId ?? undefined,
    quantity: qty,
    unit,
    bestBeforeDate: bestBeforeDate ?? undefined,
    notes: notes ?? undefined,
    storeId: storeId ?? undefined,
    gtin: gtin ?? undefined,
  })

  // Return the full item with product info (mirrors GET /api/inventory/[id])
  const fullItem = await getInventoryItem(item.id, householdId)

  return json(fullItem ?? item, { status: 201 })
}
