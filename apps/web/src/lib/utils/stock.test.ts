import { describe, it, expect } from 'vitest'
import { buildUnitMetaMap, aggregateStock, compareToTarget, planInventoryAdjustment, type UnitRow } from './stock'
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

describe('compareToTarget', () => {
  it('ok wenn Ist >= Soll (mass)', () => {
    const totals = aggregateStock([{ quantity: '2', unit: 'kg', status: 'available' }], meta)
    const r = compareToTarget(totals, { targetQuantity: '1', unit: 'kg' }, meta)
    expect(r.status).toBe('ok')
    expect(r.currentInBase).toBe(2000)
    expect(r.targetInBase).toBe(1000)
  })

  it('below_target wenn Ist < Soll', () => {
    const totals = aggregateStock([{ quantity: '500', unit: 'g', status: 'available' }], meta)
    const r = compareToTarget(totals, { targetQuantity: '1', unit: 'kg' }, meta)
    expect(r.status).toBe('below_target')
  })

  it('below_min wenn Ist < Min', () => {
    const totals = aggregateStock([{ quantity: '100', unit: 'g', status: 'available' }], meta)
    const r = compareToTarget(totals, { targetQuantity: '1', unit: 'kg', minQuantity: '0.5' }, meta)
    expect(r.status).toBe('below_min')
  })

  it('kein Bestand -> below_target', () => {
    const totals = aggregateStock([], meta)
    const r = compareToTarget(totals, { targetQuantity: '3', unit: 'piece' }, meta)
    expect(r.status).toBe('below_target')
    expect(r.currentInBase).toBe(0)
  })

  it('count symbolgenau: Soll Packung, Ist nur Stück -> not_comparable', () => {
    const totals = aggregateStock([{ quantity: '5', unit: 'piece', status: 'available' }], meta)
    const r = compareToTarget(totals, { targetQuantity: '2', unit: 'Packung' }, meta)
    expect(r.status).toBe('not_comparable')
  })

  it('count exakt: Soll Packung, Ist Packung -> ok', () => {
    const totals = aggregateStock([{ quantity: '3', unit: 'Packung', status: 'available' }], meta)
    const r = compareToTarget(totals, { targetQuantity: '2', unit: 'Packung' }, meta)
    expect(r.status).toBe('ok')
  })
})

describe('planInventoryAdjustment', () => {
  const items = [
    { id: 'a', quantity: '500', unit: 'g', status: 'available', bestBeforeDate: '2026-01-01' },
    { id: 'b', quantity: '1', unit: 'kg', status: 'available', bestBeforeDate: '2026-06-01' },
  ]

  it('reduziert FIFO (aelteste MHD zuerst)', () => {
    // Ist = 1500 g, neuer Ist = 800 g -> 700 g entfernen: zuerst a (500 g) ganz, dann b um 200 g.
    const plan = planInventoryAdjustment(items, 800, { dimension: 'mass' }, meta)
    expect(plan.needsIncrease).toBe(false)
    expect(plan.updates).toContainEqual({ id: 'a', newQuantity: 0 })
    // b: 1000 g - 200 g = 800 g -> in kg = 0.8
    const bUpd = plan.updates.find((u) => u.id === 'b')
    expect(bUpd?.newQuantity).toBeCloseTo(0.8, 5)
  })

  it('leert alles bei neuem Ist 0', () => {
    const plan = planInventoryAdjustment(items, 0, { dimension: 'mass' }, meta)
    expect(plan.updates).toContainEqual({ id: 'a', newQuantity: 0 })
    expect(plan.updates).toContainEqual({ id: 'b', newQuantity: 0 })
  })

  it('signalisiert needsIncrease wenn neuer Ist > aktueller Ist', () => {
    const plan = planInventoryAdjustment(items, 2000, { dimension: 'mass' }, meta)
    expect(plan.needsIncrease).toBe(true)
    expect(plan.updates).toHaveLength(0)
    expect(plan.shortfallInBase).toBeCloseTo(500, 5)
  })

  it('count symbolgenau: reduziert nur passende Einheit', () => {
    const countItems = [
      { id: 'p1', quantity: '3', unit: 'Packung', status: 'available', bestBeforeDate: null },
      { id: 's1', quantity: '5', unit: 'piece', status: 'available', bestBeforeDate: null },
    ]
    const plan = planInventoryAdjustment(countItems, 1, { dimension: 'count', symbol: 'Packung' }, meta)
    // nur Packung betroffen: 3 -> 1
    expect(plan.updates).toEqual([{ id: 'p1', newQuantity: 1 }])
  })
})
