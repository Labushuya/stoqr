import { db } from '$lib/server/db'
import { shoppingTrips, shoppingTripItems } from '@stoqr/db'
import { and, eq, desc } from 'drizzle-orm'

// ---------------------------------------------------------------------------
// Einkauf-Runs (Block E / M2)
//
// Ein shopping_trip ist ein konkreter Einkaufsvorgang mit Status. Positionen
// (shopping_trip_items) reservieren jeweils genau einen Bedarf. Status-Regeln:
//   begonnen ↔ pausiert → beendet (terminal). Hoechstens ein 'begonnen' je
//   Haushalt (partieller Unique-Index; resume/create loesen den aktiven zuvor auf).
// ---------------------------------------------------------------------------

export type TripStatus = 'begonnen' | 'pausiert' | 'beendet'

// ── Lesen ────────────────────────────────────────────────────────────────

export async function listTrips(householdId: string) {
  return db.query.shoppingTrips.findMany({
    where: (t, { eq }) => eq(t.householdId, householdId),
    orderBy: [desc(shoppingTrips.startedAt)],
    with: {
      store: { columns: { id: true, name: true, chain: true } },
    },
  })
}

export async function getTrip(id: string, householdId: string) {
  const trip = await db.query.shoppingTrips.findFirst({
    where: (t, { and, eq }) => and(eq(t.id, id), eq(t.householdId, householdId)),
    with: {
      store: { columns: { id: true, name: true, chain: true } },
      items: {
        with: { product: { columns: { id: true, name: true } } },
      },
    },
  })
  return trip ?? null
}

// ── Anlegen ──────────────────────────────────────────────────────────────

/**
 * Legt einen neuen Run an (Status 'begonnen'). Setzt einen evtl. bereits aktiven
 * Run desselben Haushalts zuvor auf 'pausiert' (nur einer aktiv).
 */
export async function createTrip(input: {
  householdId: string
  name?: string | null
  storeId?: string | null
}) {
  return db.transaction(async (tx) => {
    await tx
      .update(shoppingTrips)
      .set({ status: 'pausiert', updatedAt: new Date() })
      .where(and(eq(shoppingTrips.householdId, input.householdId), eq(shoppingTrips.status, 'begonnen')))
    const [row] = await tx
      .insert(shoppingTrips)
      .values({
        householdId: input.householdId,
        name: input.name?.trim() || null,
        storeId: input.storeId || null,
        status: 'begonnen',
      })
      .returning()
    return row
  })
}

// ── Status-Übergänge ───────────────────────────────────────────────────────

/** Setzt einen Run auf 'pausiert'. */
export async function pauseTrip(id: string, householdId: string) {
  const [row] = await db
    .update(shoppingTrips)
    .set({ status: 'pausiert', updatedAt: new Date() })
    .where(
      and(
        eq(shoppingTrips.id, id),
        eq(shoppingTrips.householdId, householdId),
        eq(shoppingTrips.status, 'begonnen'),
      ),
    )
    .returning()
  return row ?? null
}

/**
 * Setzt einen pausierten Run auf 'begonnen'. Loest zuvor den aktuell aktiven Run
 * (falls vorhanden) auf 'pausiert' — transaktional, damit der partielle Unique-
 * Index nicht zuschlaegt.
 */
export async function resumeTrip(id: string, householdId: string) {
  return db.transaction(async (tx) => {
    await tx
      .update(shoppingTrips)
      .set({ status: 'pausiert', updatedAt: new Date() })
      .where(and(eq(shoppingTrips.householdId, householdId), eq(shoppingTrips.status, 'begonnen')))
    const [row] = await tx
      .update(shoppingTrips)
      .set({ status: 'begonnen', updatedAt: new Date() })
      .where(
        and(
          eq(shoppingTrips.id, id),
          eq(shoppingTrips.householdId, householdId),
          eq(shoppingTrips.status, 'pausiert'),
        ),
      )
      .returning()
    return row ?? null
  })
}

export class TripEndBlockedError extends Error {
  constructor(public readonly pendingCount: number) {
    super(`Es sind noch ${pendingCount} gekaufte Position(en) nicht eingebucht.`)
    this.name = 'TripEndBlockedError'
  }
}

/**
 * Beendet einen Run. Blockiert (TripEndBlockedError), solange 'gekauft'-Positionen
 * existieren, die noch nicht eingebucht wurden. Loest offene/ausverkaufte
 * Positionen (deren Bedarf kehrt in den Backlog zurueck), setzt status='beendet'.
 */
export async function endTrip(id: string, householdId: string) {
  return db.transaction(async (tx) => {
    const trip = await tx.query.shoppingTrips.findFirst({
      where: (t, { and, eq }) => and(eq(t.id, id), eq(t.householdId, householdId)),
    })
    if (!trip) return null
    if (trip.status === 'beendet') return trip

    const items = await tx.query.shoppingTripItems.findMany({
      where: (i, { eq }) => eq(i.tripId, id),
      columns: { id: true, realStatus: true },
    })
    const pending = items.filter((i) => i.realStatus === 'gekauft')
    if (pending.length > 0) throw new TripEndBlockedError(pending.length)

    // offene + ausverkaufte Positionen freigeben → Bedarf zurueck im Backlog.
    await tx
      .delete(shoppingTripItems)
      .where(eq(shoppingTripItems.tripId, id))

    const [row] = await tx
      .update(shoppingTrips)
      .set({ status: 'beendet', endedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(shoppingTrips.id, id), eq(shoppingTrips.householdId, householdId)))
      .returning()
    return row ?? null
  })
}

/** Aktualisiert Run-Stammdaten (name/storeId). */
export async function updateTrip(
  id: string,
  householdId: string,
  data: Partial<{ name: string | null; storeId: string | null }>,
) {
  const patch: Record<string, unknown> = { updatedAt: new Date() }
  if (data.name !== undefined) patch.name = data.name?.trim() || null
  if (data.storeId !== undefined) patch.storeId = data.storeId || null
  const [row] = await db
    .update(shoppingTrips)
    .set(patch)
    .where(and(eq(shoppingTrips.id, id), eq(shoppingTrips.householdId, householdId)))
    .returning()
  return row ?? null
}

/** Loescht einen Run (Positionen via cascade; deren Bedarfe bleiben im Backlog). */
export async function deleteTrip(id: string, householdId: string) {
  const [row] = await db
    .delete(shoppingTrips)
    .where(and(eq(shoppingTrips.id, id), eq(shoppingTrips.householdId, householdId)))
    .returning({ id: shoppingTrips.id })
  return { deleted: !!row }
}
