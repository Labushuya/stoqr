# stoqr — Roadmap

> Kanonisches Datenmodell und Entwicklungsplan. Diese Datei ist führend für Absicht,
> Logik und Ziel von stoqr. Bei Widersprüchen zwischen Code und dieser Datei gilt diese Datei.

Letzte Aktualisierung: 2026-07-11 (Inkrement 1 implementiert)

---

## Zweck

stoqr erfasst Lebensmittelbestände und leitet daraus Verhaltensweisen, Trends,
Automatisierungen und Infos ab. Kernziel: klares, intuitives System mit sauberer
Datenbasis — besonders für die Bring!-Anbindung.

---

## Kanonisches Datenmodell (verbindlich seit 2026-07-11)

### Grundprinzip
**Stammdaten (Artikel) ≠ Transaktionsdaten (Bestand).**
Ein Artikel zu erstellen erzeugt **keinen** Bestand. Bestände werden separat über einen
dedizierten Button angelegt und referenzieren einen bestehenden Artikel.

### ARTIKEL (Stammdaten) — universeller Master-Artikel
Beschreibt EIN Lebensmittel-Konzept, existiert genau einmal (z.B. "Vollmilch").
```
- name            (z.B. "Vollmilch")
- description     (z.B. "Milch mit 3,5% Fett")
- category_id     (z.B. "Milchprodukte")
- default_unit    (Standard-Einheit)
- nutrients       (Nährwerte, EAV)
- notes
```
**NICHT im Artikel:** EAN/Barcode, Markt, Lagerort, MHD, Menge.

### BESTAND (Transaktion) — konkrete physische Menge
Referenziert einen Artikel. Ein Artikel kann viele Bestände mit unterschiedlichen
Werten haben (verschiedene Märkte, MHDs, Lagerorte).
```
- product_id      → Artikel (FK)
- quantity        (Anzahl / Menge)
- unit
- best_before_date (MHD)
- gtin            (EAN/Barcode — am Bestand, NICHT am Artikel)
- store_id        (Markt / Bezugsquelle — am Bestand)
- place_id        (Lagerort: Raum > Lagerort > Fach — am Bestand)
- notes
- status          (available / consumed / discarded)
```

### MÄRKTE (Stammdaten)
```
- name, chain (optional), address (optional), city/plz (optional)
```

### ORTE (Stammdaten) — Hierarchie
```
Raum (location) > Lagerort (storage) > Fach (place)
```

### Entscheidungen (2026-07-11)
| Frage | Entscheidung |
|---|---|
| EAN + Markt | am **Bestand** (universeller Master-Artikel) |
| Lagerort | am **Bestand** (gleiches Produkt an mehreren Orten möglich) |
| Migration | Neue Migration + Testdaten-Reset |
| products.gtin | bleibt als **interner Open-Food-Facts Cache-Schlüssel** (nicht im UI, nicht das Bestand-EAN) |
| products (Katalog) | **global/geteilt** (kein household_id) — ein Artikel für alle Haushalte |
| Artikelverwaltung | eigene Seite unter **Einstellungen → Artikel** (anlegen/ändern/löschen) |

---

## Ablauf (User-Flow)

1. Räume, Lagerorte, Fächer anlegen (Orte)
2. Artikel anlegen — nur Stammdaten, **kein** Bestand entsteht dabei
   - Schnell: `/inventar` → FAB „Neuer Artikel" (Name, Kategorie, Notiz)
   - Vollständig: `Einstellungen → Artikel` (anlegen/ändern/löschen)
3. Bestand anlegen — `/inventar` → „Bestand hinzufügen": Artikel wählen (oder EAN scannen),
   Ort, Anzahl + MHD + EAN + Markt + Notiz

---

## Bring!-Export

Format: `Artikel: [Name]`, Beschreibung: `[Gesamtanzahl][Einheit] | [Notiz] | [Markt]`
- Gesamtanzahl = Summe aller Bestände des Artikels
- Markt = Primär-/häufigster Markt aus den Beständen

---

## Roadmap (Inkremente)

### Inkrement 1 — Modell-Umbau (abgeschlossen, Test ausstehend)
- [x] Schema: EAN + store_id ans Bestand (inventory_items), vom Artikel entfernt
- [x] Migration 0005 (gtin an Bestand, product_stores DROP) + 0006 (products.notes) + Reset
- [x] Artikel-Formular: nur Stammdaten (Name, Beschreibung, Kategorie, Einheit, Notizen)
- [x] Bestand-Formular (easy-add): Artikel wählen + Anzahl + MHD + EAN-Scan + Markt + Lagerort + Notiz
- [x] Barcode-Scanner vom Artikel- ins Bestand-Formular verschoben
- [x] product_stores (M:N) entfernt — Markt liegt jetzt am Bestand
- [x] Artikelverwaltung als eigene Seite: Einstellungen → Artikel (CRUD via /api/products)
- [x] products.gtin als interner OFF-Cache dokumentiert & belassen

> Alle Inkrement-1-Punkte sind implementiert & gepusht, aber **noch nicht von Christopher
> auf dem Pi getestet** — siehe „Offene Punkte / noch zu testen".

### Inkrement 2 — Auswertung & Bring!
- [ ] Gesamtbestand pro Artikel (Aggregation über alle Bestände)
- [ ] Bring!-Export mit Pipe-Format
- [ ] Bedarf/Soll-Erkennung → Einkaufsliste

### Inkrement 3 — Komfort
- [ ] Dubletten-Vermeidung (Konzept offen — siehe Changelog)
- [ ] Nährwerte dynamisch + OCR
- [ ] Mobile-first Feinschliff

---

## Offene Punkte / noch zu testen (nicht bestätigt)

**Inkrement 1 (Commits 9689107, f57688d, 7f651bb, 6b3ba93, 58115ce, 36bfa8d) — Test auf Pi ausstehend:**
- Migration 0005 + 0006 laufen sauber (Testdaten-Reset der Bestände)
- „Neuer Artikel" legt nur Stammdaten an (kein Bestand)
- Einstellungen → Artikel: Liste, anlegen, bearbeiten, löschen (409-Schutz bei Beständen)
- „Bestand hinzufügen": EAN-Scan → Artikel-Vorschlag, Markt-Dropdown, Notiz
- Bestand trägt EAN + Markt + Ort; erscheint auf /inventar

**Ältere, noch nicht bestätigte Punkte:**
- Realtime Name-Update nach Bearbeiten (Commit 78e7e5e)
- „Alles löschen" / „Aus Katalog entfernen" direkt im 3-Dot-Menü (Commit 78e7e5e)
- Kategorie-Emoji in Suche (Commit 808ae64)
- Custom-Unit-Umbenennung propagiert zu Artikeln (Commit 7da27e1)

## Dubletten-Vermeidung — Vorschlag (Entscheidung ausstehend)
Da EAN jetzt am Bestand liegt und Artikel universell sind:
- Beim Artikel-Anlegen: Fuzzy-Name-Suche → "Ähnlicher Artikel existiert: Vollmilch. Trotzdem neu anlegen?"
- Kein harter EAN-Dedup mehr auf Artikel-Ebene (EAN ist ja am Bestand)
- Bestände können optional per EAN einem Artikel vorgeschlagen werden
