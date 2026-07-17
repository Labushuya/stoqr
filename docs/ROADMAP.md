# stoqr — Roadmap

> Kanonisches Datenmodell und Entwicklungsplan. Diese Datei ist führend für Absicht,
> Logik und Ziel von stoqr. Bei Widersprüchen zwischen Code und dieser Datei gilt diese Datei.

Letzte Aktualisierung: 2026-07-17 (Block F / M3: Preise je Artikel+Markt mit Historie)

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
**EAN/Barcode:** primär am **Artikel** (`products.gtin`, im UI pflegbar). Markt, Lagerort, MHD, Menge NICHT im Artikel.

> **Aktualisiert (2026-07-14, M1-Feedback):** EAN ist jetzt **primär am Artikel** (`products.gtin`, UI-pflegbar).
> Bestand-EAN (`inventory_items.gtin`) bleibt **sekundär** für Ausreißer/Chargen. Fallback bei Bedarf: Bestandsanalyse.
> Damit ist `products.gtin` nicht mehr nur interner OFF-Cache, sondern das primäre Artikel-EAN.

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
| EAN | **primär am Artikel** (products.gtin, UI-pflegbar); sekundär am Bestand (Ausreißer) — *aktualisiert 2026-07-14* |
| Markt | am **Artikel** (M:N „wo einkaufbar", product_stores) UND am **Bestand** (Ist-Herkunft, store_id) |
| Lagerort | am **Bestand** (gleiches Produkt an mehreren Orten möglich) |
| Migration | Neue Migration + Testdaten-Reset |
| products.gtin | **primäres Artikel-EAN** (UI-pflegbar) — war zuvor nur interner OFF-Cache — *aktualisiert 2026-07-14* |
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

### Markt-Fahrplan (M1–M4) — markt-gesteuerter Einkauf, Preise, Rezepte
- **M1 — Markt am Artikel (M:N)** (abgeschlossen, Test ausstehend):
  - [x] product_stores neu (M:N Artikel↔Markt „wo einkaufbar"), Migration 0008
  - [x] Query-Layer product-stores + API /api/products/[id]/stores
  - [x] Markt-Zuordnung (Chips) auf der Artikel-Detailseite
  - [x] auto-Bedarf nutzt product_stores (pro zugeordnetem Markt ein Eintrag; ohne = „egal")
  - [x] Einkaufsliste: Markt-Auswahl (dieser + „egal", kein Mischen); Einbuchen belegt aktiven Markt vor
- **M1-Feedback — Fixes, EAN am Artikel, Vererbung, Audit** (abgeschlossen, Test ausstehend):
  - [x] A1 Soll-Bestand-„Netzwerkfehler" behoben ($derived statt $state); A2 0,25er-Stepper; A3 „Orte"→„Räume"
  - [x] A4 mehr Einheiten-Vorschläge + Button-Ausblendung; A5 MHD-fehlt auffällig markiert; A6 Einheit-Vorauswahl aus Artikel
  - [x] B EAN/Barcode am Artikel (products.gtin UI-pflegbar, Unique-Konflikt → 409)
  - [x] C Markt/Ort-Vererbung: neuer Bestand erbt häufigsten Ort/Markt vorhandener Bestände (inventory-hints)
  - [x] D vollständiges Audit-Log (writeAudit in allen Schreib-Routen, Migration 0009 audit_log.household_id) + Seite /aktivitaet
- **M2 — Einkauf-Entität mit Status** (abgeschlossen, Test ausstehend): shopping_trips (begonnen/pausiert/beendet,
  max 1 aktiv je Haushalt) + shopping_trip_items (reserviert 1 Bedarf via UNIQUE); Reservierung „1 Bedarf = 1 Run"
  behebt das 2×2-Problem; „sichtbar aber gesperrt" in der Einkaufsliste + „In Einkauf legen"/Sammel-Aktion/verschieben;
  Ausverkauft-Status; Beenden blockiert bei nicht eingebuchten gekauften Positionen; eigene /einkauf-Seite;
  Split beim Einbuchen (N MHD-Zeilen). Migration 0010. Preise bewusst ausgeklammert → M3.
- **M3 — Preise je Artikel+Markt** (abgeschlossen, Test ausstehend): product_prices mit Historie (isCurrent =
  massgeblicher Preis; isReduced = Angebot, nur als Dauerpreis massgeblich); Preis pro Einheit mit toBaseFactor-Umrechnung;
  Kaufpreis beim Einbuchen (booked) + separate Pflege je Markt (manual, Detailseite); Estimate „ca. ~X €" + Summe +
  Warnung in Einkaufsliste (client-reaktiv) und Einkauf-Run (server). Migration 0011. **Online-Abruf → F2 (separat).**
- **M3b/F2 — Online-Preis-Abruf** (geplant): opt-in Globus/Penny (Best-Effort, DOM-Scraping); Penny ohne offene Quelle.
- **M4 — Rezepte + Personen/Portionen** (geplant): recipes/recipe_ingredients/recipe_steps, persons,
  Zutaten-Ampel via aggregateStock/compareToTarget, fehlende Zutaten → Einkaufsliste.

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

**Block F / M3 — Preise (Commits 9bf1950, 6c5b0bd, bbea93d, 1351586, 8fbba90, 19579b0, 828c174) — Test auf Pi ausstehend:**
- Migration 0011 (product_prices, Unique-Index product_prices_current_uniq)
- Einbuchen mit Preis → purchasePriceCt am Bestand + Preis-Eintrag; Detailseite-„Preise"-Card zeigt ihn
- reduziert ohne Dauerpreis → Estimate nutzt weiter regulären Preis; „als Dauerpreis" → neuer maßgeblicher Preis
- Preis je Markt manuell auf der Detailseite setzen
- Einkauf-Run/Einkaufsliste (Markt gewählt) → „ca. ~X €" pro Position + Summe + Warnung; ohne Markt „Markt wählen"
- Einheiten: 1,50 €/kg bei 500 g → 0,75 €; Preis/Packung vs. Bedarf in kg → „Einheit ≠"

**Block E / M2 — Einkauf-Entität (Commits 9a05157, d6b6f10, cc95666, 4775eda, 9482a9e, d327598, 01bc69e, 47a1ce9) — Test auf Pi ausstehend:**
- Migration 0010 läuft (shopping_trips + shopping_trip_items, beide Unique-Indizes)
- 2×2 behoben: Milch bei Globus+Penny, 2× Soll → einen dem Globus-Run zuweisen → in Penny-Ansicht ausgegraut „reserviert"
- Status: zweiter Run pausiert den ersten; Beenden blockiert bei nicht eingebuchter „gekauft"-Position
- Verschieben zwischen Runs; Ausverkauft → beim Beenden zurück in Backlog
- Split beim Einbuchen (×2/×3/×4) → mehrere Bestände mit je MHD; Bedarf + Position verschwinden
- Sammel-Aktion „Alle in Einkauf legen"; /aktivitaet zeigt Einkauf-Einträge

**M1-Feedback A–D (Commits 77b3e6e, 97a3462, 40798b6, 4d3a374, 832dfee, 9000b61, cc1674f, c094739, 82ce904) — Test auf Pi ausstehend:**
- Migration 0009 läuft (audit_log.household_id)
- A1: Soll mit Mindestbestand speichern → kein „Netzwerkfehler"; A2: Stepper 0,25, freie Eingabe „1,3"; A3: „Räume" überall
- A4: neue Einheiten-Vorschläge; Button weg wenn alle da; A5: Bestand ohne MHD orange/gestrichelt; A6: Einheit aus Artikel-defaultUnit vorbelegt
- B: Artikel mit EAN anlegen/ansehen/bearbeiten; doppelte EAN → 409-Meldung
- C: zweiter Bestand desselben Artikels → Markt/Ort vorbelegt
- D: Änderung an Artikel/Bestand/Soll → /aktivitaet zeigt Vorher→Nachher, User, Zeit

**Inkrement M1 — markt-gesteuerter Einkauf (Commits 903350c, 6706fa4, 4f7db1a, 46a59e4, 27c5bff, 6744f65) — Test auf Pi ausstehend:**
- Migration 0008 (product_stores neu) läuft; Artikel-Detailseite → Märkte-Chips zuordnen
- „Bedarf erzeugen" legt pro zugeordnetem Markt einen auto-Eintrag an; Artikel ohne Markt = „egal"
- Einkaufsliste: Markt „Globus" wählen → nur Globus-Bedarf + markt-lose sichtbar; Penny ausgeblendet
- „Einbuchen" bei gewähltem Globus → easy-add hat Markt „Globus" vorbelegt

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

## Bekannte Design-Schulden (später, wenn relevant)
- **EAN global unique:** `products.gtin` hat einen globalen Unique-Constraint (`products_gtin_unique`, Migr. 0000)
  über ALLE Haushalte. Artikel sind bewusst global/geteilt (kein household_id). Solange nur ein Haushalt real
  genutzt wird, unkritisch. Sobald mehrere Haushalte relevant werden: eine von A anzulegende EAN, die B schon
  nutzt, wird blockiert („Diese EAN ist bereits einem anderen Artikel zugeordnet."). Optionen dann: household-scoped
  products + `unique(gtin, householdId)`, oder EAN-Konflikt nur innerhalb des eigenen Haushalts prüfen (Query statt
  DB-Constraint). Entscheidung offen. (vermerkt 2026-07-14)
