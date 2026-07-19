// ---------------------------------------------------------------------------
// Online-Preis-Abruf (server-only, I/O) — Block F2/G4/G5.
//
// Nutzt den Globus-Suggest-Endpunkt (/{filiale}/suggest?search={EAN}), der
// serverseitig JSON pro Treffer liefert (die /search-Seite rendert erst per JS).
// scrapeGlobusPrice waehlt den Treffer mit exakt passender EAN. Failsafe „in
// jeder Hinsicht": wirft NIE — Timeout (8s), Netz-/HTTP-/Parse-Fehler, kein
// EAN-Match → alles `null`. Opt-in ueber den In-App-Schalter
// expiry_config.price_scrape_enabled (default AUS).
// ---------------------------------------------------------------------------

import { env } from '$env/dynamic/private'
import { eq } from 'drizzle-orm'
import { db } from '$lib/server/db'
import { expiryConfig } from '@stoqr/db'
import { applyEanToUrl, parseGlobusSuggestJson, matchSuggestByEan, type GlobusSuggestProduct } from '$lib/utils/globus-price'

const TIMEOUT_MS = 8000
const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (compatible; stoqr-price/0.1; +https://github.com/Labushuya/stoqr)'

export type ScrapedPrice = {
  priceCt: number
  name: string
  ean: string
}

/**
 * In-App-Schalter (household-weit): Online-Preis-Abruf nur aktiv, wenn in den
 * Einstellungen eingeschaltet. Default AUS (keine Zeile / false).
 */
export async function isPriceScrapeEnabled(householdId: string): Promise<boolean> {
  const [row] = await db
    .select({ v: expiryConfig.priceScrapeEnabled })
    .from(expiryConfig)
    .where(eq(expiryConfig.householdId, householdId))
    .limit(1)
  return row?.v ?? false
}

/**
 * Ermittelt die Abruf-URL fuer (Markt, Artikel) (G4): die Markt-Vorlage
 * store.scrapeUrl mit {EAN}-Platzhalter, ersetzt durch die Artikel-GTIN.
 * Keine Vorlage oder {EAN} ohne GTIN → null (Aufrufer ueberspringt).
 */
export function resolveScrapeUrl(
  store: { scrapeUrl?: string | null },
  gtin: string | null | undefined,
): string | null {
  return applyEanToUrl(store.scrapeUrl, gtin)
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
 * Ruft den Globus-Suggest-Endpunkt ab und parst alle Treffer. Gemeinsame Basis
 * fuer Preis-Abruf und Katalog-Snapshot. Bei JEDEM Fehler → leeres Ergebnis
 * (nie throw). `totalHits` = Anzahl geparster Treffer (fuer den Struktur-Check).
 */
async function fetchSuggest(url: string): Promise<GlobusSuggestProduct[]> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        'User-Agent': env.PRICE_SCRAPE_USER_AGENT || DEFAULT_USER_AGENT,
        'Accept-Language': 'de-DE,de;q=0.9',
        // Der Suggest-Endpunkt wird per XHR aufgerufen; Header signalisiert das.
        'X-Requested-With': 'XMLHttpRequest',
      },
    })
    if (!res.ok) {
      console.warn(`[scrape/globus] ${hostOf(url)} → HTTP ${res.status}`)
      return []
    }
    return parseGlobusSuggestJson(await res.text())
  } catch (err) {
    const reason = err instanceof Error ? err.name : 'unknown'
    console.warn(`[scrape/globus] ${hostOf(url)} → Fehler (${reason})`)
    return []
  } finally {
    clearTimeout(t)
  }
}

/** Oeffentlicher Zugriff auf alle Suggest-Treffer einer URL (On-demand-Katalog-Suche, G8-4). */
export async function fetchGlobusSuggest(url: string): Promise<GlobusSuggestProduct[]> {
  return fetchSuggest(url)
}

/**
 * Liefert den PREIS des Treffers mit exakt passender EAN (in Cent). Kein Match
 * oder Treffer ohne Preis → null (nie throw).
 */
export async function scrapeGlobusPrice(url: string, gtin: string): Promise<ScrapedPrice | null> {
  const match = matchSuggestByEan(await fetchSuggest(url), gtin)
  if (!match || match.priceCt == null) return null
  return { priceCt: match.priceCt, name: match.name, ean: match.ean }
}

/**
 * Liefert den kompletten Katalog-Treffer (inkl. category/currency/imageUrl/raw,
 * auch ohne Preis) mit exakt passender EAN + Gesamt-Trefferzahl (fuer den
 * Struktur-Check des Katalog-Syncs). Kein Fehler wird geworfen.
 */
export async function scrapeGlobusSnapshot(
  url: string,
  gtin: string,
): Promise<{ product: GlobusSuggestProduct | null; totalHits: number }> {
  const products = await fetchSuggest(url)
  return { product: matchSuggestByEan(products, gtin), totalHits: products.length }
}
