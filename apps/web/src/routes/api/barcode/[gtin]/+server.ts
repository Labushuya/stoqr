import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { db } from '$lib/server/db'
import { products, categories, productNutrients } from '@stoqr/db'
import { eq } from 'drizzle-orm'

// ---------------------------------------------------------------------------
// Open Food Facts nutriment keys → internal slugs
// ---------------------------------------------------------------------------

const OFF_NUTRIENT_MAP: Array<{ offKey: string; slug: string; unit: string }> = [
  { offKey: 'energy-kcal_100g',     slug: 'energy-kcal',     unit: 'kcal' },
  { offKey: 'fat_100g',             slug: 'fat',             unit: 'g'    },
  { offKey: 'saturated-fat_100g',   slug: 'saturated-fat',   unit: 'g'    },
  { offKey: 'carbohydrates_100g',   slug: 'carbohydrates',   unit: 'g'    },
  { offKey: 'sugars_100g',          slug: 'sugars',          unit: 'g'    },
  { offKey: 'proteins_100g',        slug: 'proteins',        unit: 'g'    },
  { offKey: 'fiber_100g',           slug: 'fiber',           unit: 'g'    },
  { offKey: 'salt_100g',            slug: 'salt',            unit: 'g'    },
]

// ---------------------------------------------------------------------------
// OFF category tag → stoqr category slug mapping (best-effort, extensible)
// ---------------------------------------------------------------------------

const OFF_CATEGORY_MAP: Record<string, string> = {
  'en:beverages':            'beverages',
  'en:dairies':              'dairy',
  'en:meats':                'meat',
  'en:fish':                 'fish',
  'en:fruits':               'fruits',
  'en:vegetables':           'vegetables',
  'en:breads':               'bakery',
  'en:cereals-and-potatoes': 'cereals',
  'en:frozen-foods':         'frozen',
  'en:condiments':           'condiments',
  'en:snacks':               'snacks',
  'en:desserts':             'desserts',
  'en:canned-foods':         'canned',
  'en:pastas':               'pasta',
}

// ---------------------------------------------------------------------------
// Parse "500 g" / "1 l" quantity strings from OFF
// ---------------------------------------------------------------------------

function parseQuantity(raw: string | undefined): {
  unit: string
  defaultWeightG: number | null
  defaultVolumeML: number | null
} {
  if (!raw) return { unit: 'piece', defaultWeightG: null, defaultVolumeML: null }

  const normalized = raw.trim().toLowerCase()

  // Match patterns like "500 g", "1.5 kg", "330 ml", "1 l", "75cl"
  const match = normalized.match(/^([\d.,]+)\s*(kg|g|mg|l|litre|liter|ml|cl|oz|lb)?/)
  if (!match) return { unit: 'piece', defaultWeightG: null, defaultVolumeML: null }

  const value = parseFloat(match[1].replace(',', '.'))
  const rawUnit = match[2] ?? ''

  switch (rawUnit) {
    case 'kg':
      return { unit: 'g', defaultWeightG: value * 1000, defaultVolumeML: null }
    case 'g':
    case 'mg':
      return {
        unit: 'g',
        defaultWeightG: rawUnit === 'mg' ? value / 1000 : value,
        defaultVolumeML: null,
      }
    case 'l':
    case 'litre':
    case 'liter':
      return { unit: 'ml', defaultWeightG: null, defaultVolumeML: value * 1000 }
    case 'cl':
      return { unit: 'ml', defaultWeightG: null, defaultVolumeML: value * 10 }
    case 'ml':
      return { unit: 'ml', defaultWeightG: null, defaultVolumeML: value }
    default:
      return { unit: 'piece', defaultWeightG: null, defaultVolumeML: null }
  }
}

// ---------------------------------------------------------------------------
// Resolve stoqr categoryId from an OFF product (categories_tags array)
// ---------------------------------------------------------------------------

async function resolveCategoryId(categoriesTags: string[] | undefined): Promise<string | null> {
  if (!categoriesTags?.length) return null

  for (const tag of categoriesTags) {
    const slug = OFF_CATEGORY_MAP[tag]
    if (slug) {
      const row = await db.query.categories.findFirst({
        where: eq(categories.slug, slug),
        columns: { id: true },
      })
      if (row) return row.id
    }
  }
  return null
}

// ---------------------------------------------------------------------------
// Extract normalised nutrients from OFF nutriments object
// ---------------------------------------------------------------------------

function extractNutrients(
  nutriments: Record<string, number> | undefined
): Array<{ slug: string; valuePer100: number; unit: string }> {
  if (!nutriments) return []

  return OFF_NUTRIENT_MAP.flatMap(({ offKey, slug, unit }) => {
    const value = nutriments[offKey]
    if (value == null || isNaN(Number(value))) return []
    return [{ slug, valuePer100: Number(value), unit }]
  })
}

// ---------------------------------------------------------------------------
// Upsert nutrients for a product (resolve nutrient_type by slug / off_key)
// ---------------------------------------------------------------------------

async function upsertProductNutrients(
  productId: string,
  nutrients: Array<{ slug: string; valuePer100: number; unit: string }>
) {
  if (!nutrients.length) return

  for (const nutrient of nutrients) {
    const nt = await db.query.nutrientTypes.findFirst({
      where: (n, { or }) =>
        or(eq(n.slug, nutrient.slug), eq(n.offKey, nutrient.slug)),
      columns: { id: true },
    })

    if (!nt) continue

    await db
      .insert(productNutrients)
      .values({
        productId,
        nutrientTypeId: nt.id,
        valuePer100: nutrient.valuePer100.toString(),
        source: 'off',
      })
      .onConflictDoUpdate({
        target: [productNutrients.productId, productNutrients.nutrientTypeId],
        set: {
          valuePer100: nutrient.valuePer100.toString(),
          updatedAt: new Date(),
        },
      })
  }
}

// ---------------------------------------------------------------------------
// Build the normalised response shape from a product DB row + nutrients
// ---------------------------------------------------------------------------

async function buildResponse(
  product: typeof products.$inferSelect,
  nutrientRows: Array<{ slug: string; valuePer100: number; unit: string }>
) {
  return {
    found:            true,
    id:               product.id,
    gtin:             product.gtin ?? '',
    name:             product.name,
    brand:            product.brand ?? null,
    imageUrl:         product.imageUrl ?? null,
    categoryId:       product.categoryId ?? null,
    defaultUnit:      product.defaultUnit,
    defaultWeightG:   product.defaultWeightG != null ? Number(product.defaultWeightG) : null,
    defaultVolumeML:  product.defaultVolumeMl != null ? Number(product.defaultVolumeMl) : null,
    nutrients:        nutrientRows,
    offData:          (product.offData ?? {}) as object,
  }
}

// ---------------------------------------------------------------------------
// GET /api/barcode/[gtin]
// ---------------------------------------------------------------------------

export const GET: RequestHandler = async ({ params, locals }) => {
  if (!locals.user) {
    return json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { gtin } = params

  if (!gtin || !/^\d{8,14}$/.test(gtin)) {
    return json({ error: 'Invalid GTIN' }, { status: 400 })
  }

  // ------------------------------------------------------------------
  // 1. Cache check — fresh if off_fetched_at is within 7 days
  // ------------------------------------------------------------------

  const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000
  const staleThreshold = new Date(Date.now() - SEVEN_DAYS_MS)

  const cached = await db.query.products.findFirst({
    where: eq(products.gtin, gtin),
    with: {
      nutrients: {
        with: { nutrientType: { columns: { slug: true, unit: true } } },
      },
    },
  })

  if (cached && cached.offFetchedAt && cached.offFetchedAt > staleThreshold) {
    const nutrientRows = cached.nutrients.map((n) => ({
      slug:        n.nutrientType.slug,
      valuePer100: Number(n.valuePer100),
      unit:        n.nutrientType.unit,
    }))
    return json(await buildResponse(cached, nutrientRows))
  }

  // ------------------------------------------------------------------
  // 2. Fetch from Open Food Facts
  // ------------------------------------------------------------------

  const userAgent =
    (typeof process !== 'undefined' && process.env?.OFF_USER_AGENT) || 'stoqr/0.1.0'

  let offResponse: Response
  try {
    offResponse = await fetch(
      `https://world.openfoodfacts.org/api/v2/product/${gtin}.json`,
      { headers: { 'User-Agent': userAgent } }
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Network error'
    return json({ error: `Failed to reach Open Food Facts: ${message}` }, { status: 502 })
  }

  if (offResponse.status === 404) {
    return json({ found: false })
  }

  if (!offResponse.ok) {
    return json(
      { error: `Open Food Facts returned ${offResponse.status}` },
      { status: 502 }
    )
  }

  let offBody: {
    status: number
    product?: Record<string, unknown>
  }
  try {
    offBody = await offResponse.json()
  } catch {
    return json({ error: 'Invalid response from Open Food Facts' }, { status: 502 })
  }

  // OFF uses status=0 for "product not found" even on a 200
  if (offBody.status === 0 || !offBody.product) {
    return json({ found: false })
  }

  const p = offBody.product

  // ------------------------------------------------------------------
  // 3. Parse OFF product fields
  // ------------------------------------------------------------------

  const name: string =
    (p.product_name_de as string | undefined)?.trim() ||
    (p.product_name as string | undefined)?.trim() ||
    ''

  if (!name) {
    // Product exists but has no usable name — still return found:false
    // so the caller can prompt the user to enter a name manually.
    return json({ found: false })
  }

  const brand         = (p.brands as string | undefined)?.split(',')[0]?.trim() || null
  const imageUrl      = (p.image_url as string | undefined) ?? null
  const nutriments    = p.nutriments as Record<string, number> | undefined
  const categoriesTags = p.categories_tags as string[] | undefined

  const { unit, defaultWeightG, defaultVolumeML } = parseQuantity(
    p.quantity as string | undefined
  )
  const categoryId    = await resolveCategoryId(categoriesTags)
  const nutrients     = extractNutrients(nutriments)

  // ------------------------------------------------------------------
  // 4. Upsert into products table
  // ------------------------------------------------------------------

  const now = new Date()

  let productId: string

  if (cached) {
    // Row exists but is stale — update it
    const [updated] = await db
      .update(products)
      .set({
        name,
        brand,
        imageUrl,
        categoryId,
        defaultUnit:     unit,
        defaultWeightG:  defaultWeightG?.toString() ?? null,
        defaultVolumeMl: defaultVolumeML?.toString() ?? null,
        offData:         p as Record<string, unknown>,
        offFetchedAt:    now,
        updatedAt:       now,
      })
      .where(eq(products.gtin, gtin))
      .returning({ id: products.id })

    productId = updated.id
  } else {
    // New product — insert
    const [inserted] = await db
      .insert(products)
      .values({
        gtin,
        name,
        brand,
        imageUrl,
        categoryId,
        defaultUnit:     unit,
        defaultWeightG:  defaultWeightG?.toString(),
        defaultVolumeMl: defaultVolumeML?.toString(),
        offData:         p as Record<string, unknown>,
        offFetchedAt:    now,
      })
      .onConflictDoUpdate({
        target: products.gtin,
        set: {
          name,
          brand,
          imageUrl,
          categoryId,
          defaultUnit:     unit,
          defaultWeightG:  defaultWeightG?.toString() ?? null,
          defaultVolumeMl: defaultVolumeML?.toString() ?? null,
          offData:         p as Record<string, unknown>,
          offFetchedAt:    now,
          updatedAt:       now,
        },
      })
      .returning({ id: products.id })

    productId = inserted.id
  }

  // ------------------------------------------------------------------
  // 5. Upsert nutrients
  // ------------------------------------------------------------------

  await upsertProductNutrients(productId, nutrients)

  // ------------------------------------------------------------------
  // 6. Return normalised response
  // ------------------------------------------------------------------

  const productRow = await db.query.products.findFirst({
    where: eq(products.id, productId),
  })

  if (!productRow) {
    return json({ error: 'Product write failed' }, { status: 500 })
  }

  return json({
    found:           true,
    id:              productRow.id,
    gtin:            productRow.gtin ?? gtin,
    name:            productRow.name,
    brand:           productRow.brand ?? null,
    imageUrl:        productRow.imageUrl ?? null,
    categoryId:      productRow.categoryId ?? null,
    defaultUnit:     productRow.defaultUnit,
    defaultWeightG:  productRow.defaultWeightG != null ? Number(productRow.defaultWeightG) : null,
    defaultVolumeML: productRow.defaultVolumeMl != null ? Number(productRow.defaultVolumeMl) : null,
    nutrients,
    offData:         (productRow.offData ?? {}) as object,
  })
}
