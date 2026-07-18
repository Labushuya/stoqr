// ---------------------------------------------------------------------------
// Globus-Preis-Parser (reine Funktionen, testbar) — Block F2.
//
// Extrahiert aus einer Globus-Produktseite (HTML) einen Preis in Cent. Bewusst
// Best-Effort und defensiv: bei fehlendem Selektor, unerwartetem Markup, leerem
// Text oder unparsbarem Preis wird IMMER `null` zurueckgegeben — nie geworfen.
// Der Netzwerk-Teil liegt server-only in lib/server/scrape/globus.ts.
// ---------------------------------------------------------------------------

import { parse } from 'node-html-parser'

// Zentrale Selektor-Konstante: bei HTML-Aenderungen auf Globus nur hier anpassen.
export const GLOBUS_PRICE_SELECTOR = 'div.unit-price .discount-price'

// Platzhalter in der Markt-Abruf-URL, der beim Abruf durch die Artikel-GTIN ersetzt wird.
export const EAN_PLACEHOLDER = '{EAN}'

/**
 * Setzt die GTIN in eine Markt-Abruf-URL ein (G4). Enthaelt die Vorlage den
 * {EAN}-Platzhalter, muss eine GTIN vorhanden sein (sonst null). Ohne Platzhalter
 * wird die URL unveraendert zurueckgegeben (statische Produkt-URL bleibt erlaubt).
 * Defensiv: leere Vorlage → null.
 */
export function applyEanToUrl(
  template: string | null | undefined,
  gtin: string | null | undefined,
): string | null {
  const tpl = typeof template === 'string' ? template.trim() : ''
  if (tpl === '') return null
  if (!tpl.includes(EAN_PLACEHOLDER)) return tpl
  const g = typeof gtin === 'string' ? gtin.trim() : ''
  if (g === '') return null
  return tpl.split(EAN_PLACEHOLDER).join(encodeURIComponent(g))
}

export type ParsedPrice = {
  priceCt: number
  raw: string
}

/**
 * Wandelt einen Preistext in Cent um.
 * - „Ab 1,19 €" → 119, „2 €" → 200, „12,50 €" → 1250, „1.19 €" → 119
 * - komma/punkt-tolerant; kein erkennbarer Preis → `null`
 */
export function parseEuroToCents(text: string | null | undefined): number | null {
  if (typeof text !== 'string') return null
  // Euro mit Dezimalstellen: „1,19 €" / „12.50 €" (2 Nachkommastellen bevorzugt).
  const dec = text.match(/(\d{1,4})[.,](\d{2})\s*€/)
  if (dec) {
    const euros = Number.parseInt(dec[1], 10)
    const cents = Number.parseInt(dec[2], 10)
    if (Number.isFinite(euros) && Number.isFinite(cents)) return euros * 100 + cents
  }
  // Ganzzahliger Euro-Betrag ohne Nachkommastellen: „2 €".
  const whole = text.match(/(\d{1,4})\s*€/)
  if (whole) {
    const euros = Number.parseInt(whole[1], 10)
    if (Number.isFinite(euros)) return euros * 100
  }
  return null
}

/**
 * Parst ein Globus-Produkt-HTML und liefert den Preis in Cent.
 * Alles defensiv: jeder Fehler / fehlende Treffer → `null`.
 */
export function parseGlobusPriceHtml(html: string | null | undefined): ParsedPrice | null {
  if (typeof html !== 'string' || html.length === 0) return null
  try {
    const root = parse(html)
    const el = root.querySelector(GLOBUS_PRICE_SELECTOR)
    if (!el) return null
    const raw = el.text?.trim() ?? ''
    if (!raw) return null
    const priceCt = parseEuroToCents(raw)
    if (priceCt === null || priceCt <= 0) return null
    return { priceCt, raw }
  } catch {
    return null
  }
}
