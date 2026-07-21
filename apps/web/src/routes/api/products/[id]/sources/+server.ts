import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { getFieldSources } from '$lib/server/queries/products'

// ---------------------------------------------------------------------------
// GET /api/products/[id]/sources — Feld-Herkunft je Stammdaten-Feld (G16).
// Liefert { name?, brand?, image?, category?, unit? } → 'off'|'globus'|'manual'.
// Fuer die Herkunftsanzeige beim Bestand-Anlegen (easy-add), analog Detailseite.
// ---------------------------------------------------------------------------

export const GET: RequestHandler = async ({ locals, params }) => {
  if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 })
  const sources = await getFieldSources(params.id)
  return json({ sources })
}
