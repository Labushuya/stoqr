# Changelog

Alle nennenswerten Änderungen an stoqr. Format lose an [Keep a Changelog](https://keepachangelog.com).
Neueste Einträge oben. Jeder Eintrag nennt den Commit-Kontext, damit andere LLMs nahtlos ansetzen können.

---

## [Unreleased] — Inkrement 1: Modell-Umbau (in Arbeit)

### Geplant
- Kanonisches Datenmodell final umsetzen (siehe docs/ROADMAP.md):
  - EAN/Barcode + Markt (store_id) vom Artikel ans Bestand (inventory_items) verschieben
  - Lagerort bleibt am Bestand
  - Artikel-Formular auf reine Stammdaten reduzieren
  - Bestand-Formular erhält EAN-Scan, Markt, Lagerort
  - Migration + Testdaten-Reset

### Architektur-Entscheidungen (2026-07-11)
- **Universeller Master-Artikel**: EAN + Markt liegen am Bestand, nicht am Artikel.
  Ein Artikel = ein Lebensmittel-Konzept, existiert einmal. Bestände tragen die
  variablen Werte (Anzahl, MHD, EAN, Markt, Lagerort).
- Lagerort am Bestand (gleiches Produkt an mehreren Orten möglich).
- Bei Umstellung: neue Migration + Reset der Testdaten.

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
