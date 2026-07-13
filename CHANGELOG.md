# Changelog

Alle nennenswerten Änderungen an stoqr. Format lose an [Keep a Changelog](https://keepachangelog.com).
Neueste Einträge oben. Jeder Eintrag nennt den Commit-Kontext, damit andere LLMs nahtlos ansetzen können.

---

## [Unreleased] — M1-Feedback: Fixes, EAN am Artikel, Vererbung, Audit-Log (implementiert, Test auf Pi ausstehend)

Testing von M1 deckte einen Bug, mehrere Konsistenz-Lücken und einen Architektur-Fehler auf.
Blöcke A–D abgearbeitet (risikoarm/additiv). Block E (Einkauf-Entität M2, behebt das 2×2-Milch-Problem)
und F (Preise) folgen mit eigener Feinplanung.

### Block A — Fixes & Konsistenz
- **A1 Bugfix Soll-Bestand „Netzwerkfehler":** `stockTarget`/`targetStatus` von `$state` auf `$derived(data.…)`
  umgestellt, manuelle Zuweisungen entfernt, `catch` loggt jetzt den echten Fehler. Trat nur mit gesetztem
  Mindestbestand auf. (77b3e6e)
- **A2 0,25er-Stepper:** alle Mengenfelder `step="0.25"` (Faktor/Nährwerte unverändert); freie Eingabe bleibt. (97a3462)
- **A3 „Orte" → „Räume":** UI-Texte umbenannt (Nav, Dashboard, /orte, Filter, easy-add); Route/interne Namen bleiben. (40798b6)
- **A4 Einheiten-Vorschläge:** SUGGESTIONS 12 → 28 (dl, Tasse, Schuss, Tropfen, Msp, Portion, Scheibe, Riegel,
  Tafel, Tube, Kanister, Sack, Karton, Netz, Kiste, Bündel, Paar); „+ Vorschläge"-Button verschwindet, wenn alle vorhanden. (4d3a374)
- **A5 MHD-fehlt hervorheben:** „Kein MHD" nicht mehr grün, sondern eigene auffällige `.mhd-none`-Klasse (Übersicht + Detail). (832dfee)
- **A6 Einheit-Vorauswahl merken:** easy-add übernimmt die `defaultUnit` des gewählten Artikels (solange nicht manuell
  geändert); Detailseite belegte bereits korrekt vor. (9000b61)

### Block B — EAN/Barcode am Artikel (primär)
- `products.gtin` im UI pflegbar (Anlegen/Ansicht/Bearbeiten in /einstellungen/artikel); `updateProduct` + POST/PATCH
  reichen gtin durch; Unique-Konflikt (23505) → 409 „EAN bereits einem anderen Artikel zugeordnet". (cc1674f)

### Block C — Markt/Ort-Vererbung bei neuem Bestand
- easy-add belegt beim Artikel-Wählen häufigsten Lagerort + Markt vorhandener Bestände desselben Artikels vor
  (nur leere Felder). `suggestStorePlaceForProduct()` + neue Route `/api/products/[id]/inventory-hints`. (c094739)

### Block D — Vollständiges Audit-Log + Aktivitäts-Seite
- `audit_log.household_id` ergänzt (Migration 0009, additiv/idempotent) + Index.
- Helper `writeAudit()` (best-effort) + `diffFields()` + `listAuditLog()` in `queries/audit.ts`.
- Eingehängt in ALLE Schreib-Routen: products, inventory_items (inkl. consume/inventory-adjust), stock_targets,
  units, stores, locations/storages/places (jeweils INSERT/UPDATE/DELETE, Vorher/Nachher).
- Neue Seite `/aktivitaet` (chronologisch nach Tag, Aktion-Badge, Vorher→Nachher-Diff, dt. Labels), verlinkt aus /einstellungen. (82ce904)

### Commits
77b3e6e (A1) · 97a3462 (A2) · 40798b6 (A3) · 4d3a374 (A4) · 832dfee (A5) · 9000b61 (A6) ·
cc1674f (B) · c094739 (C) · 82ce904 (D)

### Test-Steps (Pi)
1. **Migration:** Container-Neustart → `audit_log.household_id` vorhanden (Migration 0009 lief).
2. **A1:** Soll-Bestand mit Mindestbestand speichern → kein „Netzwerkfehler", Wert bleibt.
3. **A2:** Mengen-Stepper springt in 0,25; Tastatur erlaubt frei „1,3".
4. **A3:** Menü/Seiten zeigen „Räume".
5. **A4:** Einheiten-Vorschläge zeigen neue Einträge; Button weg, wenn alle angelegt.
6. **A5:** Bestand ohne MHD ist orange/gestrichelt markiert (nicht grün).
7. **A6:** Artikel mit `defaultUnit` = „Packung" in easy-add wählen → Einheit vorbelegt.
8. **B:** Artikel mit EAN anlegen; EAN in Liste sichtbar; bearbeiten; zweite gleiche EAN → Fehlermeldung.
9. **C:** Zweiten Bestand desselben Artikels anlegen → Markt/Ort aus erstem Bestand vorbelegt.
10. **D:** Beliebige Änderung (Artikel umbenennen, Bestand buchen, Soll ändern) → /aktivitaet zeigt Eintrag mit Vorher→Nachher, User, Zeit.

---

## [Unreleased] — Inkrement M1: markt-gesteuerter Einkauf (implementiert, Test auf Pi ausstehend)

**Architektur-Klärung:** Markt liegt jetzt auf zwei Ebenen — am **Artikel** (Planung: „wo einkaufbar",
M:N via product_stores) UND am **Bestand** (Ist-Herkunft: inventory_items.storeId, unverändert). Kein
Rückbau bestehender Logik; rein additiv.

### Markt am Artikel (M:N)
- `product_stores` neu (schlank: productId↔storeId↔household, Migration 0008). Bewusste Wiedereinführung
  der in Inkr.1 entfernten Tabelle in klarer Rolle „hier planbar erhältlich" (kein Preis/sort_order).
- Query-Layer `product-stores.ts`, API `/api/products/[id]/stores` (GET/PUT).
- Artikel-Detailseite: „Märkte"-Card mit Markt-Chips (Mehrfachauswahl).

### Markt-gesteuerte Einkaufsliste
- `generateAutoNeeds`: Markt aus product_stores — pro zugeordnetem Markt ein auto-Eintrag
  (Dedup jetzt (productId, storeId)); Artikel ohne Zuordnung → „egal". Verwaiste Einträge werden bereinigt.
- Einkaufsliste: Markt-Auswahl „Einkauf bei" (ein Markt) → zeigt dessen Bedarf + markt-lose Einträge; kein Mischen.
- Einbuchen belegt den aktiven Listen-Markt im Bestandsformular vor (storeId-Param an easy-add).

### Commits
903350c (product_stores Schema+Migration) · 6706fa4 (Query-Layer) · 4f7db1a (API+Markt-Chips) ·
46a59e4 (Bedarf-Markt) · 27c5bff (Markt-Filter Einkaufsliste) · 6744f65 (Einbuchen-Vorbelegung)

### Ausblick (geplant): M2 Einkauf-Status-Entität, M3 Preise+Estimate, M4 Rezepte+Personen (siehe ROADMAP)

### Test-Steps (Pi)
1. Artikel-Detailseite → Märkte „Globus" + „Penny" zuordnen.
2. „Bedarf erzeugen" → auto-Einträge je Markt; Einkaufsliste Markt=Globus zeigt nur Globus + markt-lose.
3. „Einbuchen" bei Globus → easy-add hat Markt Globus vorbelegt.

---

## [Unreleased] — Inkrement 2c: Einkaufsliste + Bestandskorrektur (implementiert, Test auf Pi ausstehend)

Schließt den Kreislauf **Inventur → Bedarf → Einkaufsliste → Einbuchen** — Basis für (Semi-)Automatisierung.

### Bestandskorrektur / Inventur
- Artikel-Detailseite: „Bestand korrigieren" — tatsächlichen Gesamtbestand angeben; Differenz wird
  **FIFO** (älteste MHD zuerst) auf die Bestände zurückgeschrieben. Erhöhung nur per „Bestand hinzufügen".
- `planInventoryAdjustment` in stock.ts (+ Tests). API `/api/products/[id]/inventory-adjust`.

### Einkaufsliste
- Route ersetzt Platzhalter: **auto-Bedarf** (Soll−Ist, auffüllen bis Soll) + **manuelle Freitext-Einträge**,
  abhaken, löschen. Button „Bedarf aus Beständen erzeugen". Dedup: ein auto-Eintrag pro Artikel.
- `generateAutoNeeds` (auch automatisch bei Inventur getriggert). Query-Layer `shopping-list.ts`,
  `getStockTargets`, API `/api/shopping-list` (GET/POST), `[id]` (PATCH/DELETE), `generate` (POST).

### Einbuchen (virtueller → echter Bestand)
- „Einbuchen"-Link je Einkaufslisten-Eintrag → easy-add mit Vorbelegung (Produkt/Menge/Einheit);
  nach dem Anlegen wird der Listeneintrag entfernt und zur Einkaufsliste zurückgeleitet.

### Commits
442a48d (FIFO-Logik + Tests) · 1c65424 (shopping-list Query + Bedarf) · dc9de60 (shopping-list API) ·
7a43b54 (Einkaufsliste-UI) · ab29d68 (Inventur-API + Modal) · ece8652 (Einbuchen)

### Test-Steps (Pi)
1. Artikel mit Soll → „Bestand korrigieren" auf niedrigeren Ist → Bestände FIFO reduziert, auto-Bedarf-Eintrag.
2. Einkaufsliste: auto + manuell, abhaken; „Bedarf erzeugen" ohne Duplikate.
3. „Einbuchen" → easy-add vorbelegt → speichern → Eintrag weg, neuer Bestand auf /inventar.

---

## [Unreleased] — Einheiten-Verwaltung + Inkrement 2b (Soll/Bedarf) (implementiert, Test auf Pi ausstehend)

### Einheiten-Verwaltungsseite
- Neue Unterseite **Einstellungen → Einheiten**: CRUD für Einheiten inkl. Dimension
  (Masse/Volumen/Stückzahl) + Umrechnungsfaktor zur Basiseinheit (g/ml). System-Einheiten read-only.
- **Vorschlags-Modal** gängiger Einheiten (mg, dag, Pfund, cl, EL, TL, Prise, Bund, …) — Klick übernimmt.
- `/api/units` POST+PATCH um dimension + toBaseFactor erweitert.
- Bisherige Inline-Einheiten-Section von der Einstellungen-Hauptseite auf die Unterseite verschoben (Tile).

### Inkrement 2b — Soll/Bedarf
- **Soll-/Mindestbestand je Artikel**: stock_targets-CRUD (Query-Layer + `/api/products/[id]/target` PUT/DELETE, Upsert).
- **Soll-Ist-Vergleich** `compareToTarget` (stock.ts, + Tests): ok / unter Soll / unter Min / nicht vergleichbar.
  mass/volume über Faktor, count symbolgenau.
- **Bedarf-Indikator** auf der Artikel-Detailseite (Ampel-Badge) + Modal zum Soll-Festlegen/Entfernen.

### Commits
34e4b4f (units-API dimension/factor) · 4ff5490 (Einheiten-Seite + Vorschläge) · 0b5b446
(compareToTarget + Tests) · d0ee0ed (stock-targets Query+API) · 0394380 (Soll-Indikator Detailseite)

### Test-Steps (Pi)
- Einstellungen → Einheiten: Einheit „EL/15 ml" per Vorschlag anlegen; eigene Masse-Einheit mit Faktor;
  System read-only; benutzte Einheit löschen → 409.
- Artikel-Detailseite: Soll „3 Stück" festlegen → bei Ist 1 „Unter Soll" (gelb), bei ≥3 grün, unter Min rot;
  Soll in Einheit ohne passenden Ist → „nicht vergleichbar".

---

## [Unreleased] — Inkrement 2a + FAB-Angleich (implementiert, Test auf Pi ausstehend)

### FAB-Buttons angeglichen
- „Neuer Artikel" + „Bestand hinzufügen" jetzt gleiche Größe (48px, gleiches Padding/Icon);
  Farb-Hierarchie bleibt (primär gefüllt vs. hell/outline). Mobile: beide gleich große Icon-Buttons.

### Gesamtbestand pro Artikel (2a) + Einheiten-Umrechnungsschicht
- **units** um `dimension` (mass|volume|count) + `to_base_factor` erweitert (Migration 0007;
  System-Units gebackfillt: g/kg → mass, ml/l → volume, Rest count).
- **lib/utils/stock.ts** (neu, reine Funktionen + 10 vitest-Tests): normalisiert mass/volume auf
  Basiseinheit und summiert, count-Einheiten (Stück/Packung/…) bleiben getrennt. Symbol-Kollision:
  Custom-Units vor System.
- `formatStockTotal` → „2 Packung + 1,5 kg". `getProductStockTotals` im Query-Layer.
- Artikel-Detailseite zeigt den **Gesamtbestand** über alle Bestände (mit „aus N Beständen").
- Erste vitest-Tests im Projekt.

### Commits
0efec01 (FAB-Angleich) · de024bf (units-Schema + Migration 0007) · 3594c0f (stock.ts + format) ·
72669a9 (vitest-Tests) · 849b013 (getProductStockTotals + Detailseiten-Header)

### Test-Steps (Pi)
Migration 0007 läuft automatisch beim Container-Start. Artikel mit gemischten Einheiten anlegen
(500 g + 1 kg + 2 Packung) → Detailseite zeigt „1,5 kg + 2 Packung"; consumed-Bestände zählen nicht mit.
FAB-Buttons gleich groß prüfen.

---

## [Unreleased] — Feedback-Runde 2: UI-Konsolidierung (implementiert, Test auf Pi ausstehend)

Reaktion auf UI-Kohärenz-Findings nach Feedback-Runde 1.

### Einheitliches Modal-Paradigma
- Neu `lib/components/Modal.svelte` — generisches zentriertes Modal (Svelte 5 Snippets:
  children + optional footer, size sm/md/lg, Escape + Backdrop schließen).
- **Alle Overlays konsolidiert**: "Neuer Artikel" (vorher Bottom-Sheet), Lagerort-Picker
  (vorher Custom-Dialog) und ConfirmModal nutzen jetzt dasselbe Modal.
- Totes Overlay-CSS entfernt (Sheet, Custom-Dialog, redundantes ConfirmModal-CSS).

### Inventar 3-Punkt-Menü vereinfacht
- "Bearbeiten" + "Bezugsquellen bearbeiten" zu EINEM Punkt **"Bearbeiten"** gemergt
  → führt zur Artikel-Detailseite. Toter `#bezugsquellen`-Hash entfernt.
- Sheet-Edit-Modus entfernt: Bestände bearbeitet man auf der Detailseite (Superset).

### Artikel-Verwaltung reduziert (Bestand ist führend)
- Einstellungen → Artikel pflegt nur noch **Name + Kategorie**. Einheit/Beschreibung/
  Notizen raus (Grund: Einheit kann pro Bestand variieren — der Bestand führt).
- "Standard-Einheit"-Anzeige auf der Detailseite entfernt.
- products.defaultUnit/description/notes-Spalten bleiben technisch (nicht mehr gepflegt).

### Nährwert-Editor Politur
- "+ Nährstoff"-Add-Zeile als placeholder-artiger Slot (gestrichelter Rahmen,
  Hover/Fokus → primary).

### Commits
7c81cf7 (Modal-Fundament) · 6effef4 (Sheet→Modal + Menü-Merge) · edccb4f (Lagerort→Modal +
Einheit-Anzeige raus) · b62b64d (Nährwert-Add-Zeile) · ec8acc7 (Artikel-Feldreduktion) ·
f0e3a58 (ConfirmModal DRY)

### Test-Steps (Pi)
1. Einstellungen → Artikel: nur Name + Kategorie editierbar (add + edit + Anzeige).
2. Inventar 3-Punkt → ein "Bearbeiten" → öffnet Detailseite (kein Sheet-Edit, kein toter Hash).
3. Modal-Konsistenz: "Neuer Artikel", Lagerort-Auswahl, Bestätigungen = gleiches zentriertes
   Modal; Escape + Backdrop schließen überall.
4. Nährwert-"+"-Zeile klar als Add-Slot erkennbar; add/edit/delete unverändert funktional.
5. Mobile 360–480px: Modals zentriert (bzw. bottom-aligned), kein Overflow.

---

## [Unreleased] — Feedback-Runde 1 (implementiert, Test auf Pi ausstehend)

Reaktion auf 5 Praxis-Findings nach Inkrement 1.

### Einheiten-Bug behoben
- Einstellungen → Artikel: Einheit-Feld ist jetzt ein **Dropdown** (statt Freitext),
  Auswahl aus getUnits (value=symbol, Anzeige=name) — konsistent mit Inventar/easy-add.
- Anzeige mappt gespeichertes symbol auf den Namen (z.B. "Packung" statt rohem Wert).
- Inventar-"Neuer Artikel" sendet die gewählte Einheit als `defaultUnit` mit
  (vorher stummer `'piece'`-Fallback → daher die "Packung → g/piece"-Diskrepanz).
- Defaults durchgängig auf symbol `'piece'` korrigiert.

### Nährwert-Editor (neu)
- Detailseite hat einen **editierbaren Nährwert-Editor** (produktweit, Hinweis
  "gilt für alle Bestände"): Zeile hinzufügen, Wert ändern, Zeile löschen.
- **Eigene Nährstofftypen** anlegbar (POST /api/nutrient-types, idempotent per Slug).
- Neue API: GET/POST /api/nutrient-types, PUT/DELETE /api/products/[id]/nutrients.
- Query-Layer: nutrients.ts (slugify, getNutrientTypes, createNutrientType,
  upsertProductNutrient, deleteProductNutrient).
- **Slug-Mismatch behoben**: der Editor arbeitet direkt gegen nutrient_types statt
  einer hartcodierten Bindestrich-Liste (Seed nutzt Unterstrich-slugs).

### Aggregierte Artikel-Detailseite
- /inventar/[id] zeigt jetzt den **Artikel mit ALLEN seinen Beständen** (mehrere
  MHDs/Mengen) statt eines einzelnen Bestands.
- Pro Bestand: Menge/Einheit/MHD+Badge/Markt/Ort/Status; **Inline-Edit** via
  bestehender PATCH /api/inventory/[id]; Verbraucht/Entfernen pro Zeile.
- **Bezugsquelle (Markt) editierbar** je Bestand; tote Bezugsquellen-UI/CSS-Reste entfernt.
- Behebt latenten data.units-Bug (Einheiten-Select auf Detailseite war leer).

### Responsive / Mobile
- Globaler Fix: (app)-Shell-Padding auf Mobile reduziert (behebt doppeltes Padding),
  body overflow-x:hidden als Sicherheitsnetz.
- artikel/maerkte: Felder brechen sauber auf volle Breite; inventar FAB-Labels ab
  ≤680px ausgeblendet; easy-add unit-row flex-wrap.

### Commits
e4d4b4c (Artikel-Einheit-Dropdown) · 3b79517 (defaultUnit-Kopplung) · da07d91
(nutrients Query-Layer) · 6d9bfa8 (/api/nutrient-types) · c83f1cc
(/api/products/[id]/nutrients) · ace56ed (aggregierte Detailseite + Editor) ·
035b911 (globaler Mobile-Fix) · 5c382c2 (Responsive-Fixes)

### Test-Steps (Pi)
1. Artikel mit "Packung" anlegen → Einstellungen → Artikel zeigt "Packung"; Feld = Dropdown.
2. Detailseite: Nährwert-Zeile add (Standard + eigener "Magnesium/mg"), Wert ändern,
   löschen → nach Reload persistent; alle Seed-Nährstoffe korrekt beschriftet.
3. Artikel mit 2+ Beständen → Detailseite listet alle; Inline-Edit (Menge/MHD/Markt/Ort)
   je Bestand persistiert.
4. Mobile 360–480px: kein horizontaler Overflow, Felder/FAB sauber.

---

## [Unreleased] — Inkrement 1: Kanonischer Modell-Umbau (implementiert, Test auf Pi ausstehend)

### Datenmodell
- **EAN ans Bestand**: `inventory_items.gtin` neu (Migration 0005). EAN ist jetzt
  Eigenschaft des konkreten Bestands, nicht des Artikels.
- **product_stores entfernt** (Migration 0005): Markt liegt am Bestand (`store_id`).
- **products.notes** neu (Migration 0006): Notizen als Artikel-Stammdaten.
- **products.gtin bleibt** — ausschließlich als interner Open-Food-Facts Cache-Schlüssel,
  nicht im UI, nicht das Bestand-EAN.
- **Testdaten-Reset**: `DELETE FROM inventory_items` in Migration 0005 (Modellwechsel).
  Artikel, Orte, Märkte bleiben erhalten.

### Query-Layer / API
- `listProducts()`, `updateProduct()` neu; `getProductById`/`createProduct` um
  description/notes/defaultUnit erweitert.
- `PATCH /api/products/[id]` neu (Stammdaten aktualisieren); `POST /api/products`
  akzeptiert notes und gibt vollen Artikel zurück.
- `api/product-stores/*` Routen entfernt.
- `api/stores/[id]` DELETE: Referenz-Check auf `inventory_items.store_id`.
- `api/barcode/[gtin]` gibt jetzt `product.id` zurück.

### UI — Zwei-Schritt-Flow
- **Artikel ≠ Bestand**: „Neuer Artikel" auf /inventar legt nur Stammdaten an
  (POST /api/products), kein Bestand.
- **Einstellungen → Artikel** (neue Seite): Artikel-Katalog anlegen/bearbeiten/löschen,
  Design analog Märkte, CRUD via /api/products, ConfirmModal, 409-Löschschutz.
- **„Bestand hinzufügen" (easy-add)** vervollständigt: EAN-Scan (Kamera → OFF-Lookup →
  Artikelvorschlag), Markt-Dropdown, Notiz je Bestand.
- Barcode-Scanner vom Artikel- ins Bestand-Formular verschoben.

### Commits
9689107 (Modell-Umbau) · f57688d (products.notes + Queries) · 7f651bb (PATCH API) ·
6b3ba93 (Artikelverwaltung) · 58115ce (Add-Sheet = Artikel) · 36bfa8d (easy-add EAN/Markt/Notiz)

### Test-Steps (Pi) — siehe docs/ROADMAP.md „Offene Punkte"
Deploy: `docker compose pull && docker compose up -d --force-recreate stoqr`,
dann `docker compose logs stoqr | grep "\[migrate\]"` (0005 + 0006 müssen laufen).

### Architektur-Entscheidungen (2026-07-11)
- **Universeller Master-Artikel**: EAN + Markt am Bestand, nicht am Artikel.
- Lagerort am Bestand. products global/geteilt. products.gtin = OFF-Cache.
- Bei Umstellung: neue Migration + Reset der Bestands-Testdaten.

---

## Bisherige Historie (vor Roadmap-Einführung)

### 2026-07-11
- Realtime Name-Update nach Artikel-Bearbeiten (kein Reload nötig)
- "Alles löschen" + "Aus Katalog entfernen" als direkte Aktionen im 3-Dot-Menü
- Kategorie-Emoji in Produktsuche gefixt (searchProducts join)
- Custom-Unit-Umbenennung propagiert zu allen betroffenen inventory_items
- Vollständiges Löschen mit Transaktion (Produkt + Bestände + Bezugsquellen)
- Einladungslink-Hinweis (stoqr versendet keine E-Mails)
- try/catch in allen inventory/products API-Handlern (keine Partialdaten mehr)
- ConfirmModal statt window.confirm überall
- MHD aus Artikelstamm-Formular entfernt (Bestand-Sektion nur im Edit-Modus)

### 2026-07-08 bis 2026-07-10
- Haushalts-Refactor: household_id auf allen Fachtabellen, Multi-User, Invite-System
- Märkte-Verwaltung, Bezugsquellen mit sort_order
- Easy-Add Flow, dynamische Units, Emoji-Picker mit Tabs
- Dark Mode (blau/indigo), Breadcrumb-Navigation
- Portal-Kontextmenü (z-index fix)
- Migration 0000–0004

### Deployment
- Repo: Labushuya/stoqr, Image: ghcr.io/labushuya/stoqr:main
- CI + Docker Publish grün, Migrationen laufen automatisch beim Container-Start
