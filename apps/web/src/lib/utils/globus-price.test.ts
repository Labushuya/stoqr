import { describe, it, expect } from 'vitest'
import { parseEuroToCents, parseGlobusPriceHtml, applyEanToUrl, GLOBUS_PRICE_SELECTOR } from './globus-price'

describe('parseEuroToCents', () => {
  it('parst „Ab 1,19 €" → 119', () => {
    expect(parseEuroToCents('Ab 1,19 €')).toBe(119)
  })

  it('parst „12,50 €" → 1250', () => {
    expect(parseEuroToCents('12,50 €')).toBe(1250)
  })

  it('parst ganzzahliges „2 €" → 200', () => {
    expect(parseEuroToCents('2 €')).toBe(200)
  })

  it('parst Punkt-Dezimaltrenner „1.19 €" → 119', () => {
    expect(parseEuroToCents('1.19 €')).toBe(119)
  })

  it('toleriert fehlenden Abstand vor €', () => {
    expect(parseEuroToCents('0,29€')).toBe(29)
  })

  it('liefert null bei fehlendem Preis', () => {
    expect(parseEuroToCents('kein Preis')).toBeNull()
    expect(parseEuroToCents('')).toBeNull()
  })

  it('liefert null bei nicht-string Eingabe', () => {
    expect(parseEuroToCents(null)).toBeNull()
    // @ts-expect-error absichtlich falscher Typ
    expect(parseEuroToCents(119)).toBeNull()
  })
})

describe('parseGlobusPriceHtml', () => {
  const wrap = (inner: string) => `<html><body><div class="unit-price">${inner}</div></body></html>`

  it('extrahiert den Preis aus dem erwarteten Markup', () => {
    const html = wrap('<span class="discount-price">Ab 1,19 €</span>')
    expect(parseGlobusPriceHtml(html)).toEqual({ priceCt: 119, raw: 'Ab 1,19 €' })
  })

  it('liefert null bei fehlendem Selektor (geaendertes HTML)', () => {
    const html = '<html><body><div class="other"><span>1,19 €</span></div></body></html>'
    expect(parseGlobusPriceHtml(html)).toBeNull()
  })

  it('liefert null bei leerem Preis-Element', () => {
    const html = wrap('<span class="discount-price">   </span>')
    expect(parseGlobusPriceHtml(html)).toBeNull()
  })

  it('liefert null bei unparsbarem Text im Element', () => {
    const html = wrap('<span class="discount-price">nicht verfuegbar</span>')
    expect(parseGlobusPriceHtml(html)).toBeNull()
  })

  it('liefert null bei leerem String und nicht-string Eingabe', () => {
    expect(parseGlobusPriceHtml('')).toBeNull()
    expect(parseGlobusPriceHtml(null)).toBeNull()
  })

  it('liefert null bei Muell-HTML', () => {
    expect(parseGlobusPriceHtml('<<<not really html>>>')).toBeNull()
  })

  it('exportiert die Selektor-Konstante fuer zentrale Anpassung', () => {
    expect(GLOBUS_PRICE_SELECTOR).toBe('div.unit-price .discount-price')
  })
})

describe('applyEanToUrl', () => {
  it('ersetzt {EAN} durch die GTIN', () => {
    expect(applyEanToUrl('https://produkte.globus.de/hockenheim/search?query={EAN}', '4001234567890')).toBe(
      'https://produkte.globus.de/hockenheim/search?query=4001234567890',
    )
  })

  it('ersetzt mehrere {EAN}-Vorkommen', () => {
    expect(applyEanToUrl('https://x.de/{EAN}/p/{EAN}', '123')).toBe('https://x.de/123/p/123')
  })

  it('trimmt Vorlage und GTIN', () => {
    expect(applyEanToUrl('  https://x.de/{EAN}  ', '  123  ')).toBe('https://x.de/123')
  })

  it('gibt statische URL ohne Platzhalter unveraendert zurueck', () => {
    expect(applyEanToUrl('https://x.de/produkt/abc', '123')).toBe('https://x.de/produkt/abc')
  })

  it('liefert null bei {EAN} ohne GTIN', () => {
    expect(applyEanToUrl('https://x.de/{EAN}', '')).toBeNull()
    expect(applyEanToUrl('https://x.de/{EAN}', null)).toBeNull()
    expect(applyEanToUrl('https://x.de/{EAN}', undefined)).toBeNull()
  })

  it('liefert null bei leerer Vorlage', () => {
    expect(applyEanToUrl('', '123')).toBeNull()
    expect(applyEanToUrl(null, '123')).toBeNull()
    expect(applyEanToUrl('   ', '123')).toBeNull()
  })

  it('encoded Sonderzeichen in der GTIN', () => {
    expect(applyEanToUrl('https://x.de/search?q={EAN}', 'a b&c')).toBe('https://x.de/search?q=a%20b%26c')
  })
})
