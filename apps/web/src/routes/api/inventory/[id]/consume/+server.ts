import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { consumeInventoryItem } from '$lib/server/queries/products'

export const POST: RequestHandler = async ({ locals, params, request }) => {
  if (!locals.user) {
    return json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { amount } = body

  if (typeof amount !== 'number' || amount <= 0) {
    return json({ error: 'amount must be a positive number' }, { status: 400 })
  }

  const updated = await consumeInventoryItem(params.id, locals.user.id, amount)
  if (!updated) {
    return json({ error: 'Not found' }, { status: 404 })
  }

  return json(updated)
}
