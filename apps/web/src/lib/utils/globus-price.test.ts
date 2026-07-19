import { describe, it, expect } from 'vitest'
import {
  applyEanToUrl,
  parsePriceToCents,
  parseGlobusSuggestJson,
  matchSuggestByEan,
} from './globus-price'

// Echter Ausschnitt aus dem Globus-Suggest-HTML (verifiziert 2026-07-19,
// /hockenheim/suggest?search=4306188415978). HTML-Entities wie im Original.
const REAL_SUGGEST_HTML = `
<div class="search-suggest js-search-result">
  <div class="search-suggest suggest-products">
    <a class="search-suggest-product js-result">
      <input type="hidden" data-etracker-search-suggest-product='{"id":"4306188415978","name":"Mineralwasser, Classic","category":["Men&uuml;","Getr&auml;nke","Wasser","Mineralwasser"],"price":"0.29","currency":"EUR"}'>
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

describe('parseGlobusSuggestJson', () => {
  it('extrahiert alle Treffer aus echtem Suggest-HTML', () => {
    const r = parseGlobusSuggestJson(REAL_SUGGEST_HTML)
    expect(r).toHaveLength(2)
    expect(r[0]).toEqual({ ean: '4306188415978', name: 'Mineralwasser, Classic', priceCt: 29 })
    expect(r[1].ean).toBe('5449000017987')
    expect(r[1].priceCt).toBe(1599)
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
    expect(r).toEqual([{ ean: '111', name: 'Gut', priceCt: 100 }])
  })
  it('ignoriert Treffer ohne EAN oder ohne gueltigen Preis', () => {
    const html = `
      <input data-etracker-search-suggest-product='{"name":"kein id","price":"1.00"}'>
      <input data-etracker-search-suggest-product='{"id":"222","price":"0"}'>`
    expect(parseGlobusSuggestJson(html)).toEqual([])
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
