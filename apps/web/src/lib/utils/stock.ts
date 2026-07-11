// ---------------------------------------------------------------------------
// Bestands-Aggregation mit Einheiten-Umrechnung (reine Funktionen, testbar).
//
// Jeder Bestand (inventory_items) hat eine eigene Einheit (String = units.symbol).
// mass/volume-Einheiten werden über to_base_factor auf die Basiseinheit (g bzw. ml)
// normalisiert und summiert; count-artige Einheiten (Stück/Packung/…) sind nicht
// ineinander umrechenbar und werden je Symbol getrennt ausgewiesen.
// ---------------------------------------------------------------------------

export type Dimension = 'mass' | 'volume' | 'count'

export type UnitMeta = {
  symbol: string
  name: string
  dimension: Dimension
  toBaseFactor: number
}

// Rohform aus getUnits() — numeric-Felder kommen als String aus der DB.
export type UnitRow = {
  symbol: string
  name: string
  householdId: string | null
  dimension?: string | null
  toBaseFactor?: string | number | null
}

export type StockGroup = {
  dimension: Dimension
  totalInBase: number // Summe in Basiseinheit (g / ml / Stückzahl)
  displayValue: number // ggf. skaliert (>=1000 g -> kg)
  displayUnit: string // Symbol der Anzeige-Einheit
  displayName: string // Anzeige-Name (z.B. "Packung", "kg")
}

export type StockTotals = {
  groups: StockGroup[]
  itemCount: number // Anzahl available Bestände
}

/**
 * Baut eine Symbol → UnitMeta Map. Bei Symbol-Kollision haben Custom-Units
 * (householdId gesetzt) Vorrang vor System-Units (householdId null).
 */
export function buildUnitMetaMap(units: UnitRow[]): Map<string, UnitMeta> {
  const map = new Map<string, UnitMeta>()
  for (const u of units) {
    const existing = map.get(u.symbol)
    const isCustom = u.householdId != null
    // Custom überschreibt System; System überschreibt nichts Bestehendes.
    if (existing && !isCustom) continue
    map.set(u.symbol, {
      symbol: u.symbol,
      name: u.name,
      dimension: (u.dimension as Dimension) ?? 'count',
      toBaseFactor: u.toBaseFactor != null ? parseFloat(String(u.toBaseFactor)) : 1,
    })
  }
  return map
}

// Reihenfolge der Gruppen: count zuerst, dann mass, dann volume (deterministisch).
const DIMENSION_ORDER: Record<Dimension, number> = { count: 0, mass: 1, volume: 2 }

/**
 * Aggregiert available-Bestände zu einer nach Einheit gruppierten Gesamtsumme.
 */
export function aggregateStock(
  items: Array<{ quantity: string | number; unit: string; status: string }>,
  metaMap: Map<string, UnitMeta>
): StockTotals {
  const available = items.filter((i) => i.status === 'available')

  // Gruppierungsschlüssel: mass/volume pro Dimension zusammenfassen,
  // count pro Symbol getrennt.
  const buckets = new Map<string, { dimension: Dimension; totalInBase: number; unitSymbol: string }>()

  for (const item of available) {
    const meta =
      metaMap.get(item.unit) ??
      ({ symbol: item.unit, name: item.unit, dimension: 'count', toBaseFactor: 1 } as UnitMeta)
    const qty = parseFloat(String(item.quantity)) || 0
    const key = meta.dimension === 'count' ? `count:${meta.symbol}` : meta.dimension

    const bucket = buckets.get(key)
    if (bucket) {
      bucket.totalInBase += qty * meta.toBaseFactor
    } else {
      buckets.set(key, {
        dimension: meta.dimension,
        totalInBase: qty * meta.toBaseFactor,
        unitSymbol: meta.symbol,
      })
    }
  }

  const groups: StockGroup[] = []
  for (const b of buckets.values()) {
    groups.push(toDisplayGroup(b, metaMap))
  }

  groups.sort((a, b) => {
    const d = DIMENSION_ORDER[a.dimension] - DIMENSION_ORDER[b.dimension]
    return d !== 0 ? d : a.displayUnit.localeCompare(b.displayUnit)
  })

  return { groups, itemCount: available.length }
}

// Wählt die Anzeige-Einheit einer Gruppe (mass >=1000g -> kg, volume >=1000ml -> l).
function toDisplayGroup(
  bucket: { dimension: Dimension; totalInBase: number; unitSymbol: string },
  metaMap: Map<string, UnitMeta>
): StockGroup {
  const { dimension, totalInBase } = bucket

  if (dimension === 'mass') {
    if (totalInBase >= 1000) {
      return { dimension, totalInBase, displayValue: totalInBase / 1000, displayUnit: 'kg', displayName: nameFor('kg', metaMap, 'kg') }
    }
    return { dimension, totalInBase, displayValue: totalInBase, displayUnit: 'g', displayName: nameFor('g', metaMap, 'g') }
  }

  if (dimension === 'volume') {
    if (totalInBase >= 1000) {
      return { dimension, totalInBase, displayValue: totalInBase / 1000, displayUnit: 'l', displayName: nameFor('l', metaMap, 'l') }
    }
    return { dimension, totalInBase, displayValue: totalInBase, displayUnit: 'ml', displayName: nameFor('ml', metaMap, 'ml') }
  }

  // count: das Symbol selbst ist die Anzeige-Einheit
  const symbol = bucket.unitSymbol
  return {
    dimension,
    totalInBase,
    displayValue: totalInBase,
    displayUnit: symbol,
    displayName: nameFor(symbol, metaMap, symbol),
  }
}

function nameFor(symbol: string, metaMap: Map<string, UnitMeta>, fallback: string): string {
  return metaMap.get(symbol)?.name ?? fallback
}
