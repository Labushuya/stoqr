# Changelog

Alle nennenswerten Änderungen an stoqr. Format lose an [Keep a Changelog](https://keepachangelog.com).
Neueste Einträge oben. Jeder Eintrag nennt den Commit-Kontext, damit andere LLMs nahtlos ansetzen können.

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
