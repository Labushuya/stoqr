// ---------------------------------------------------------------------------
// Online-Preis-Abruf (server-only, I/O) — Block F2.
//
// Failsafe „in jeder Hinsicht": scrapeGlobusPrice wirft NIE. Timeout (8s),
// Netz-, DNS-, HTTP-, Parse- und Selektor-Fehler enden alle in `null`. Der
// reine HTML-Parser liegt testbar in lib/utils/globus-price.ts.
// Opt-in ueber PRICE_SCRAPE_ENABLED (default AUS).
// ---------------------------------------------------------------------------

import { env } from '$env/dynamic/private'
import { parseGlobusPriceHtml, buildGlobusSearchUrl, type ParsedPrice } from '$lib/utils/globus-price'

const TIMEOUT_MS = 8000
const DEFAULT_USER_AGENT = 'stoqr-price/0.1'

/** Feature-Flag: Online-Preis-Abruf nur aktiv, wenn ausdruecklich eingeschaltet. */
export function isPriceScrapeEnabled(): boolean {
  return env.PRICE_SCRAPE_ENABLED === 'true'
}

/**
 * Ermittelt die Abruf-URL fuer (Markt, Artikel) (G2): scrapeUrl gewinnt als
 * manueller Override, sonst scrapeRegion + gtin → Barcode-Search-URL. Keine
 * Quelle → null (Aufrufer ueberspringt/meldet „keine Quelle").
 */
export function resolveScrapeUrl(
  store: { scrapeUrl?: string | null; scrapeRegion?: string | null },
  gtin: string | null | undefined,
): string | null {
  if (store.scrapeUrl && store.scrapeUrl.trim() !== '') return store.scrapeUrl
  return buildGlobusSearchUrl(store.scrapeRegion, gtin)
}

/** Sentinel: Eingabe war eine nicht-leere, aber ungueltige URL. */
export const INVALID_URL = Symbol('invalid-url')

/**
 * Normalisiert eine optionale Abruf-URL: leer/undefined → null, gueltige
 * http/https-URL → getrimmter String, sonst INVALID_URL.
 */
export function normalizeScrapeUrl(value: string | null | undefined): string | null | typeof INVALID_URL {
  if (value === undefined || value === null) return null
  const trimmed = value.trim()
  if (trimmed === '') return null
  try {
    const u = new URL(trimmed)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return INVALID_URL
    return trimmed
  } catch {
    return INVALID_URL
  }
}

function hostOf(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return '<invalid-url>'
  }
}

/**
 * Ruft eine Globus-Produktseite ab und extrahiert den Preis in Cent.
 * Gibt bei JEDEM Fehler oder fehlendem Treffer `null` zurueck (nie throw).
 */
export async function scrapeGlobusPrice(url: string): Promise<ParsedPrice | null> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        'User-Agent': env.PRICE_SCRAPE_USER_AGENT || DEFAULT_USER_AGENT,
        'Accept-Language': 'de-DE,de;q=0.9',
      },
    })
    if (!res.ok) {
      console.warn(`[scrape/globus] ${hostOf(url)} → HTTP ${res.status}`)
      return null
    }
    const html = await res.text()
    const parsed = parseGlobusPriceHtml(html)
    if (!parsed) console.warn(`[scrape/globus] ${hostOf(url)} → kein Preis im HTML`)
    return parsed
  } catch (err) {
    const reason = err instanceof Error ? err.name : 'unknown'
    console.warn(`[scrape/globus] ${hostOf(url)} → Fehler (${reason})`)
    return null
  } finally {
    clearTimeout(t)
  }
}
