import { describe, it, expect } from 'vitest'
import {
  applyEanToUrl,
  parsePriceToCents,
  parseGlobusSuggestJson,
  extractImageUrlsByEan,
  matchSuggestByEan,
} from './globus-price'

// Echter Ausschnitt aus dem Globus-Suggest-HTML (verifiziert 2026-07-19,
// /hockenheim/suggest?search=4306188415978). HTML-Entities wie im Original.
const REAL_SUGGEST_HTML = `
<div class="search-suggest js-search-result">
  <div class="search-suggest suggest-products">
    <a class="search-suggest-product js-result">
      <input type="hidden" data-etracker-search-suggest-product='{"id":"4306188415978","name":"Mineralwasser, Classic","category":["Men&uuml;","Getr&auml;nke","Wasser","Mineralwasser"],"price":"0.29","currency":"EUR"}'>
      <img src="https://produkte.globus.de/media/29/77/06/1774332551/4306188415978_f33fc833.jpg?1774332551">
      <div class="col search-suggest-product-name">Mineralwasser, Classic</div>
      <span class="search-suggest-product-price">0,29&nbsp;&euro;</span>
    </a>
    <a class="search-suggest-product js-result">
      <input type="hidden" data-etracker-search-suggest-product='{"id":"5449000017987","name":"Cola, koffein- &amp; zuckerfrei (12x 1,000 Liter)","price":"15.99","currency":"EUR"}'>
    </a>
  </div>
</div>`

describe('applyEanToUrl', () => {
  it('ersetzt {EAN} durch die GTIN', () => {
    expect(applyEanToUrl('https://produkte.globus.de/hockenheim/suggest?search={EAN}', '4306188415978')).toBe(
      'https://produkte.globus.de/hockenheim/suggest?search=4306188415978',
    )
  })
  it('gibt statische URL ohne Platzhalter unveraendert zurueck', () => {
    expect(applyEanToUrl('https://x.de/p/abc', '123')).toBe('https://x.de/p/abc')
  })
  it('liefert null bei {EAN} ohne GTIN oder leerer Vorlage', () => {
    expect(applyEanToUrl('https://x.de/{EAN}', '')).toBeNull()
    expect(applyEanToUrl('', '123')).toBeNull()
    expect(applyEanToUrl(null, '123')).toBeNull()
  })
})

describe('parsePriceToCents', () => {
  it('parst Globus-Preis-Strings (Punkt-Dezimal)', () => {
    expect(parsePriceToCents('0.29')).toBe(29)
    expect(parsePriceToCents('15.99')).toBe(1599)
    expect(parsePriceToCents('2')).toBe(200)
  })
  it('toleriert Komma-Dezimal', () => {
    expect(parsePriceToCents('1,19')).toBe(119)
  })
  it('akzeptiert Zahlen', () => {
    expect(parsePriceToCents(0.29)).toBe(29)
  })
  it('liefert null bei Muell/leer/negativ', () => {
    expect(parsePriceToCents('abc')).toBeNull()
    expect(parsePriceToCents('')).toBeNull()
    expect(parsePriceToCents(null)).toBeNull()
    expect(parsePriceToCents('-1')).toBeNull()
  })
})

describe('extractImageUrlsByEan', () => {
  it('ordnet Bild-URL der EAN im Dateinamen zu', () => {
    const m = extractImageUrlsByEan(REAL_SUGGEST_HTML)
    expect(m.get('4306188415978')).toContain('4306188415978_f33fc833.jpg')
  })
  it('leere Map ohne Bilder/Input', () => {
    expect(extractImageUrlsByEan('').size).toBe(0)
    expect(extractImageUrlsByEan(null).size).toBe(0)
  })
})

describe('parseGlobusSuggestJson', () => {
  it('extrahiert Treffer inkl. category/currency/imageUrl/raw', () => {
    const r = parseGlobusSuggestJson(REAL_SUGGEST_HTML)
    expect(r).toHaveLength(2)
    expect(r[0]).toMatchObject({
      ean: '4306188415978',
      name: 'Mineralwasser, Classic',
      priceCt: 29,
      category: ['Menü', 'Getränke', 'Wasser', 'Mineralwasser'],
      currency: 'EUR',
    })
    expect(r[0].imageUrl).toContain('4306188415978_f33fc833.jpg')
    expect(r[0].raw).toBeTruthy()
    expect(r[1].ean).toBe('5449000017987')
    expect(r[1].priceCt).toBe(1599)
    expect(r[1].imageUrl).toBeNull() // kein <img> fuer diesen Treffer
  })
  it('dekodiert HTML-Entities im Namen', () => {
    const r = parseGlobusSuggestJson(REAL_SUGGEST_HTML)
    expect(r[1].name).toContain('&') // „Cola, koffein- & zuckerfrei …"
    expect(r[1].name).not.toContain('&amp;')
  })
  it('liefert [] bei „Keine Suchergebnisse" / leerem HTML', () => {
    expect(parseGlobusSuggestJson('<li class="search-suggest-no-result">Keine Suchergebnisse gefunden.</li>')).toEqual([])
    expect(parseGlobusSuggestJson('')).toEqual([])
    expect(parseGlobusSuggestJson(null)).toEqual([])
  })
  it('ueberspringt defekte JSON-Treffer, behaelt gueltige', () => {
    const html = `
      <input data-etracker-search-suggest-product='{kaputt'>
      <input data-etracker-search-suggest-product='{"id":"111","name":"Gut","price":"1.00"}'>`
    const r = parseGlobusSuggestJson(html)
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({ ean: '111', name: 'Gut', priceCt: 100 })
  })
  it('behaelt preislose Treffer mit priceCt=null (fuer Snapshot), verwirft nur fehlende EAN', () => {
    const html = `
      <input data-etracker-search-suggest-product='{"name":"kein id","price":"1.00"}'>
      <input data-etracker-search-suggest-product='{"id":"222","name":"Ohne Preis","price":"0"}'>`
    const r = parseGlobusSuggestJson(html)
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({ ean: '222', priceCt: null })
  })
})

describe('matchSuggestByEan', () => {
  const products = parseGlobusSuggestJson(REAL_SUGGEST_HTML)
  it('findet den exakten EAN-Treffer', () => {
    expect(matchSuggestByEan(products, '4306188415978')?.priceCt).toBe(29)
  })
  it('liefert null bei fehlendem Match (kein falscher Artikel)', () => {
    expect(matchSuggestByEan(products, '0000000000000')).toBeNull()
    expect(matchSuggestByEan(products, '')).toBeNull()
    expect(matchSuggestByEan(products, null)).toBeNull()
    expect(matchSuggestByEan([], '4306188415978')).toBeNull()
  })
})
