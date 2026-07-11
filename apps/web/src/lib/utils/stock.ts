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

// ---------------------------------------------------------------------------
// Soll-Ist-Vergleich (Inkrement 2b)
// ---------------------------------------------------------------------------

export type TargetInput = {
  targetQuantity: string | number
  unit: string
  minQuantity?: string | number | null
}

export type TargetStatus = {
  status: 'ok' | 'below_target' | 'below_min' | 'not_comparable'
  targetInBase: number // Soll in Basiseinheit
  currentInBase: number // Ist in Basiseinheit (0 wenn keine passende Gruppe)
  minInBase: number | null
  unit: string // Soll-Einheit (Symbol)
  dimension: Dimension
}

/**
 * Vergleicht den aggregierten Ist-Bestand mit einem Soll (targetQuantity + unit + optional min).
 *
 * - mass/volume: passende Ist-Gruppe über die Dimension (via toBaseFactor umgerechnet).
 * - count: passende Ist-Gruppe nur über exakt dasselbe Symbol (nicht ineinander umrechenbar).
 * - Findet sich keine dimensionskompatible Ist-Gruppe → status 'not_comparable'.
 * Vergleich immer auf totalInBase (nicht displayValue).
 */
export function compareToTarget(
  totals: StockTotals,
  target: TargetInput,
  metaMap: Map<string, UnitMeta>
): TargetStatus {
  const meta =
    metaMap.get(target.unit) ??
    ({ symbol: target.unit, name: target.unit, dimension: 'count', toBaseFactor: 1 } as UnitMeta)

  const targetQty = parseFloat(String(target.targetQuantity)) || 0
  const targetInBase = targetQty * meta.toBaseFactor
  const minQty =
    target.minQuantity != null && target.minQuantity !== ''
      ? parseFloat(String(target.minQuantity))
      : null
  const minInBase = minQty != null ? minQty * meta.toBaseFactor : null

  // Passende Ist-Gruppe finden.
  const group = totals.groups.find((g) => {
    if (meta.dimension === 'count') {
      return g.dimension === 'count' && g.displayUnit === meta.symbol
    }
    return g.dimension === meta.dimension
  })

  if (!group) {
    // Kein Ist in dieser Dimension/Einheit vorhanden → currentInBase 0,
    // aber vergleichbar (Bedarf = ganzes Soll), außer es gibt Ist in ANDEREN
    // count-Symbolen, das wir nicht verrechnen können.
    const hasIncompatibleCount =
      meta.dimension === 'count' && totals.groups.some((g) => g.dimension === 'count')
    if (hasIncompatibleCount) {
      return {
        status: 'not_comparable',
        targetInBase,
        currentInBase: 0,
        minInBase,
        unit: meta.symbol,
        dimension: meta.dimension,
      }
    }
    // Sonst: kein Bestand → unter Soll (bzw. unter Min).
    const status = minInBase != null && 0 < minInBase ? 'below_min' : 'below_target'
    return { status, targetInBase, currentInBase: 0, minInBase, unit: meta.symbol, dimension: meta.dimension }
  }

  const currentInBase = group.totalInBase
  let status: TargetStatus['status']
  if (minInBase != null && currentInBase < minInBase) status = 'below_min'
  else if (currentInBase < targetInBase) status = 'below_target'
  else status = 'ok'

  return { status, targetInBase, currentInBase, minInBase, unit: meta.symbol, dimension: meta.dimension }
}
