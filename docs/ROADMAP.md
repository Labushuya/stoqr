# stoqr — Roadmap

> Kanonisches Datenmodell und Entwicklungsplan. Diese Datei ist führend für Absicht,
> Logik und Ziel von stoqr. Bei Widersprüchen zwischen Code und dieser Datei gilt diese Datei.

Letzte Aktualisierung: 2026-07-11

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

---

## Ablauf (User-Flow)

1. Räume, Lagerorte, Fächer anlegen (Orte)
2. Artikel anlegen — nur Stammdaten, **kein** Bestand entsteht dabei
3. Bestand anlegen — wählt Artikel, erfasst Anzahl + MHD + EAN + Markt + Lagerort

---

## Bring!-Export

Format: `Artikel: [Name]`, Beschreibung: `[Gesamtanzahl][Einheit] | [Notiz] | [Markt]`
- Gesamtanzahl = Summe aller Bestände des Artikels
- Markt = Primär-/häufigster Markt aus den Beständen

---

## Roadmap (Inkremente)

### Inkrement 1 — Modell-Umbau (aktuell)
- [ ] Schema: EAN + store_id ans Bestand (inventory_items), vom Artikel entfernen
- [ ] Migration + Reset
- [ ] Artikel-Formular: nur Stammdaten (Name, Beschreibung, Kategorie, Einheit, Notizen)
- [ ] Bestand-Formular: Artikel wählen + Anzahl + MHD + EAN-Scan + Markt + Lagerort
- [ ] Barcode-Scanner vom Artikel- ins Bestand-Formular verschieben
- [ ] product_stores (M:N) evaluieren — ggf. entfernen da Markt jetzt am Bestand

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
- Realtime Name-Update nach Bearbeiten (Commit 78e7e5e)
- "Alles löschen" / "Aus Katalog entfernen" direkt im 3-Dot-Menü (Commit 78e7e5e)
- Kategorie-Emoji in Suche (Commit 808ae64)
- Custom-Unit-Umbenennung propagiert zu Artikeln (Commit 7da27e1)

## Dubletten-Vermeidung — Vorschlag (Entscheidung ausstehend)
Da EAN jetzt am Bestand liegt und Artikel universell sind:
- Beim Artikel-Anlegen: Fuzzy-Name-Suche → "Ähnlicher Artikel existiert: Vollmilch. Trotzdem neu anlegen?"
- Kein harter EAN-Dedup mehr auf Artikel-Ebene (EAN ist ja am Bestand)
- Bestände können optional per EAN einem Artikel vorgeschlagen werden
