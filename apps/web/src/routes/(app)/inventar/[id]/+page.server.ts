import { db } from '$lib/server/db'
import {
  inventoryItems,
  productNutrients,
  places,
  storages,
  locations,
  expiryConfig,
  stores,
  productStores,
  products,
} from '@stoqr/db'
import { eq, and, asc } from 'drizzle-orm'
import { error, fail, redirect } from '@sveltejs/kit'
import type { PageServerLoad, Actions } from './$types'
import { requireHouseholdId } from '$lib/server/queries/households'
import { deleteProduct } from '$lib/server/queries/products'

// ---------------------------------------------------------------------------
// Load
// ---------------------------------------------------------------------------

export const load: PageServerLoad = async ({ params, locals }) => {
  if (!locals.user) redirect(302, '/login');
  const householdId = await requireHouseholdId(locals.user.id);

  // Fetch inventory item with product join
  const item = await db.query.inventoryItems.findFirst({
    where: and(eq(inventoryItems.id, params.id), eq(inventoryItems.householdId, householdId)),
    with: {
      product: {
        with: {
          nutrients: {
            with: { nutrientType: true },
            orderBy: asc(productNutrients.nutrientTypeId),
          },
          category: true,
        },
      },
      place: {
        with: {
          storage: {
            with: {
              location: true,
            },
          },
        },
      },
      store: true,
    },
  });

  if (!item) {
    error(404, 'Artikel nicht gefunden');
  }

  // Fetch household expiry config for badge calculation
  const cfg = await db.query.expiryConfig.findFirst({
    where: eq(expiryConfig.householdId, householdId),
  });

  const expirySettings = {
    yellowDaysBefore: cfg?.yellowDaysBefore ?? 7,
    redDaysBefore: cfg?.redDaysBefore ?? 2,
    graceDaysAfter: cfg?.graceDaysAfter ?? 0,
  };

  // Build location path breadcrumb from joined data
  const locationPath: Array<{ id: string; name: string; kind: 'location' | 'storage' | 'place' }> =
    [];
  if (item.place) {
    const place = item.place as typeof item.place & {
      storage: typeof storages.$inferSelect & { location: typeof locations.$inferSelect };
    };
    if (place.storage?.location) {
      locationPath.push({
        id: place.storage.location.id,
        name: place.storage.location.name,
        kind: 'location',
      });
    }
    if (place.storage) {
      locationPath.push({ id: place.storage.id, name: place.storage.name, kind: 'storage' });
    }
    locationPath.push({ id: place.id, name: place.name, kind: 'place' });
  }

  // Fetch all locations for the location-picker dialog
  const allLocations = await db.query.locations.findMany({
    where: eq(locations.householdId, householdId),
    orderBy: asc(locations.sortOrder),
    with: {
      storages: {
        orderBy: asc(storages.sortOrder),
        with: {
          places: { orderBy: asc(places.sortOrder) },
        },
      },
    },
  });

  // Fetch all stores for the household (for the add-store dropdown)
  const availableStores = await db.query.stores.findMany({
    where: eq(stores.householdId, householdId),
    orderBy: asc(stores.name),
  });

  // Fetch product stores (Bezugsquellen) ordered by sortOrder
  const productStoresList = await db.query.productStores.findMany({
    where: eq(productStores.productId, item.productId),
    with: { store: true },
    orderBy: asc(productStores.sortOrder),
  });

  return {
    item,
    locationPath,
    allLocations,
    expirySettings,
    availableStores,
    productStores: productStoresList,
  };
};

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export const actions: Actions = {
  // ── Update quantity ──────────────────────────────────────────────────────
  updateQuantity: async ({ params, locals, request }) => {
    if (!locals.user) return fail(401, { error: 'Nicht authentifiziert' });
    const householdId = await requireHouseholdId(locals.user.id);

    const data = await request.formData();
    const quantity = data.get('quantity');
    const parsed = Number(quantity);

    if (!quantity || isNaN(parsed) || parsed < 0) {
      return fail(400, { error: 'Ungültige Menge' });
    }

    const [updated] = await db
      .update(inventoryItems)
      .set({ quantity: String(parsed), updatedAt: new Date() })
      .where(and(eq(inventoryItems.id, params.id), eq(inventoryItems.householdId, householdId)))
      .returning();

    if (!updated) return fail(404, { error: 'Artikel nicht gefunden' });
    return { success: true, quantity: updated.quantity };
  },

  // ── Mark as consumed ─────────────────────────────────────────────────────
  markConsumed: async ({ params, locals }) => {
    if (!locals.user) return fail(401, { error: 'Nicht authentifiziert' });
    const householdId = await requireHouseholdId(locals.user.id);

    const [updated] = await db
      .update(inventoryItems)
      .set({ status: 'consumed', consumedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(inventoryItems.id, params.id), eq(inventoryItems.householdId, householdId)))
      .returning();

    if (!updated) return fail(404, { error: 'Artikel nicht gefunden' });
    redirect(302, '/inventar');
  },

  // ── Update item fields (MHD, notes, lot, location) ────────────────────────
  updateItem: async ({ params, locals, request }) => {
    if (!locals.user) return fail(401, { error: 'Nicht authentifiziert' });
    const householdId = await requireHouseholdId(locals.user.id);

    const data = await request.formData();
    const bestBeforeDate = data.get('bestBeforeDate') as string | null;
    const notes = data.get('notes') as string | null;
    const lotNumber = data.get('lotNumber') as string | null;
    const placeId = data.get('placeId') as string | null;
    const quantity = data.get('quantity') as string | null;
    const unit = data.get('unit') as string | null;

    const patch: Partial<typeof inventoryItems.$inferInsert> = {
      updatedAt: new Date(),
    };

    if (bestBeforeDate !== null) {
      patch.bestBeforeDate = bestBeforeDate === '' ? null : bestBeforeDate;
    }
    if (notes !== null) patch.notes = notes === '' ? null : notes;
    if (lotNumber !== null) patch.lotNumber = lotNumber === '' ? null : lotNumber;
    if (placeId !== null) patch.placeId = placeId === '' ? null : placeId;
    if (quantity !== null) {
      const q = Number(quantity);
      if (!isNaN(q) && q >= 0) patch.quantity = String(q);
    }
    if (unit !== null && unit !== '') patch.unit = unit;

    const [updated] = await db
      .update(inventoryItems)
      .set(patch)
      .where(and(eq(inventoryItems.id, params.id), eq(inventoryItems.householdId, householdId)))
      .returning();

    if (!updated) return fail(404, { error: 'Artikel nicht gefunden' });
    return { success: true };
  },

  // ── Delete item ───────────────────────────────────────────────────────────
  deleteItem: async ({ params, locals }) => {
    if (!locals.user) return fail(401, { error: 'Nicht authentifiziert' });
    const householdId = await requireHouseholdId(locals.user.id);

    const [deleted] = await db
      .delete(inventoryItems)
      .where(and(eq(inventoryItems.id, params.id), eq(inventoryItems.householdId, householdId)))
      .returning();

    if (!deleted) return fail(404, { error: 'Artikel nicht gefunden' });
    redirect(302, '/inventar');
  },

  // ── Delete product from catalog ───────────────────────────────────────────
  deleteProduct: async ({ params, locals }) => {
    if (!locals.user) return fail(401, { error: 'Nicht authentifiziert' });
    const householdId = await requireHouseholdId(locals.user.id);

    // Load the inventory item to find the productId
    const item = await db.query.inventoryItems.findFirst({
      where: and(eq(inventoryItems.id, params.id), eq(inventoryItems.householdId, householdId)),
      columns: { productId: true },
    });

    if (!item) return fail(404, { error: 'Artikel nicht gefunden' });

    // Guard: no remaining inventory items for this product in this household
    const remaining = await db.query.inventoryItems.findFirst({
      where: and(
        eq(inventoryItems.productId, item.productId),
        eq(inventoryItems.householdId, householdId)
      ),
      columns: { id: true },
    });

    if (remaining) {
      return fail(409, {
        error: 'Das Produkt hat noch weitere Bestandseinträge. Bitte zuerst alle entfernen.',
      });
    }

    const deleted = await deleteProduct(item.productId);
    if (!deleted) return fail(404, { error: 'Produkt nicht gefunden' });

    redirect(302, '/inventar');
  },

  // ── Delete all (product + all inventory items + product_stores) ───────────
  deleteAll: async ({ params, locals }) => {
    if (!locals.user) return fail(401, { error: 'Nicht authentifiziert' });
    const householdId = await requireHouseholdId(locals.user.id);

    // Load the inventory item to find the productId
    const item = await db.query.inventoryItems.findFirst({
      where: and(eq(inventoryItems.id, params.id), eq(inventoryItems.householdId, householdId)),
      columns: { productId: true },
    });

    if (!item) return fail(404, { error: 'Artikel nicht gefunden' });

    const productId = item.productId;

    try {
      await db.transaction(async (tx) => {
        await tx
          .delete(inventoryItems)
          .where(
            and(
              eq(inventoryItems.productId, productId),
              eq(inventoryItems.householdId, householdId)
            )
          );

        await tx
          .delete(productStores)
          .where(
            and(
              eq(productStores.productId, productId),
              eq(productStores.householdId, householdId)
            )
          );

        await tx.delete(products).where(eq(products.id, productId));
      });
    } catch (err) {
      console.error('deleteAll failed:', err);
      return fail(500, { error: 'Fehler beim vollständigen Löschen' });
    }

    redirect(302, '/inventar');
  },
};
