import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { searchProducts, createProduct } from '$lib/server/queries/products'

export const GET: RequestHandler = async ({ locals, url }) => {
  if (!locals.user) {
    return json({ error: 'Unauthorized' }, { status: 401 })
  }

  const q = url.searchParams.get('q')

  if (!q || q.trim().length === 0) {
    return json({ error: 'q query parameter is required' }, { status: 400 })
  }

  const results = await searchProducts(q.trim())
  return json(results)
}

export const POST: RequestHandler = async ({ locals, request }) => {
  if (!locals.user) {
    return json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const {
    name,
    brand,
    gtin,
    categoryId,
    description,
    imageUrl,
    defaultUnit,
    defaultQuantity,
    defaultWeightG,
    defaultVolumeMl,
    expiryToleranceDays,
    bringItemId,
    offData,
  } = body

  if (!name) {
    return json({ error: 'name is required' }, { status: 400 })
  }

  const productId = await createProduct({
    name,
    brand: brand ?? undefined,
    gtin: gtin ?? undefined,
    categoryId: categoryId ?? undefined,
    description: description ?? undefined,
    imageUrl: imageUrl ?? undefined,
    defaultUnit: defaultUnit ?? undefined,
    defaultQuantity: defaultQuantity ?? undefined,
    defaultWeightG: defaultWeightG ?? undefined,
    defaultVolumeMl: defaultVolumeMl ?? undefined,
    expiryToleranceDays: expiryToleranceDays ?? undefined,
    bringItemId: bringItemId ?? undefined,
    offData: offData ?? undefined,
    createdBy: locals.user.id,
  })

  return json({ id: productId }, { status: 201 })
}
