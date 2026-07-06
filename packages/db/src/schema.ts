import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  integer,
  numeric,
  date,
  timestamp,
  jsonb,
  bigserial,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';

// ---------------------------------------------------------------------------
// users
// ---------------------------------------------------------------------------

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  username: varchar('username', { length: 64 }).notNull().unique(),
  displayName: varchar('display_name', { length: 128 }).notNull(),
  email: varchar('email', { length: 255 }).unique(),
  passwordHash: text('password_hash').notNull(),
  isActive: boolean('is_active').notNull().default(true),
  locale: varchar('locale', { length: 10 }).notNull().default('de-DE'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const usersRelations = relations(users, ({ many, one }) => ({
  locations: many(locations),
  inventoryItems: many(inventoryItems),
  expiryConfig: one(expiryConfig, {
    fields: [users.id],
    references: [expiryConfig.userId],
  }),
  stockTargets: many(stockTargets),
  stores: many(stores),
  productStores: many(productStores),
  shoppingListItems: many(shoppingListItems),
  bringSync: many(bringSync),
  auditLog: many(auditLog),
  createdProducts: many(products, { relationName: 'productCreator' }),
}));

// ---------------------------------------------------------------------------
// locations
// ---------------------------------------------------------------------------

export const locations = pgTable('locations', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id),
  name: varchar('name', { length: 128 }).notNull(),
  icon: varchar('icon', { length: 64 }),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const locationsRelations = relations(locations, ({ one, many }) => ({
  user: one(users, {
    fields: [locations.userId],
    references: [users.id],
  }),
  storages: many(storages),
}));

// ---------------------------------------------------------------------------
// storages
// ---------------------------------------------------------------------------

export const storages = pgTable('storages', {
  id: uuid('id').primaryKey().defaultRandom(),
  locationId: uuid('location_id')
    .notNull()
    .references(() => locations.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 128 }).notNull(),
  storageType: varchar('storage_type', { length: 32 }).$type<
    'fridge' | 'freezer' | 'shelf' | 'cabinet' | 'other'
  >(),
  temperatureZone: varchar('temperature_zone', { length: 16 }).$type<
    'ambient' | 'chilled' | 'frozen'
  >(),
  icon: varchar('icon', { length: 64 }),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const storagesRelations = relations(storages, ({ one, many }) => ({
  location: one(locations, {
    fields: [storages.locationId],
    references: [locations.id],
  }),
  places: many(places),
}));

// ---------------------------------------------------------------------------
// places
// ---------------------------------------------------------------------------

export const places = pgTable('places', {
  id: uuid('id').primaryKey().defaultRandom(),
  storageId: uuid('storage_id')
    .notNull()
    .references(() => storages.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 128 }).notNull(),
  icon: varchar('icon', { length: 64 }),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const placesRelations = relations(places, ({ one, many }) => ({
  storage: one(storages, {
    fields: [places.storageId],
    references: [storages.id],
  }),
  inventoryItems: many(inventoryItems),
  stockTargets: many(stockTargets),
}));

// ---------------------------------------------------------------------------
// categories
// ---------------------------------------------------------------------------

export const categories = pgTable('categories', {
  id: uuid('id').primaryKey().defaultRandom(),
  parentId: uuid('parent_id').references((): ReturnType<typeof uuid> => categories.id),
  name: varchar('name', { length: 128 }).notNull(),
  slug: varchar('slug', { length: 128 }).notNull().unique(),
  icon: varchar('icon', { length: 64 }),
  defaultExpiryToleranceDays: integer('default_expiry_tolerance_days').notNull().default(0),
  sortOrder: integer('sort_order').notNull().default(0),
});

export const categoriesRelations = relations(categories, ({ one, many }) => ({
  parent: one(categories, {
    fields: [categories.parentId],
    references: [categories.id],
    relationName: 'categoryParent',
  }),
  children: many(categories, { relationName: 'categoryParent' }),
  products: many(products),
}));

// ---------------------------------------------------------------------------
// products
// ---------------------------------------------------------------------------

export const products = pgTable('products', {
  id: uuid('id').primaryKey().defaultRandom(),
  gtin: varchar('gtin', { length: 14 }).unique(),
  name: varchar('name', { length: 255 }).notNull(),
  brand: varchar('brand', { length: 128 }),
  categoryId: uuid('category_id').references(() => categories.id),
  description: text('description'),
  imageUrl: text('image_url'),
  defaultUnit: varchar('default_unit', { length: 16 }).notNull().default('piece'),
  defaultQuantity: numeric('default_quantity', { precision: 10, scale: 3 }).notNull().default('1'),
  defaultWeightG: numeric('default_weight_g', { precision: 10, scale: 2 }),
  defaultVolumeMl: numeric('default_volume_ml', { precision: 10, scale: 2 }),
  offData: jsonb('off_data'),
  offFetchedAt: timestamp('off_fetched_at'),
  isVerified: boolean('is_verified').notNull().default(false),
  expiryToleranceDays: integer('expiry_tolerance_days'),
  bringItemId: varchar('bring_item_id', { length: 128 }),
  createdBy: uuid('created_by').references(() => users.id, { relationName: 'productCreator' } as any),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const productsRelations = relations(products, ({ one, many }) => ({
  category: one(categories, {
    fields: [products.categoryId],
    references: [categories.id],
  }),
  creator: one(users, {
    fields: [products.createdBy],
    references: [users.id],
    relationName: 'productCreator',
  }),
  nutrients: many(productNutrients),
  inventoryItems: many(inventoryItems),
  stockTargets: many(stockTargets),
  productStores: many(productStores),
  shoppingListItems: many(shoppingListItems),
}));

// ---------------------------------------------------------------------------
// nutrient_types
// ---------------------------------------------------------------------------

export const nutrientTypes = pgTable('nutrient_types', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: varchar('slug', { length: 64 }).notNull().unique(),
  name: varchar('name', { length: 128 }).notNull(),
  unit: varchar('unit', { length: 16 }).notNull(),
  parentId: uuid('parent_id').references((): ReturnType<typeof uuid> => nutrientTypes.id),
  sortOrder: integer('sort_order').notNull().default(0),
  offKey: varchar('off_key', { length: 64 }),
});

export const nutrientTypesRelations = relations(nutrientTypes, ({ one, many }) => ({
  parent: one(nutrientTypes, {
    fields: [nutrientTypes.parentId],
    references: [nutrientTypes.id],
    relationName: 'nutrientTypeParent',
  }),
  children: many(nutrientTypes, { relationName: 'nutrientTypeParent' }),
  productNutrients: many(productNutrients),
}));

// ---------------------------------------------------------------------------
// product_nutrients
// ---------------------------------------------------------------------------

export const productNutrients = pgTable(
  'product_nutrients',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    nutrientTypeId: uuid('nutrient_type_id')
      .notNull()
      .references(() => nutrientTypes.id),
    valuePer100: numeric('value_per_100', { precision: 10, scale: 4 }).notNull(),
    source: varchar('source', { length: 16 }).notNull().default('off'),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => ({
    productNutrientUniq: uniqueIndex('product_nutrients_product_nutrient_uniq').on(
      table.productId,
      table.nutrientTypeId
    ),
  })
);

export const productNutrientsRelations = relations(productNutrients, ({ one }) => ({
  product: one(products, {
    fields: [productNutrients.productId],
    references: [products.id],
  }),
  nutrientType: one(nutrientTypes, {
    fields: [productNutrients.nutrientTypeId],
    references: [nutrientTypes.id],
  }),
}));

// ---------------------------------------------------------------------------
// stores  (declared before inventory_items / stock_targets / shopping_list_items
//          to avoid forward-reference issues)
// ---------------------------------------------------------------------------

export const stores = pgTable('stores', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id),
  name: varchar('name', { length: 128 }).notNull(),
  chain: varchar('chain', { length: 64 }),
  address: text('address'),
  latitude: numeric('latitude', { precision: 9, scale: 6 }),
  longitude: numeric('longitude', { precision: 9, scale: 6 }),
  bringListUuid: varchar('bring_list_uuid', { length: 128 }),
  isFavorite: boolean('is_favorite').notNull().default(false),
  notes: text('notes'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const storesRelations = relations(stores, ({ one, many }) => ({
  user: one(users, {
    fields: [stores.userId],
    references: [users.id],
  }),
  inventoryItems: many(inventoryItems),
  stockTargets: many(stockTargets),
  productStores: many(productStores),
  shoppingListItems: many(shoppingListItems),
  bringSync: many(bringSync),
}));

// ---------------------------------------------------------------------------
// inventory_items
// ---------------------------------------------------------------------------

export const inventoryItems = pgTable('inventory_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  productId: uuid('product_id')
    .notNull()
    .references(() => products.id),
  placeId: uuid('place_id').references(() => places.id),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id),
  quantity: numeric('quantity', { precision: 10, scale: 3 }).notNull().default('1'),
  unit: varchar('unit', { length: 16 }).notNull().default('piece'),
  weightG: numeric('weight_g', { precision: 10, scale: 2 }),
  volumeMl: numeric('volume_ml', { precision: 10, scale: 2 }),
  bestBeforeDate: date('best_before_date'),
  openedAt: timestamp('opened_at'),
  openedExpiryDays: integer('opened_expiry_days'),
  purchaseDate: date('purchase_date'),
  purchasePriceCt: integer('purchase_price_ct'),
  storeId: uuid('store_id').references(() => stores.id),
  lotNumber: varchar('lot_number', { length: 64 }),
  notes: text('notes'),
  status: varchar('status', { length: 16 })
    .notNull()
    .default('available')
    .$type<'available' | 'consumed' | 'expired' | 'donated' | 'discarded'>(),
  consumedAt: timestamp('consumed_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const inventoryItemsRelations = relations(inventoryItems, ({ one }) => ({
  product: one(products, {
    fields: [inventoryItems.productId],
    references: [products.id],
  }),
  place: one(places, {
    fields: [inventoryItems.placeId],
    references: [places.id],
  }),
  user: one(users, {
    fields: [inventoryItems.userId],
    references: [users.id],
  }),
  store: one(stores, {
    fields: [inventoryItems.storeId],
    references: [stores.id],
  }),
}));

// ---------------------------------------------------------------------------
// expiry_config
// ---------------------------------------------------------------------------

export const expiryConfig = pgTable('expiry_config', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .unique()
    .references(() => users.id),
  yellowDaysBefore: integer('yellow_days_before').notNull().default(7),
  redDaysBefore: integer('red_days_before').notNull().default(2),
  graceDaysAfter: integer('grace_days_after').notNull().default(0),
});

export const expiryConfigRelations = relations(expiryConfig, ({ one }) => ({
  user: one(users, {
    fields: [expiryConfig.userId],
    references: [users.id],
  }),
}));

// ---------------------------------------------------------------------------
// stock_targets
// ---------------------------------------------------------------------------

export const stockTargets = pgTable(
  'stock_targets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id),
    targetQuantity: numeric('target_quantity', { precision: 10, scale: 3 }).notNull(),
    unit: varchar('unit', { length: 16 }).notNull().default('piece'),
    minQuantity: numeric('min_quantity', { precision: 10, scale: 3 }),
    preferredPlaceId: uuid('preferred_place_id').references(() => places.id),
    preferredStoreId: uuid('preferred_store_id').references(() => stores.id),
    notes: text('notes'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => ({
    stockTargetUserProductUniq: uniqueIndex('stock_targets_user_product_uniq').on(
      table.userId,
      table.productId
    ),
  })
);

export const stockTargetsRelations = relations(stockTargets, ({ one }) => ({
  user: one(users, {
    fields: [stockTargets.userId],
    references: [users.id],
  }),
  product: one(products, {
    fields: [stockTargets.productId],
    references: [products.id],
  }),
  preferredPlace: one(places, {
    fields: [stockTargets.preferredPlaceId],
    references: [places.id],
  }),
  preferredStore: one(stores, {
    fields: [stockTargets.preferredStoreId],
    references: [stores.id],
  }),
}));

// ---------------------------------------------------------------------------
// product_stores
// ---------------------------------------------------------------------------

export const productStores = pgTable(
  'product_stores',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    storeId: uuid('store_id')
      .notNull()
      .references(() => stores.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    priority: varchar('priority', { length: 16 })
      .notNull()
      .default('secondary')
      .$type<'primary' | 'secondary'>(),
    storeSku: varchar('store_sku', { length: 64 }),
    lastSeenPriceCt: integer('last_seen_price_ct'),
    lastSeenAt: date('last_seen_at'),
    notes: text('notes'),
  },
  (table) => ({
    productStoreUserUniq: uniqueIndex('product_stores_product_store_user_uniq').on(
      table.productId,
      table.storeId,
      table.userId
    ),
  })
);

export const productStoresRelations = relations(productStores, ({ one }) => ({
  product: one(products, {
    fields: [productStores.productId],
    references: [products.id],
  }),
  store: one(stores, {
    fields: [productStores.storeId],
    references: [stores.id],
  }),
  user: one(users, {
    fields: [productStores.userId],
    references: [users.id],
  }),
}));

// ---------------------------------------------------------------------------
// shopping_list_items
// ---------------------------------------------------------------------------

export const shoppingListItems = pgTable('shopping_list_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id),
  productId: uuid('product_id').references(() => products.id),
  freeTextName: varchar('free_text_name', { length: 255 }),
  quantity: numeric('quantity', { precision: 10, scale: 3 }).notNull().default('1'),
  unit: varchar('unit', { length: 16 }).notNull().default('piece'),
  source: varchar('source', { length: 16 })
    .notNull()
    .default('manual')
    .$type<'manual' | 'auto' | 'bring'>(),
  priority: integer('priority').notNull().default(0),
  preferredStoreId: uuid('preferred_store_id').references(() => stores.id),
  isChecked: boolean('is_checked').notNull().default(false),
  checkedAt: timestamp('checked_at'),
  bringsSyncedAt: timestamp('bring_synced_at'),
  bringItemUuid: varchar('bring_item_uuid', { length: 128 }),
  notes: text('notes'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const shoppingListItemsRelations = relations(shoppingListItems, ({ one }) => ({
  user: one(users, {
    fields: [shoppingListItems.userId],
    references: [users.id],
  }),
  product: one(products, {
    fields: [shoppingListItems.productId],
    references: [products.id],
  }),
  preferredStore: one(stores, {
    fields: [shoppingListItems.preferredStoreId],
    references: [stores.id],
  }),
}));

// ---------------------------------------------------------------------------
// bring_sync_log
// ---------------------------------------------------------------------------

export const bringSync = pgTable('bring_sync_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id),
  direction: varchar('direction', { length: 8 })
    .notNull()
    .$type<'export' | 'import'>(),
  storeId: uuid('store_id').references(() => stores.id),
  itemCount: integer('item_count'),
  status: varchar('status', { length: 16 })
    .notNull()
    .$type<'success' | 'partial' | 'failed'>(),
  errorMessage: text('error_message'),
  payload: jsonb('payload'),
  syncedAt: timestamp('synced_at').notNull().default(sql`now()`),
});

export const bringSyncRelations = relations(bringSync, ({ one }) => ({
  user: one(users, {
    fields: [bringSync.userId],
    references: [users.id],
  }),
  store: one(stores, {
    fields: [bringSync.storeId],
    references: [stores.id],
  }),
}));

// ---------------------------------------------------------------------------
// audit_log
// ---------------------------------------------------------------------------

export const auditLog = pgTable('audit_log', {
  id: bigserial('id', { mode: 'bigint' }).primaryKey(),
  userId: uuid('user_id').references(() => users.id),
  action: varchar('action', { length: 16 })
    .notNull()
    .$type<'INSERT' | 'UPDATE' | 'DELETE'>(),
  tableName: varchar('table_name', { length: 64 }).notNull(),
  recordId: uuid('record_id').notNull(),
  oldValues: jsonb('old_values'),
  newValues: jsonb('new_values'),
  changedFields: text('changed_fields').array(),
  ipAddress: varchar('ip_address', { length: 45 }),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at').notNull().default(sql`now()`),
});

export const auditLogRelations = relations(auditLog, ({ one }) => ({
  user: one(users, {
    fields: [auditLog.userId],
    references: [users.id],
  }),
}));
