import { describe, it, expect } from 'vitest'
import { buildUnitMetaMap, type UnitRow } from './stock'
import { estimateLineCost, summarizeCosts, formatEuroApprox } from './prices'

const SYSTEM_UNITS: UnitRow[] = [
  { symbol: 'piece', name: 'Stück', householdId: null, dimension: 'count', toBaseFactor: '1' },
  { symbol: 'g', name: 'Gramm', householdId: null, dimension: 'mass', toBaseFactor: '1' },
  { symbol: 'kg', name: 'Kilogramm', householdId: null, dimension: 'mass', toBaseFactor: '1000' },
  { symbol: 'ml', name: 'Milliliter', householdId: null, dimension: 'volume', toBaseFactor: '1' },
  { symbol: 'l', name: 'Liter', householdId: null, dimension: 'volume', toBaseFactor: '1000' },
  { symbol: 'Packung', name: 'Packung', householdId: null, dimension: 'count', toBaseFactor: '1' },
]
const meta = buildUnitMetaMap(SYSTEM_UNITS)

describe('estimateLineCost', () => {
  it('kein Preis → cents null, hasPrice false', () => {
    const r = estimateLineCost(2, 'piece', null, meta)
    expect(r).toEqual({ cents: null, comparable: true, hasPrice: false })
  })

  it('count gleiche Einheit: Menge × Preis', () => {
    // 2 Packung × 1,19 € = 2,38 €
    const r = estimateLineCost(2, 'Packung', { priceCt: 119, unit: 'Packung' }, meta)
    expect(r.cents).toBe(238)
    expect(r.comparable).toBe(true)
  })

  it('count verschiedene Symbole → nicht vergleichbar', () => {
    const r = estimateLineCost(2, 'piece', { priceCt: 100, unit: 'Packung' }, meta)
    expect(r).toEqual({ cents: null, comparable: false, hasPrice: true })
  })

  it('mass: Preis pro kg, Bedarf in g (500 g bei 1,50 €/kg = 0,75 €)', () => {
    const r = estimateLineCost(500, 'g', { priceCt: 150, unit: 'kg' }, meta)
    expect(r.cents).toBe(75)
    expect(r.comparable).toBe(true)
  })

  it('mass: Preis pro g, Bedarf in kg (2 kg bei 0,20 €/100 g... hier 1 ct/g → 2000 ct)', () => {
    const r = estimateLineCost(2, 'kg', { priceCt: 1, unit: 'g' }, meta)
    expect(r.cents).toBe(2000)
  })

  it('volume: Preis pro l, Bedarf in ml (250 ml bei 2,00 €/l = 0,50 €)', () => {
    const r = estimateLineCost(250, 'ml', { priceCt: 200, unit: 'l' }, meta)
    expect(r.cents).toBe(50)
  })

  it('dimension-mismatch (mass vs volume) → nicht vergleichbar', () => {
    const r = estimateLineCost(1, 'kg', { priceCt: 100, unit: 'l' }, meta)
    expect(r).toEqual({ cents: null, comparable: false, hasPrice: true })
  })

  it('count vs mass → nicht vergleichbar', () => {
    const r = estimateLineCost(1, 'Packung', { priceCt: 100, unit: 'kg' }, meta)
    expect(r.comparable).toBe(false)
    expect(r.cents).toBeNull()
  })

  it('rundet auf ganze Cent', () => {
    // 333 g bei 1,00 €/kg = 33,3 ct → 33
    const r = estimateLineCost(333, 'g', { priceCt: 100, unit: 'kg' }, meta)
    expect(r.cents).toBe(33)
  })
})

describe('summarizeCosts', () => {
  it('summiert nur bezifferbare Positionen und zählt Lücken', () => {
    const lines = [
      { cents: 238, comparable: true, hasPrice: true },
      { cents: null, comparable: true, hasPrice: false }, // ohne Preis
      { cents: 75, comparable: true, hasPrice: true },
      { cents: null, comparable: false, hasPrice: true }, // inkompatibel
    ]
    const s = summarizeCosts(lines)
    expect(s.totalCents).toBe(313)
    expect(s.itemsWithoutPrice).toBe(1)
    expect(s.itemsNotComparable).toBe(1)
    expect(s.isPartial).toBe(true)
  })

  it('isPartial false, wenn alle Positionen beziffert', () => {
    const s = summarizeCosts([
      { cents: 100, comparable: true, hasPrice: true },
      { cents: 50, comparable: true, hasPrice: true },
    ])
    expect(s).toEqual({ totalCents: 150, itemsWithoutPrice: 0, itemsNotComparable: 0, isPartial: false })
  })
})

describe('formatEuroApprox', () => {
  it('formatiert Cent als ca. ~-Betrag', () => {
    const s = formatEuroApprox(238)
    expect(s.startsWith('ca. ~')).toBe(true)
    expect(s).toContain('2,38')
    expect(s).toContain('€')
  })
})
