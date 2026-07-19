import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { requireHouseholdId } from '$lib/server/queries/households'
import { writeAudit } from '$lib/server/queries/audit'
import { confirmSnapshot, rejectSnapshot } from '$lib/server/queries/globus-snapshots'

// ---------------------------------------------------------------------------
// POST /api/catalog/snapshots/[id]  { action: 'confirm' | 'reject' }  (G7)
// Bestaetigt/verwirft einen offenen Globus-Snapshot-Vorschlag.
// ---------------------------------------------------------------------------

export const POST: RequestHandler = async ({ locals, params, request }) => {
  if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 })
  const householdId = await requireHouseholdId(locals.user.id)

  const body = (await request.json().catch(() => ({}))) as { action?: 'confirm' | 'reject' }

  if (body.action === 'confirm') {
    const row = await confirmSnapshot(params.id, householdId, locals.user.id)
    if (!row) return json({ error: 'Snapshot nicht gefunden' }, { status: 404 })
    await writeAudit({
      householdId,
      userId: locals.user.id,
      action: 'UPDATE',
      tableName: 'globus_snapshots',
      recordId: row.id,
      oldValues: { status: 'proposed' },
      newValues: { status: 'confirmed' },
    })
    return json({ ok: true, snapshot: row })
  }

  if (body.action === 'reject') {
    const row = await rejectSnapshot(params.id, householdId, locals.user.id)
    if (!row) return json({ error: 'Snapshot nicht gefunden' }, { status: 404 })
    await writeAudit({
      householdId,
      userId: locals.user.id,
      action: 'UPDATE',
      tableName: 'globus_snapshots',
      recordId: row.id,
      oldValues: { status: 'proposed' },
      newValues: { status: 'rejected' },
    })
    return json({ ok: true, snapshot: row })
  }

  return json({ error: 'Ungültige Aktion' }, { status: 400 })
}
