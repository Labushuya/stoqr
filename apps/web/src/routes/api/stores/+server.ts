import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { db } from '$lib/server/db'
import { stores } from '@stoqr/db'
import { eq, asc } from 'drizzle-orm'
import { requireHouseholdId } from '$lib/server/queries/households'
import { writeAudit } from '$lib/server/queries/audit'
import { normalizeScrapeUrl, INVALID_URL } from '$lib/server/scrape/globus'

// ---------------------------------------------------------------------------
// GET /api/stores
// ---------------------------------------------------------------------------

export const GET: RequestHandler = async ({ locals }) => {
  if (!locals.user) {
    return json({ error: 'Unauthorized' }, { status: 401 })
  }

  const householdId = await requireHouseholdId(locals.user.id)

  const rows = await db
    .select()
    .from(stores)
    .where(eq(stores.householdId, householdId))
    .orderBy(asc(stores.name))

  return json(rows)
}

// ---------------------------------------------------------------------------
// POST /api/stores
// ---------------------------------------------------------------------------

export const POST: RequestHandler = async ({ locals, request }) => {
  if (!locals.user) {
    return json({ error: 'Unauthorized' }, { status: 401 })
  }

  const householdId = await requireHouseholdId(locals.user.id)
  const body = await request.json()
  const { name, chain, address, city, scrapeUrl } = body as {
    name?: string
    chain?: string
    address?: string
    city?: string
    scrapeUrl?: string | null
  }

  if (!name) {
    return json({ error: 'name is required' }, { status: 400 })
  }

  const normalizedUrl = normalizeScrapeUrl(scrapeUrl)
  if (normalizedUrl === INVALID_URL) {
    return json({ error: 'Ungültige Abruf-URL (nur http/https)' }, { status: 400 })
  }

  const [store] = await db
    .insert(stores)
    .values({
      householdId,
      name,
      chain: chain ?? null,
      address: address ?? null,
      city: city ?? null,
      scrapeUrl: normalizedUrl,
    })
    .returning()

  await writeAudit({
    householdId,
    userId: locals.user.id,
    action: 'INSERT',
    tableName: 'stores',
    recordId: store.id,
    newValues: { name: store.name, chain: store.chain },
  })

  return json(store, { status: 201 })
}
