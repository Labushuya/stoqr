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
 * Setzt einen freien Suchbegriff in die Markt-Abruf-URL ein (On-demand-Katalog,
 * G8-4). Nutzt denselben {EAN}-Platzhalter wie die EAN-Suche (der Globus-Suggest
 * akzeptiert sowohl EAN als auch Klartext). Defensiv: leere Vorlage/Query → null.
 */
export function applyQueryToUrl(
  template: string | null | undefined,
  query: string | null | undefined,
): string | null {
  const tpl = typeof template === 'string' ? template.trim() : ''
  if (tpl === '') return null
  if (!tpl.includes(EAN_PLACEHOLDER)) return tpl
  const q = typeof query === 'string' ? query.trim() : ''
  if (q === '') return null
  return tpl.split(EAN_PLACEHOLDER).join(encodeURIComponent(q))
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
  priceCt: number | null // null = Treffer ohne (parsbaren) Preis (fuer Snapshot erlaubt)
  category: string[]
  currency: string | null
  imageUrl: string | null
  raw: unknown // vollstaendiges geparstes Suggest-JSON (fuer globus_snapshots.rawJson)
}

// HTML-Entities, die in den JSON-Attributwerten vorkommen, dekodieren.
function decodeEntities(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&auml;/g, 'ä')
    .replace(/&ouml;/g, 'ö')
    .replace(/&uuml;/g, 'ü')
    .replace(/&Auml;/g, 'Ä')
    .replace(/&Ouml;/g, 'Ö')
    .replace(/&Uuml;/g, 'Ü')
    .replace(/&szlig;/g, 'ß')
    .replace(/&euro;/g, '€')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
}

/**
 * Extrahiert je EAN die Produktbild-URL aus dem Suggest-HTML. Globus benennt die
 * Bilder nach der EAM (`…/media/…/{EAN}_….jpg`), daher Zuordnung ueber die EAN
 * im Dateinamen. Defensiv: kein Input / keine Bilder → leere Map.
 */
export function extractImageUrlsByEan(html: string | null | undefined): Map<string, string> {
  const map = new Map<string, string>()
  if (typeof html !== 'string' || html.length === 0) return map
  const re = /<img[^>]+src="([^"]*\/(\d{8,14})_[^"]*\.(?:jpe?g|png|webp)(?:\?[^"]*)?)"/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) {
    const url = m[1]
    const ean = m[2]
    if (ean && url && !map.has(ean)) map.set(ean, url)
  }
  return map
}

/**
 * Extrahiert alle Suggest-Treffer aus dem Globus-Suggest-HTML. Liest die
 * `data-etracker-search-suggest-product`-JSON-Objekte, dekodiert HTML-Entities,
 * parst sie einzeln (ein defekter Treffer verwirft nicht die uebrigen) und ordnet
 * je EAN die Bild-URL zu. Preislose Treffer bleiben erhalten (priceCt=null).
 * Defensiv: kein Input / keine Treffer → `[]`.
 */
export function parseGlobusSuggestJson(html: string | null | undefined): GlobusSuggestProduct[] {
  if (typeof html !== 'string' || html.length === 0) return []
  const imgByEan = extractImageUrlsByEan(html)
  const results: GlobusSuggestProduct[] = []
  // Attributwert steht in einfachen ODER doppelten Quotes.
  const re = new RegExp(`${SUGGEST_ATTR}=(?:'([^']*)'|"([^"]*)")`, 'g')
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) {
    const raw = m[1] ?? m[2] ?? ''
    if (!raw) continue
    try {
      const decoded = decodeEntities(raw)
      const obj = JSON.parse(decoded) as {
        id?: unknown
        name?: unknown
        price?: unknown
        category?: unknown
        currency?: unknown
      }
      const ean = typeof obj.id === 'string' ? obj.id.trim() : ''
      if (ean === '') continue
      const name = typeof obj.name === 'string' ? decodeEntities(obj.name).trim() : ''
      const priceCt = parsePriceToCents(obj.price as string | number | undefined)
      const category = Array.isArray(obj.category)
        ? obj.category.filter((c): c is string => typeof c === 'string').map((c) => decodeEntities(c))
        : []
      const currency = typeof obj.currency === 'string' ? obj.currency : null
      results.push({
        ean,
        name,
        priceCt: priceCt !== null && priceCt > 0 ? priceCt : null,
        category,
        currency,
        imageUrl: imgByEan.get(ean) ?? null,
        raw: obj,
      })
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
