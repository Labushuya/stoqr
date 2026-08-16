export * from './schema'
export * from './client'

// Reine Werkszustands-Seed-Daten (ohne die runSeed()-Funktionen, die das globale
// db binden) — damit der Werksreset sie in seiner eigenen Transaktion neu
// einspielen kann, ohne die Daten zu duplizieren.
export { categorySeeds } from '../seeds/categories'
export { nutrientTypeSeeds } from '../seeds/nutrient-types'

// Datei-basierter Import/Export (Erstbefuellung Pi <-> App). Dialekt-neutral,
// haengt nur an drizzle-orm (getTableColumns) — kein Client-Zug, fuer beide
// Targets sicher.
export * from './transfer'
export * from './transfer-io'

