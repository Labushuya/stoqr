// ---------------------------------------------------------------------------
// Preis-Schätzung (reine Funktionen, testbar) — Block F / M3.
//
// Preise (product_prices) sind pro Einheit gespeichert. Die Schätzung rechnet
// eine benötigte Menge in der Bedarfseinheit gegen den Preis in der Preis-Einheit
// — mit derselben toBaseFactor-Semantik wie die Bestands-Aggregation (stock.ts).
// mass/volume sind über die Basiseinheit umrechenbar; count-Einheiten nur bei
// exakt gleichem Symbol. Ist keine Umrechnung möglich → nicht vergleichbar.
// ---------------------------------------------------------------------------

import { resolveUnitMeta, type UnitMeta, type PackSize } from './stock'

export type PriceInfo = {
  priceCt: number // Preis pro Einheit (Cent)
  unit: string // Preis-Einheit (units.symbol)
  // Pfand (G47): Betrag je Stück (Cent) + ob der priceCt das Pfand schon enthält.
  depositCt?: number | null
  priceIncludesDeposit?: boolean
}

export type LineEstimate = {
  cents: number | null // geschätzte WARE-Kosten dieser Position (OHNE Pfand; null = nicht bezifferbar)
  depositCents: number // separat ausgewiesenes Pfand dieser Position (0 wenn keins/schon enthalten)
  depositUnknown: boolean // true = Artikel hat Pfand, aber Stückzahl nicht ableitbar (kg/l ohne Gebinde)
  comparable: boolean // false = Einheit inkompatibel (kein Preis vs. inkompatibel unterscheiden)
  hasPrice: boolean // false = für (Artikel,Markt) kein aktueller Preis vorhanden
}

/**
 * Schätzt die Kosten einer Position: benötigte Menge × Preis-pro-Einheit.
 * - kein Preis → { cents: null, comparable: true, hasPrice: false }
 * - Einheit inkompatibel → { cents: null, comparable: false, hasPrice: true }
 * - sonst gerundete Cent-Kosten.
 */
export function estimateLineCost(
  qty: number,
  needUnit: string,
  price: PriceInfo | null | undefined,
  metaMap: Map<string, UnitMeta>,
  packSize?: PackSize,
): LineEstimate {
  if (!price) return { cents: null, depositCents: 0, depositUnknown: false, comparable: true, hasPrice: false }

  // Pfand (G47): fällt JE STÜCK an. depositCt gesetzt & Preis enthält es NICHT →
  // separat ausweisen. Stückzahl: count = qty; mass/volume nur über packSize
  // (Basismenge / Basismenge-je-Gebinde), sonst nicht bezifferbar → Hinweis.
  const wantsDeposit = price.depositCt != null && price.depositCt > 0 && price.priceIncludesDeposit === false

  // packSize (Gebinde des Artikels) wird auf BEIDE Symbole angewandt, damit
  // „Preis pro Flasche" gegen „Bedarf in l" (und umgekehrt) vergleichbar wird.
  const needMeta = resolveUnitMeta(needUnit, metaMap, packSize)
  const priceMeta = resolveUnitMeta(price.unit, metaMap, packSize)

  // count ist nur bei exakt gleichem Symbol vergleichbar.
  if (needMeta.dimension === 'count' || priceMeta.dimension === 'count') {
    if (needMeta.symbol !== priceMeta.symbol) {
      return { cents: null, depositCents: 0, depositUnknown: false, comparable: false, hasPrice: true }
    }
    const depositCents = wantsDeposit ? Math.round(qty * (price.depositCt as number)) : 0
    return { cents: Math.round(qty * price.priceCt), depositCents, depositUnknown: false, comparable: true, hasPrice: true }
  }

  // mass/volume: nur bei gleicher Dimension umrechenbar.
  if (needMeta.dimension !== priceMeta.dimension) {
    return { cents: null, depositCents: 0, depositUnknown: false, comparable: false, hasPrice: true }
  }

  const needBase = qty * needMeta.toBaseFactor // in Basiseinheit (g / ml)
  const pricePerBase = price.priceCt / (priceMeta.toBaseFactor || 1) // Cent pro Basiseinheit
  // Stückzahl bei mass/volume nur über die Gebinde-Größe (packSize) rekonstruierbar.
  let depositCents = 0
  let depositUnknown = false
  if (wantsDeposit) {
    if (packSize && packSize.baseFactor > 0) {
      const pieces = needBase / packSize.baseFactor
      depositCents = Math.round(pieces * (price.depositCt as number))
    } else {
      depositUnknown = true // Pfand vorhanden, aber Stückzahl ohne Gebinde nicht ableitbar.
    }
  }
  return { cents: Math.round(needBase * pricePerBase), depositCents, depositUnknown, comparable: true, hasPrice: true }
}

export type CostSummary = {
  totalCents: number // Summe der bezifferbaren WARE-Positionen (ohne Pfand)
  totalDepositCents: number // separat: Summe des Pfands
  itemsWithoutPrice: number // Positionen ohne aktuellen Preis
  itemsNotComparable: number // Positionen mit inkompatibler Einheit
  itemsDepositUnknown: number // Positionen mit Pfand, aber ohne ableitbare Stückzahl
  isPartial: boolean // true, wenn mind. eine Position nicht in die Summe einging
}

/** Summiert Positions-Schätzungen und zählt Lücken (für die Warnung). */
export function summarizeCosts(lines: LineEstimate[]): CostSummary {
  let totalCents = 0
  let totalDepositCents = 0
  let itemsWithoutPrice = 0
  let itemsNotComparable = 0
  let itemsDepositUnknown = 0
  for (const l of lines) {
    if (l.cents != null) {
      totalCents += l.cents
    } else if (!l.hasPrice) {
      itemsWithoutPrice++
    } else if (!l.comparable) {
      itemsNotComparable++
    }
    totalDepositCents += l.depositCents
    if (l.depositUnknown) itemsDepositUnknown++
  }
  return {
    totalCents,
    totalDepositCents,
    itemsWithoutPrice,
    itemsNotComparable,
    itemsDepositUnknown,
    isPartial: itemsWithoutPrice > 0 || itemsNotComparable > 0,
  }
}

/** Formatiert Cent als „ca. ~X,XX €" (de-DE). */
export function formatEuroApprox(cents: number): string {
  const euro = (cents / 100).toLocaleString('de-DE', {
    style: 'currency',
    currency: 'EUR',
  })
  return `ca. ~${euro}`
}

/** Formatiert Cent als „X,XX €" (ohne „ca."-Präfix, z.B. für einen konkreten Preis). */
export function formatEuro(cents: number): string {
  return (cents / 100).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })
}
