import { error } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { requireHouseholdId } from '$lib/server/queries/households'
import { resolveMediaPath, mediaDir } from '$lib/server/media'
import { readFile } from 'node:fs/promises'
import { extname } from 'node:path'

// ---------------------------------------------------------------------------
// GET /media/[...path] — liefert lokal gesicherte Katalog-Bilder (G7).
//
// Auth + Household-Scope: der Pfad MUSS mit der eigenen householdId beginnen.
// Path-Traversal wird durch resolveMediaPath verhindert. 404 bei fehlend.
// ---------------------------------------------------------------------------

const MIME: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
}

export const GET: RequestHandler = async ({ locals, params }) => {
  if (!locals.user) throw error(401, 'Unauthorized')
  const householdId = await requireHouseholdId(locals.user.id)

  const rel = params.path ?? ''
  // Nur Bilder des eigenen Haushalts (Pfad beginnt mit householdId/).
  if (!rel.startsWith(`${householdId}/`)) throw error(403, 'Forbidden')

  const abs = resolveMediaPath(rel, mediaDir())
  if (!abs) throw error(400, 'Bad path')

  try {
    const data = await readFile(abs)
    const type = MIME[extname(abs).toLowerCase()] ?? 'application/octet-stream'
    return new Response(new Uint8Array(data), {
      headers: { 'Content-Type': type, 'Cache-Control': 'private, max-age=86400' },
    })
  } catch {
    throw error(404, 'Not found')
  }
}
