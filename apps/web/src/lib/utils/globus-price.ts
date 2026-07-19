// ---------------------------------------------------------------------------
// Globus-Preis-Parser (reine Funktionen, testbar) — Block F2/G5.
//
// Globus (Shopware 6) rendert die Ergebnis-Seite (/search) per JavaScript, ein
// serverseitiger fetch sieht dort KEINE Preise. Der Suggest-Endpunkt
// (/{filiale}/suggest?search=…) liefert dagegen serverseitig fertiges HTML mit
// eingebettetem JSON pro Treffer:
//   <input ... data-etracker-search-suggest-product='{"id":"<EAN>","name":"…","price":"0.29","currency":"EUR"}'>
// Wir parsen dieses JSON (robust) und matchen exakt auf die gesuchte EAN.
// Bewusst defensiv: jeder Fehler / kein Treffer → leeres Ergebnis bzw. null.
// Der Netzwerk-Teil liegt server-only in lib/server/scrape/globus.ts.
// ---------------------------------------------------------------------------

// Platzhalter in der Markt-Abruf-URL, der beim Abruf durch die Artikel-GTIN ersetzt wird.
export const EAN_PLACEHOLDER = '{EAN}'

// Attribut, das Globus je Suggest-Treffer mit dem strukturierten JSON traegt.
const SUGGEST_ATTR = 'data-etracker-search-suggest-product'

/**
 * Setzt die GTIN in eine Markt-Abruf-URL ein. Enthaelt die Vorlage den
 * {EAN}-Platzhalter, muss eine GTIN vorhanden sein (sonst null). Ohne Platzhalter
 * wird die URL unveraendert zurueckgegeben. Defensiv: leere Vorlage → null.
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

/**
 * Wandelt einen Preis-String in Cent um.
 * - „0.29" → 29, „15.99" → 1599, „1,19" → 119, „2" → 200
 * - komma/punkt-tolerant; unparsbar → `null`
 */
export function parsePriceToCents(value: string | number | null | undefined): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? Math.round(value * 100) : null
  }
  if (typeof value !== 'string') return null
  const norm = value.trim().replace(',', '.')
  if (norm === '') return null
  const n = Number.parseFloat(norm)
  if (!Number.isFinite(n) || n < 0) return null
  return Math.round(n * 100)
}

export type GlobusSuggestProduct = {
  ean: string
  name: string
  priceCt: number
}

// HTML-Entities, die in den JSON-Attributwerten vorkommen, dekodieren.
function decodeEntities(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
}

/**
 * Extrahiert alle Suggest-Treffer aus dem Globus-Suggest-HTML. Liest die
 * `data-etracker-search-suggest-product`-JSON-Objekte, dekodiert HTML-Entities,
 * parst sie einzeln (ein defekter Treffer verwirft nicht die uebrigen).
 * Defensiv: kein Input / keine Treffer → `[]`.
 */
export function parseGlobusSuggestJson(html: string | null | undefined): GlobusSuggestProduct[] {
  if (typeof html !== 'string' || html.length === 0) return []
  const results: GlobusSuggestProduct[] = []
  // Attributwert steht in einfachen ODER doppelten Quotes.
  const re = new RegExp(`${SUGGEST_ATTR}=(?:'([^']*)'|"([^"]*)")`, 'g')
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) {
    const raw = m[1] ?? m[2] ?? ''
    if (!raw) continue
    try {
      const obj = JSON.parse(decodeEntities(raw)) as {
        id?: unknown
        name?: unknown
        price?: unknown
      }
      const ean = typeof obj.id === 'string' ? obj.id.trim() : ''
      const name = typeof obj.name === 'string' ? decodeEntities(obj.name).trim() : ''
      const priceCt = parsePriceToCents(obj.price as string | number | undefined)
      if (ean === '' || priceCt === null || priceCt <= 0) continue
      results.push({ ean, name, priceCt })
    } catch {
      // defekter Treffer → ueberspringen
    }
  }
  return results
}

/**
 * Waehlt aus den Suggest-Treffern den mit exakt passender EAN. Kein Match → null
 * (kein „falscher Artikel"). GTIN wird getrimmt verglichen.
 */
export function matchSuggestByEan(
  products: GlobusSuggestProduct[],
  gtin: string | null | undefined,
): GlobusSuggestProduct | null {
  const g = typeof gtin === 'string' ? gtin.trim() : ''
  if (g === '') return null
  return products.find((p) => p.ean === g) ?? null
}
