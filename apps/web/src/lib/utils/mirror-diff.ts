// ---------------------------------------------------------------------------
// Katalog-Spiegel-Diff (reine Funktion, testbar) — Block G10.
//
// Vergleicht die Stammdaten eines Artikels mit dem neuesten Globus-Katalog-
// Snapshot derselben EAN. Liefert je Feld, ob der Katalog abweicht (und ob das
// Artikelfeld leer ist). Preis bleibt bewusst aussen vor (laeuft ueber F2).
// ---------------------------------------------------------------------------

export type ArticleSide = {
  name: string | null
  imageUrl: string | null
  categoryId: string | null
}

export type CatalogSide = {
  name: string | null
  localImagePath: string | null
  /** Bereits auf eine stoqr-categoryId gemappte Katalog-Kategorie (best-effort). */
  categoryId: string | null
}

export type FieldDiff = {
  /** true = Katalog weicht vom Artikel ab (uebernehmenswert). */
  differs: boolean
  /** true = Artikelfeld ist leer, Katalog hat einen Wert (Luecke fuellen). */
  fillsGap: boolean
}

export type MirrorDiff = {
  name: FieldDiff
  image: FieldDiff
  category: FieldDiff
  /** true = mindestens ein Feld weicht ab. */
  any: boolean
}

function norm(s: string | null | undefined): string {
  return (s ?? '').trim()
}

/** Vergleicht Artikel vs. Katalog-Snapshot feldweise (Name/Bild/Kategorie). */
export function computeMirrorDiff(article: ArticleSide, catalog: CatalogSide | null): MirrorDiff {
  const empty: FieldDiff = { differs: false, fillsGap: false }
  if (!catalog) return { name: empty, image: empty, category: empty, any: false }

  // Name: Katalog hat einen Namen, der sich vom Artikelnamen unterscheidet.
  const catName = norm(catalog.name)
  const artName = norm(article.name)
  const name: FieldDiff =
    catName !== '' && catName !== artName
      ? { differs: true, fillsGap: artName === '' }
      : empty

  // Bild: Katalog hat ein lokales Bild, Artikel hat keins oder ein anderes.
  const catImage = norm(catalog.localImagePath) ? `/media/${norm(catalog.localImagePath)}` : ''
  const artImage = norm(article.imageUrl)
  const image: FieldDiff =
    catImage !== '' && catImage !== artImage
      ? { differs: true, fillsGap: artImage === '' }
      : empty

  // Kategorie: Katalog konnte auf eine stoqr-Kategorie gemappt werden, die vom
  // Artikel abweicht.
  const catCat = norm(catalog.categoryId)
  const artCat = norm(article.categoryId)
  const category: FieldDiff =
    catCat !== '' && catCat !== artCat
      ? { differs: true, fillsGap: artCat === '' }
      : empty

  return { name, image, category, any: name.differs || image.differs || category.differs }
}
