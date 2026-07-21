// Kuratierte Farb-Emoji-Liste fuer den Kategorie-Icon-Picker (G25).
// BEWUSST kuratiert (statt nativem OS-Picker), damit JEDES Icon ein Farb-Emoji ist
// — keine monochromen Text-Symbole wie ❄ (U+2744 ohne Variation-Selector), die
// neben den Basis-Kategorie-Emojis (🥦🥛🥩…) uneinheitlich aussehen.
//
// Jedes Item: das Emoji + deutsche/englische Such-Keywords (lowercase).
// Fuer Kaelte/Tiefkuehl ist bewusst ❄️ (mit Variation-Selector U+FE0F) enthalten,
// damit es als Farb-Emoji rendert.

export type EmojiEntry = { emoji: string; keywords: string[] }

export const CATEGORY_EMOJIS: EmojiEntry[] = [
  // Obst & Gemuese
  { emoji: '🥦', keywords: ['brokkoli', 'broccoli', 'gemuese', 'vegetable', 'gruen'] },
  { emoji: '🥕', keywords: ['karotte', 'moehre', 'carrot', 'gemuese'] },
  { emoji: '🍅', keywords: ['tomate', 'tomato', 'gemuese'] },
  { emoji: '🥬', keywords: ['salat', 'blattgemuese', 'lettuce', 'kohl'] },
  { emoji: '🌽', keywords: ['mais', 'corn'] },
  { emoji: '🥔', keywords: ['kartoffel', 'potato'] },
  { emoji: '🧅', keywords: ['zwiebel', 'onion'] },
  { emoji: '🧄', keywords: ['knoblauch', 'garlic'] },
  { emoji: '🍎', keywords: ['apfel', 'apple', 'obst', 'fruit'] },
  { emoji: '🍌', keywords: ['banane', 'banana', 'obst'] },
  { emoji: '🍇', keywords: ['trauben', 'grapes', 'obst'] },
  { emoji: '🍓', keywords: ['erdbeere', 'strawberry', 'beere', 'obst'] },
  { emoji: '🍊', keywords: ['orange', 'zitrus', 'obst'] },
  { emoji: '🍋', keywords: ['zitrone', 'lemon', 'zitrus'] },
  { emoji: '🍉', keywords: ['melone', 'wassermelone', 'melon', 'obst'] },
  { emoji: '🍑', keywords: ['pfirsich', 'peach', 'obst'] },
  { emoji: '🥑', keywords: ['avocado', 'obst'] },
  { emoji: '🍄', keywords: ['pilz', 'champignon', 'mushroom'] },
  // Milchprodukte
  { emoji: '🥛', keywords: ['milch', 'milk', 'milchprodukt', 'dairy'] },
  { emoji: '🧀', keywords: ['kaese', 'cheese', 'milchprodukt'] },
  { emoji: '🧈', keywords: ['butter', 'milchprodukt'] },
  { emoji: '🥚', keywords: ['ei', 'egg', 'eier'] },
  { emoji: '🍦', keywords: ['eis', 'eiscreme', 'icecream', 'dessert'] },
  // Fleisch & Fisch
  { emoji: '🥩', keywords: ['fleisch', 'steak', 'meat'] },
  { emoji: '🍗', keywords: ['haehnchen', 'gefluegel', 'chicken', 'poultry', 'fleisch'] },
  { emoji: '🥓', keywords: ['speck', 'bacon', 'fleisch'] },
  { emoji: '🌭', keywords: ['wurst', 'sausage', 'hotdog', 'fleisch'] },
  { emoji: '🐟', keywords: ['fisch', 'fish'] },
  { emoji: '🍤', keywords: ['garnele', 'shrimp', 'meeresfruechte', 'seafood'] },
  { emoji: '🦐', keywords: ['garnele', 'shrimp', 'meeresfruechte'] },
  // Brot & Backwaren
  { emoji: '🍞', keywords: ['brot', 'bread', 'backwaren', 'bakery'] },
  { emoji: '🥖', keywords: ['baguette', 'brot', 'backwaren'] },
  { emoji: '🥐', keywords: ['croissant', 'gebaeck', 'backwaren'] },
  { emoji: '🥨', keywords: ['brezel', 'pretzel', 'backwaren'] },
  { emoji: '🧇', keywords: ['waffel', 'waffle'] },
  { emoji: '🥯', keywords: ['bagel', 'backwaren'] },
  { emoji: '🍰', keywords: ['kuchen', 'cake', 'torte', 'backwaren'] },
  { emoji: '🍪', keywords: ['keks', 'cookie', 'plaetzchen'] },
  // Konserven & Tiefkuehl
  { emoji: '🥫', keywords: ['konserve', 'dose', 'can', 'canned'] },
  { emoji: '❄️', keywords: ['tiefkuehl', 'gefroren', 'frozen', 'kaelte', 'eis', 'schnee', 'kalt'] },
  { emoji: '🧊', keywords: ['eiswuerfel', 'ice', 'gefroren', 'tiefkuehl', 'kalt'] },
  // Getraenke
  { emoji: '🍺', keywords: ['bier', 'beer', 'getraenk', 'alkohol'] },
  { emoji: '🍷', keywords: ['wein', 'wine', 'getraenk', 'alkohol'] },
  { emoji: '🥤', keywords: ['softdrink', 'limo', 'cola', 'getraenk', 'becher'] },
  { emoji: '🧃', keywords: ['saft', 'juice', 'getraenk', 'tetrapak'] },
  { emoji: '💧', keywords: ['wasser', 'water', 'getraenk', 'tropfen'] },
  { emoji: '☕', keywords: ['kaffee', 'coffee', 'tee', 'getraenk', 'heiss'] },
  { emoji: '🍵', keywords: ['tee', 'tea', 'getraenk', 'matcha'] },
  { emoji: '🍾', keywords: ['sekt', 'champagner', 'flasche', 'getraenk'] },
  { emoji: '🥂', keywords: ['prosecco', 'anstossen', 'getraenk'] },
  // Suessigkeiten & Snacks
  { emoji: '🍫', keywords: ['schokolade', 'chocolate', 'suess', 'snack'] },
  { emoji: '🍬', keywords: ['bonbon', 'candy', 'suess', 'suessigkeit'] },
  { emoji: '🍭', keywords: ['lutscher', 'lollipop', 'suess'] },
  { emoji: '🍿', keywords: ['popcorn', 'snack'] },
  { emoji: '🥜', keywords: ['nuss', 'erdnuss', 'peanut', 'snack'] },
  { emoji: '🍩', keywords: ['donut', 'suess'] },
  { emoji: '🍯', keywords: ['honig', 'honey', 'suess'] },
  // Gewuerze & Sossen
  { emoji: '🧂', keywords: ['salz', 'gewuerz', 'salt', 'spice'] },
  { emoji: '🌶️', keywords: ['chili', 'scharf', 'pepper', 'gewuerz'] },
  { emoji: '🫙', keywords: ['glas', 'einmachglas', 'sosse', 'sauce', 'jar'] },
  { emoji: '🍶', keywords: ['sosse', 'sauce', 'oel', 'essig', 'flasche'] },
  { emoji: '🫒', keywords: ['olive', 'oel', 'oil'] },
  // Grundnahrung / sonstiges Essen
  { emoji: '🍝', keywords: ['pasta', 'nudeln', 'spaghetti', 'noodle'] },
  { emoji: '🍚', keywords: ['reis', 'rice'] },
  { emoji: '🥣', keywords: ['muesli', 'cereal', 'schuessel', 'flocken'] },
  { emoji: '🌾', keywords: ['getreide', 'grain', 'mehl', 'weizen'] },
  { emoji: '🍕', keywords: ['pizza', 'fertiggericht'] },
  { emoji: '🥘', keywords: ['eintopf', 'gericht', 'pfanne', 'fertig'] },
  // Haushalt / nicht-Lebensmittel
  { emoji: '📦', keywords: ['sonstiges', 'karton', 'box', 'paket', 'other'] },
  { emoji: '🧻', keywords: ['papier', 'toilettenpapier', 'kuechenrolle', 'haushalt'] },
  { emoji: '🧼', keywords: ['seife', 'reiniger', 'soap', 'haushalt', 'putzen'] },
  { emoji: '🧴', keywords: ['flasche', 'pflege', 'shampoo', 'lotion', 'haushalt'] },
  { emoji: '🧽', keywords: ['schwamm', 'sponge', 'putzen', 'haushalt'] },
  { emoji: '🧺', keywords: ['korb', 'waesche', 'haushalt'] },
  { emoji: '💊', keywords: ['medikament', 'tablette', 'pille', 'gesundheit', 'apotheke'] },
  { emoji: '🐕', keywords: ['hund', 'tierfutter', 'haustier', 'pet'] },
  { emoji: '🐈', keywords: ['katze', 'tierfutter', 'haustier', 'pet'] },
  { emoji: '🍼', keywords: ['baby', 'flaeschchen', 'saeugling'] },
  { emoji: '🏷️', keywords: ['label', 'etikett', 'sonstiges', 'allgemein'] },
]

/** Filtert die Emoji-Liste per Suchbegriff (matcht Keywords als Substring). Leer → alle. */
export function filterEmojis(query: string): EmojiEntry[] {
  const q = query.trim().toLowerCase()
  if (!q) return CATEGORY_EMOJIS
  return CATEGORY_EMOJIS.filter((e) => e.keywords.some((k) => k.includes(q)))
}
