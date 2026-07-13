import { db } from '$lib/server/db'
import { products, inventoryItems, categories } from '@stoqr/db'
import { eq, asc, desc, and, ilike } from 'drizzle-orm'
import { getUnits } from './households'
import { buildUnitMetaMap, aggregateStock, type StockTotals } from '$lib/utils/stock'

// ---------------------------------------------------------------------------
// Inventory — list
// ---------------------------------------------------------------------------

export async function getInventoryItems(
	householdId: string,
	filters?: { placeId?: string; status?: string }
) {
	return db.query.inventoryItems.findMany({
		where: (item, { and, eq }) =>
			and(
				eq(item.householdId, householdId),
				eq(
					item.status,
					(filters?.status ?? 'available') as 'available' | 'consumed' | 'expired' | 'donated' | 'discarded'
				),
				filters?.placeId ? eq(item.placeId, filters.placeId) : undefined
			),
		orderBy: [asc(inventoryItems.bestBeforeDate), desc(inventoryItems.createdAt)],
		with: {
			product: {
				columns: {
					id: true,
					name: true,
					brand: true,
					imageUrl: true,
					defaultUnit: true,
					defaultQuantity: true,
					gtin: true,
					categoryId: true,
				},
				with: {
					category: true,
				},
			},
			place: {
				columns: {
					id: true,
					name: true,
					icon: true,
				},
				with: {
					storage: {
						columns: {
							id: true,
							name: true,
							icon: true,
							storageType: true,
							temperatureZone: true,
						},
						with: {
							location: {
								columns: {
									id: true,
									name: true,
									icon: true,
								},
							},
						},
					},
				},
			},
			store: {
				columns: {
					id: true,
					name: true,
					chain: true,
				},
			},
		},
	});
}

// ---------------------------------------------------------------------------
// Inventory — all stock entries for one product (aggregated article view)
// ---------------------------------------------------------------------------

export async function listInventoryForProduct(productId: string, householdId: string) {
	return db.query.inventoryItems.findMany({
		where: (item, { and, eq }) =>
			and(eq(item.productId, productId), eq(item.householdId, householdId)),
		orderBy: [asc(inventoryItems.bestBeforeDate), desc(inventoryItems.createdAt)],
		with: {
			place: {
				columns: { id: true, name: true, icon: true },
				with: {
					storage: {
						columns: { id: true, name: true, icon: true },
						with: {
							location: { columns: { id: true, name: true, icon: true } },
						},
					},
				},
			},
			store: {
				columns: { id: true, name: true, chain: true },
			},
		},
	});
}

// ---------------------------------------------------------------------------
// Inventory — aggregated stock totals for one product (Umrechnungsschicht)
// ---------------------------------------------------------------------------

export async function getProductStockTotals(
	productId: string,
	householdId: string
): Promise<StockTotals> {
	const [items, units] = await Promise.all([
		listInventoryForProduct(productId, householdId),
		getUnits(householdId),
	]);
	const metaMap = buildUnitMetaMap(units);
	return aggregateStock(items, metaMap);
}

// ---------------------------------------------------------------------------
// Inventory — single item
// ---------------------------------------------------------------------------

export async function getInventoryItem(id: string, householdId: string) {
	return db.query.inventoryItems.findFirst({
		where: (item, { and, eq }) => and(eq(item.id, id), eq(item.householdId, householdId)),
		with: {
			product: {
				with: {
					category: true,
					nutrients: {
						with: {
							nutrientType: true,
						},
					},
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
}

// ---------------------------------------------------------------------------
// Inventory — create
// ---------------------------------------------------------------------------

export async function createInventoryItem(data: {
	productId: string;
	placeId?: string;
	householdId: string;
	quantity?: number | string;
	unit?: string;
	bestBeforeDate?: string;
	purchaseDate?: string;
	notes?: string;
	storeId?: string;
	gtin?: string;
}) {
	const [record] = await db
		.insert(inventoryItems)
		.values({
			productId: data.productId,
			placeId: data.placeId,
			householdId: data.householdId,
			quantity: data.quantity?.toString() ?? '1',
			unit: data.unit ?? 'piece',
			bestBeforeDate: data.bestBeforeDate,
			purchaseDate: data.purchaseDate,
			notes: data.notes,
			storeId: data.storeId,
			gtin: data.gtin,
		})
		.returning();
	return record;
}

// ---------------------------------------------------------------------------
// Inventory — update
// ---------------------------------------------------------------------------

export async function updateInventoryItem(
	id: string,
	householdId: string,
	data: Partial<{
		productId: string;
		placeId: string | null;
		quantity: number | string;
		unit: string;
		bestBeforeDate: string | null;
		purchaseDate: string | null;
		notes: string | null;
		storeId: string | null;
		gtin: string | null;
		status: 'available' | 'consumed' | 'expired' | 'donated' | 'discarded';
		openedAt: Date | null;
		openedExpiryDays: number | null;
		purchasePriceCt: number | null;
		lotNumber: string | null;
		weightG: number | string | null;
		volumeMl: number | string | null;
	}>
) {
	// Build set object only with defined keys to avoid accidentally nulling fields.
	const patch: Record<string, unknown> = { updatedAt: new Date() };

	if (data.productId !== undefined) patch.productId = data.productId;
	if (data.placeId !== undefined) patch.placeId = data.placeId;
	if (data.quantity !== undefined) patch.quantity = data.quantity?.toString();
	if (data.unit !== undefined) patch.unit = data.unit;
	if (data.bestBeforeDate !== undefined) patch.bestBeforeDate = data.bestBeforeDate;
	if (data.purchaseDate !== undefined) patch.purchaseDate = data.purchaseDate;
	if (data.notes !== undefined) patch.notes = data.notes;
	if (data.storeId !== undefined) patch.storeId = data.storeId;
	if (data.gtin !== undefined) patch.gtin = data.gtin;
	if (data.status !== undefined) patch.status = data.status;
	if (data.openedAt !== undefined) patch.openedAt = data.openedAt;
	if (data.openedExpiryDays !== undefined) patch.openedExpiryDays = data.openedExpiryDays;
	if (data.purchasePriceCt !== undefined) patch.purchasePriceCt = data.purchasePriceCt;
	if (data.lotNumber !== undefined) patch.lotNumber = data.lotNumber;
	if (data.weightG !== undefined) patch.weightG = data.weightG?.toString();
	if (data.volumeMl !== undefined) patch.volumeMl = data.volumeMl?.toString();

	const [record] = await db
		.update(inventoryItems)
		.set(patch as Record<string, unknown>)
		.where(and(eq(inventoryItems.id, id), eq(inventoryItems.householdId, householdId)))
		.returning();
	return record;
}

// ---------------------------------------------------------------------------
// Inventory — hard delete
// ---------------------------------------------------------------------------

export async function deleteInventoryItem(id: string, householdId: string) {
	const [record] = await db
		.delete(inventoryItems)
		.where(and(eq(inventoryItems.id, id), eq(inventoryItems.householdId, householdId)))
		.returning();
	return record;
}

// ---------------------------------------------------------------------------
// Products — delete (hard delete, only if no active inventory items remain)
// ---------------------------------------------------------------------------

export async function deleteProduct(id: string) {
	const [record] = await db
		.delete(products)
		.where(eq(products.id, id))
		.returning({ id: products.id });
	return record ?? null;
}

// ---------------------------------------------------------------------------
// Inventory — consume (reduce quantity or mark consumed)
// ---------------------------------------------------------------------------

export async function consumeInventoryItem(id: string, householdId: string, amount: number) {
	const item = await db.query.inventoryItems.findFirst({
		where: (i, { and, eq }) => and(eq(i.id, id), eq(i.householdId, householdId)),
		columns: { quantity: true },
	});

	if (!item) return null;

	const remaining = parseFloat(item.quantity) - amount;

	if (remaining <= 0) {
		const [record] = await db
			.update(inventoryItems)
			.set({
				quantity: '0',
				status: 'consumed',
				consumedAt: new Date(),
				updatedAt: new Date(),
			})
			.where(and(eq(inventoryItems.id, id), eq(inventoryItems.householdId, householdId)))
			.returning();
		return record;
	}

	const [record] = await db
		.update(inventoryItems)
		.set({ quantity: remaining.toString(), updatedAt: new Date() })
		.where(and(eq(inventoryItems.id, id), eq(inventoryItems.householdId, householdId)))
		.returning();
	return record;
}

// ---------------------------------------------------------------------------
// Products — create
// ---------------------------------------------------------------------------

export async function createProduct(data: {
	name: string;
	brand?: string;
	gtin?: string;
	categoryId?: string;
	description?: string;
	notes?: string;
	imageUrl?: string;
	defaultUnit?: string;
	defaultQuantity?: number | string;
	defaultWeightG?: number | string;
	defaultVolumeMl?: number | string;
	expiryToleranceDays?: number;
	bringItemId?: string;
	createdBy?: string;
	offData?: unknown;
}) {
	const [record] = await db
		.insert(products)
		.values({
			name: data.name,
			brand: data.brand,
			gtin: data.gtin,
			categoryId: data.categoryId,
			description: data.description,
			notes: data.notes,
			imageUrl: data.imageUrl,
			defaultUnit: data.defaultUnit ?? 'piece',
			defaultQuantity: data.defaultQuantity?.toString() ?? '1',
			defaultWeightG: data.defaultWeightG?.toString(),
			defaultVolumeMl: data.defaultVolumeMl?.toString(),
			expiryToleranceDays: data.expiryToleranceDays,
			bringItemId: data.bringItemId,
			createdBy: data.createdBy,
			offData: data.offData as Record<string, unknown>,
		})
		.returning({ id: products.id });
	return record.id;
}

// ---------------------------------------------------------------------------
// Products — list all (article catalog; products are global / shared)
// ---------------------------------------------------------------------------

export async function listProducts() {
	return db.query.products.findMany({
		orderBy: [asc(products.name)],
		columns: {
			id: true,
			name: true,
			brand: true,
			description: true,
			notes: true,
			categoryId: true,
			defaultUnit: true,
			gtin: true,
			imageUrl: true,
		},
		with: {
			category: true,
		},
	});
}

// ---------------------------------------------------------------------------
// Products — update master data
// ---------------------------------------------------------------------------

export async function updateProduct(
	id: string,
	data: Partial<{
		name: string;
		description: string | null;
		notes: string | null;
		categoryId: string | null;
		defaultUnit: string;
		gtin: string | null;
	}>
) {
	const patch: Record<string, unknown> = { updatedAt: new Date() };
	if (data.name !== undefined) patch.name = data.name;
	if (data.description !== undefined) patch.description = data.description;
	if (data.notes !== undefined) patch.notes = data.notes;
	if (data.categoryId !== undefined) patch.categoryId = data.categoryId;
	if (data.defaultUnit !== undefined) patch.defaultUnit = data.defaultUnit;
	if (data.gtin !== undefined) patch.gtin = data.gtin;

	const [record] = await db
		.update(products)
		.set(patch)
		.where(eq(products.id, id))
		.returning();
	return record ?? null;
}

// ---------------------------------------------------------------------------
// Products — find by GTIN or return null
// ---------------------------------------------------------------------------

export async function getOrCreateProductByGtin(gtin: string) {
	const existing = await db.query.products.findFirst({
		where: eq(products.gtin, gtin),
	});
	return existing ?? null;
}

// ---------------------------------------------------------------------------
// Products — find by id
// ---------------------------------------------------------------------------

export async function getProductById(id: string) {
	const product = await db.query.products.findFirst({
		where: eq(products.id, id),
		with: { category: true },
		columns: {
			id: true,
			name: true,
			brand: true,
			description: true,
			notes: true,
			imageUrl: true,
			categoryId: true,
			defaultUnit: true,
		},
	});
	return product ?? null;
}

// ---------------------------------------------------------------------------
// Products — search by name / brand
// ---------------------------------------------------------------------------

export async function searchProducts(query: string) {
	return db.query.products.findMany({
		where: (p, { or }) => or(ilike(p.name, `%${query}%`), ilike(p.brand, `%${query}%`)),
		orderBy: [asc(products.name)],
		limit: 25,
		columns: {
			id: true,
			name: true,
			brand: true,
			gtin: true,
			imageUrl: true,
			defaultUnit: true,
			defaultQuantity: true,
			categoryId: true,
		},
		with: {
			category: true,
		},
	});
}

// ---------------------------------------------------------------------------
// Categories — all, ordered
// ---------------------------------------------------------------------------

export async function getCategories() {
	return db.query.categories.findMany({
		orderBy: [asc(categories.sortOrder), asc(categories.name)],
		with: {
			children: {
				orderBy: [asc(categories.sortOrder), asc(categories.name)],
			},
		},
	});
}
