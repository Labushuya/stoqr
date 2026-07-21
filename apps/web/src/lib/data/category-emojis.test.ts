import { describe, it, expect } from 'vitest'
import { CATEGORY_EMOJIS, filterEmojis } from './category-emojis'

describe('filterEmojis', () => {
  it('leere Suche → alle Emojis', () => {
    expect(filterEmojis('')).toHaveLength(CATEGORY_EMOJIS.length)
    expect(filterEmojis('   ')).toHaveLength(CATEGORY_EMOJIS.length)
  })

  it('findet per Keyword-Substring (case-insensitiv)', () => {
    // Nicht auf das exakte Emoji-Glyph pruefen (Variation-Selector-Fallen) —
    // stattdessen, dass die Keyword-Suche ueberhaupt trifft.
    expect(filterEmojis('tiefkuehl').length).toBeGreaterThan(0)
    expect(filterEmojis('kaese').some((e) => e.keywords.includes('kaese'))).toBe(true)
    expect(filterEmojis('wasser').some((e) => e.keywords.includes('wasser'))).toBe(true)
  })

  it('kein Treffer → leeres Array', () => {
    expect(filterEmojis('zzzznichtvorhanden')).toEqual([])
  })

  it('jedes Emoji hat mindestens ein Keyword', () => {
    expect(CATEGORY_EMOJIS.every((e) => e.keywords.length > 0)).toBe(true)
  })
})
