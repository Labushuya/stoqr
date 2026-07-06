import { db } from '$lib/server/db'
import { inventoryItems, locations } from '@stoqr/db'
import { and, eq, lt, lte, isNotNull, asc } from 'drizzle-orm'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns a date string "YYYY-MM-DD" offset by +days from today. */
function dateOffset(days: number): string {
	const d = new Date();
	d.setDate(d.getDate() + days);
	return d.toISOString().slice(0, 10);
}

function today(): string {
	return new Date().toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// getDashboardStats
// ---------------------------------------------------------------------------

export interface DashboardStats {
	totalItems: number;
	expiringThisWeek: number;
	expiredCount: number;
	locationCount: number;
}

export async function getDashboardStats(userId: string): Promise<DashboardStats> {
	const todayStr = today();
	const weekStr = dateOffset(7);

	const [totalResult, expiringResult, expiredResult, locationResult] = await Promise.all([
		// Active inventory count
		db
			.select({ count: sql<number>`cast(count(*) as integer)` })
			.from(inventoryItems)
			.where(and(eq(inventoryItems.userId, userId), eq(inventoryItems.status, 'available'))),

		// Expiring within 7 days (best_before_date >= today AND <= today+7)
		db
			.select({ count: sql<number>`cast(count(*) as integer)` })
			.from(inventoryItems)
			.where(
				and(
					eq(inventoryItems.userId, userId),
					eq(inventoryItems.status, 'available'),
					isNotNull(inventoryItems.bestBeforeDate),
					gte(inventoryItems.bestBeforeDate, todayStr),
					lte(inventoryItems.bestBeforeDate, weekStr)
				)
			),

		// Past best_before_date (still status=available — not yet marked expired)
		db
			.select({ count: sql<number>`cast(count(*) as integer)` })
			.from(inventoryItems)
			.where(
				and(
					eq(inventoryItems.userId, userId),
					eq(inventoryItems.status, 'available'),
					isNotNull(inventoryItems.bestBeforeDate),
					lt(inventoryItems.bestBeforeDate, todayStr)
				)
			),

		// Distinct locations belonging to the user
		db
			.select({ count: sql<number>`cast(count(*) as integer)` })
			.from(locations)
			.where(eq(locations.userId, userId)),
	]);

	return {
		totalItems: totalResult[0]?.count ?? 0,
		expiringThisWeek: expiringResult[0]?.count ?? 0,
		expiredCount: expiredResult[0]?.count ?? 0,
		locationCount: locationResult[0]?.count ?? 0,
	};
}

// ---------------------------------------------------------------------------
// getExpiringItems
// ---------------------------------------------------------------------------

export async function getExpiringItems(userId: string, days: number = 14) {
	const cutoff = dateOffset(days);
	const todayStr = today();

	return db.query.inventoryItems.findMany({
		where: (item, { and, eq, isNotNull, gte, lte }) =>
			and(
				eq(item.userId, userId),
				eq(item.status, 'available'),
				isNotNull(item.bestBeforeDate),
				gte(item.bestBeforeDate, todayStr),
				lte(item.bestBeforeDate, cutoff)
			),
		orderBy: [asc(inventoryItems.bestBeforeDate)],
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
		},
	});
}

// ---------------------------------------------------------------------------
// getExpiredItems
// ---------------------------------------------------------------------------

export async function getExpiredItems(userId: string) {
	const todayStr = today();

	return db.query.inventoryItems.findMany({
		where: (item, { and, eq, isNotNull, lt }) =>
			and(
				eq(item.userId, userId),
				eq(item.status, 'available'),
				isNotNull(item.bestBeforeDate),
				lt(item.bestBeforeDate, todayStr)
			),
		orderBy: [asc(inventoryItems.bestBeforeDate)],
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
		},
	});
}
