import { describe, it, expect } from 'vitest'
import { buildUnitMetaMap, aggregateStock, type UnitRow } from './stock'
import { formatStockTotal } from './format'

// Repräsentative System-Units (wie in Migration 0007 gebackfillt).
const SYSTEM_UNITS: UnitRow[] = [
  { symbol: 'piece', name: 'Stück', householdId: null, dimension: 'count', toBaseFactor: '1' },
  { symbol: 'g', name: 'Gramm', householdId: null, dimension: 'mass', toBaseFactor: '1' },
  { symbol: 'kg', name: 'Kilogramm', householdId: null, dimension: 'mass', toBaseFactor: '1000' },
  { symbol: 'ml', name: 'Milliliter', householdId: null, dimension: 'volume', toBaseFactor: '1' },
  { symbol: 'l', name: 'Liter', householdId: null, dimension: 'volume', toBaseFactor: '1000' },
  { symbol: 'Packung', name: 'Packung', householdId: null, dimension: 'count', toBaseFactor: '1' },
]

const meta = buildUnitMetaMap(SYSTEM_UNITS)

describe('buildUnitMetaMap', () => {
  it('parst toBaseFactor als Zahl', () => {
    expect(meta.get('kg')?.toBaseFactor).toBe(1000)
  })

  it('gibt Custom-Units Vorrang vor System bei Symbol-Kollision', () => {
    const m = buildUnitMetaMap([
      { symbol: 'kg', name: 'Kilogramm', householdId: null, dimension: 'mass', toBaseFactor: '1000' },
      { symbol: 'kg', name: 'Eigene kg', householdId: 'h1', dimension: 'count', toBaseFactor: '1' },
    ])
    expect(m.get('kg')?.name).toBe('Eigene kg')
    expect(m.get('kg')?.dimension).toBe('count')
  })
})

describe('aggregateStock', () => {
  it('summiert g + kg zu einer Massegruppe und skaliert auf kg', () => {
    const totals = aggregateStock(
      [
        { quantity: '500', unit: 'g', status: 'available' },
        { quantity: '1', unit: 'kg', status: 'available' },
      ],
      meta
    )
    expect(totals.groups).toHaveLength(1)
    expect(totals.groups[0].dimension).toBe('mass')
    expect(totals.groups[0].totalInBase).toBe(1500)
    expect(totals.groups[0].displayValue).toBe(1.5)
    expect(totals.groups[0].displayUnit).toBe('kg')
    expect(totals.itemCount).toBe(2)
  })

  it('bleibt bei <1000 g in Gramm', () => {
    const totals = aggregateStock([{ quantity: '300', unit: 'g', status: 'available' }], meta)
    expect(totals.groups[0].displayUnit).toBe('g')
    expect(totals.groups[0].displayValue).toBe(300)
  })

  it('trennt count-Einheiten von mass (zwei Gruppen)', () => {
    const totals = aggregateStock(
      [
        { quantity: '2', unit: 'Packung', status: 'available' },
        { quantity: '1', unit: 'kg', status: 'available' },
      ],
      meta
    )
    expect(totals.groups).toHaveLength(2)
    // count zuerst
    expect(totals.groups[0].displayUnit).toBe('Packung')
    expect(totals.groups[0].displayValue).toBe(2)
    expect(totals.groups[1].displayUnit).toBe('kg')
  })

  it('ignoriert nicht-available Bestände', () => {
    const totals = aggregateStock(
      [
        { quantity: '1', unit: 'kg', status: 'available' },
        { quantity: '5', unit: 'kg', status: 'consumed' },
      ],
      meta
    )
    expect(totals.groups[0].totalInBase).toBe(1000)
    expect(totals.itemCount).toBe(1)
  })

  it('behandelt unbekanntes Symbol als eigene count-Gruppe', () => {
    const totals = aggregateStock([{ quantity: '3', unit: 'Beutel', status: 'available' }], meta)
    expect(totals.groups).toHaveLength(1)
    expect(totals.groups[0].dimension).toBe('count')
    expect(totals.groups[0].displayUnit).toBe('Beutel')
    expect(totals.groups[0].displayValue).toBe(3)
  })

  it('summiert ml + l zu Liter', () => {
    const totals = aggregateStock(
      [
        { quantity: '750', unit: 'ml', status: 'available' },
        { quantity: '1', unit: 'l', status: 'available' },
      ],
      meta
    )
    expect(totals.groups[0].dimension).toBe('volume')
    expect(totals.groups[0].displayValue).toBe(1.75)
    expect(totals.groups[0].displayUnit).toBe('l')
  })
})

describe('formatStockTotal', () => {
  it('formatiert gemischte Gruppen deutsch', () => {
    const totals = aggregateStock(
      [
        { quantity: '2', unit: 'Packung', status: 'available' },
        { quantity: '1500', unit: 'g', status: 'available' },
      ],
      meta
    )
    expect(formatStockTotal(totals)).toBe('2 Packung + 1,5 kg')
  })

  it('gibt — für leere Bestände zurück', () => {
    expect(formatStockTotal({ groups: [], itemCount: 0 })).toBe('—')
  })
})
