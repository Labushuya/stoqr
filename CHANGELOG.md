# Changelog

Alle nennenswerten Änderungen an stoqr. Format lose an [Keep a Changelog](https://keepachangelog.com).
Neueste Einträge oben. Jeder Eintrag nennt den Commit-Kontext, damit andere LLMs nahtlos ansetzen können.

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
