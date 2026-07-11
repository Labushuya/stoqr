# stoqr — Roadmap

> Kanonisches Datenmodell und Entwicklungsplan. Diese Datei ist führend für Absicht,
> Logik und Ziel von stoqr. Bei Widersprüchen zwischen Code und dieser Datei gilt diese Datei.

Letzte Aktualisierung: 2026-07-12 (Inkrement 2c: Einkaufsliste + Inventur)

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

## Bring!-Integration (Inkrement 2d)

Echte Bring!-API-Anbindung (User-Entscheidung): Login mit Bring-Zugangsdaten (verschlüsselt in DB,
ENCRYPTION_KEY), Einkaufsliste per API synchronisieren. Schema ist vorbereitet
(products.bringItemId, stores.bringListUuid, shoppingListItems.bringItemUuid, bring_sync_log).
Kein Text-/Pipe-Export (existiert so in Bring! nicht).

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

### Inkrement 2 — Auswertung & Bring! (aufgeteilt in 2a–2d)
- **2a — Gesamtbestand pro Artikel** (abgeschlossen, Test ausstehend):
  - [x] Einheiten-Umrechnungsschicht: units um dimension + to_base_factor (Migration 0007)
  - [x] Aggregationslogik lib/utils/stock.ts (mass/volume normalisiert, count je Einheit getrennt) + Tests
  - [x] Gesamtbestand-Anzeige auf der Artikel-Detailseite (z.B. „2 Packung + 1,5 kg")
- **2b — Soll/Bedarf** (abgeschlossen, Test ausstehend):
  - [x] Soll-/Mindestbestand je Artikel (stock_targets-CRUD, API /api/products/[id]/target)
  - [x] Soll-Ist-Vergleich (compareToTarget: ok/below_target/below_min/not_comparable) + Tests
  - [x] Bedarf-Indikator auf der Artikel-Detailseite + Soll-Modal
- **2c — Einkaufsliste + Inventur** (abgeschlossen, Test ausstehend):
  - [x] Bestandskorrektur/Inventur pro Artikel (tatsächlichen Gesamtbestand angeben, FIFO-Rückschreibung)
  - [x] Einkaufsliste-UI: auto-Bedarf (Soll−Ist, auffüllen bis Soll) + manuelle Einträge + abhaken
  - [x] „Bedarf aus Beständen erzeugen" (Dedup: 1 auto-Eintrag/Artikel) + auto bei Inventur
  - [x] Einbuchen: Einkaufslisten-Eintrag → echter Bestand (easy-add vorbelegt, Eintrag danach entfernt)
- **2d — echte Bring!-API**: Login (verschlüsselte Credentials), Liste synchronisieren

### Kreislauf (Zielbild)
Inventur (Ist erfassen) → Soll-Ist-Bedarf → Einkaufsliste (virtuelle Bestände) → Einkauf → Einbuchen
(echter Bestand mit Marke/MHD/Markt/Ort). Basis für (Semi-)Automatisierung.

### Einstellungen (Verwaltung)
- [x] Einheiten-Verwaltungsseite mit Umrechnung (Dimension + Faktor) + Vorschlägen gängiger Einheiten

### Inkrement 3 — Komfort
- [ ] Dubletten-Vermeidung (Konzept offen — siehe Changelog)
- [x] Nährwerte dynamisch editierbar (Editor + eigene Nährstofftypen) — Feedback-Runde 1
- [ ] Nährwerte per OCR erfassen
- [~] Mobile-first Feinschliff (globaler + seiten-spezifischer Sweep, Feedback-Runde 1)

---

## Offene Punkte / noch zu testen (nicht bestätigt)

**Inkrement 2c (Commits 442a48d, 1c65424, dc9de60, 7a43b54, ab29d68, ece8652) — Test auf Pi ausstehend:**
- Inventur: Artikel mit Soll → „Bestand korrigieren" auf niedrigeren Ist → Bestände FIFO reduziert, Bedarf-Eintrag entsteht
- Einkaufsliste: auto-Eintrag sichtbar; manuell hinzufügen/abhaken/löschen; „Bedarf erzeugen" ohne Duplikate
- Einbuchen: „Einbuchen" → easy-add vorbelegt → speichern → Listeneintrag weg, neuer Bestand auf /inventar

**Einheiten-Seite + Inkrement 2b (Commits 34e4b4f, 4ff5490, 0b5b446, d0ee0ed, 0394380) — Test auf Pi ausstehend:**
- Einstellungen → Einheiten: Custom-Einheit mit Dimension+Faktor anlegen/bearbeiten/löschen; Vorschlag (z.B. EL) per Klick übernehmen; System-Einheiten read-only; benutzte Einheit löschen → 409
- Artikel-Detailseite: Soll festlegen (Menge+Einheit+optional Min); Bedarf-Indikator (grün ok / gelb unter Soll / rot unter Min / grau nicht vergleichbar); Soll entfernen

**Inkrement 2a + FAB-Angleich (Commits 0efec01, de024bf, 3594c0f, 72669a9, 849b013) — Test auf Pi ausstehend:**
- Migration 0007 läuft sauber (units.dimension + to_base_factor gebackfillt)
- FAB „Neuer Artikel" + „Bestand hinzufügen" gleich groß
- Artikel-Detailseite zeigt Gesamtbestand (gemischte Einheiten z.B. „2 Packung + 1,5 kg"); consumed zählt nicht mit

**Feedback-Runde 2 (Commits 7c81cf7, 6effef4, edccb4f, b62b64d, ec8acc7, f0e3a58) — Test auf Pi ausstehend:**
- Einstellungen → Artikel: nur Name + Kategorie (add + edit + Anzeige)
- Inventar 3-Punkt: ein „Bearbeiten" → Detailseite (kein Sheet-Edit, kein toter Hash)
- Modal-Konsistenz: Neuer Artikel / Lagerort-Picker / Bestätigungen = gleiches Modal
- Nährwert-„+"-Zeile als placeholder-artiger Slot
- Mobile: Modals sauber, kein Overflow

**Feedback-Runde 1 (Commits e4d4b4c, 3b79517, da07d91, 6d9bfa8, c83f1cc, ace56ed, 035b911, 5c382c2) — Test auf Pi ausstehend:**
- Einheit: "Packung" bleibt "Packung" (Anzeige + Speichern); Feld = Dropdown
- Nährwert-Editor: Zeile add/ändern/löschen persistent; eigener Nährstoff anlegbar; Seed-Nährstoffe korrekt beschriftet
- Aggregierte Detailseite: alle Bestände eines Artikels sichtbar; Inline-Edit (Menge/MHD/Markt/Ort) je Bestand persistent
- Bezugsquelle je Bestand editierbar; keine Bezugsquellen-UI-Reste
- Mobile 360–480px: kein Overflow, Felder/FAB sauber

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
