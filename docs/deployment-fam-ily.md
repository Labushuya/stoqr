# stoqr — Deployment auf fam.ily-Ökosystem

Zielumgebung: Raspberry Pi 5 · Docker Compose v2 · Traefik · Pi-hole · lokale Domain `fam.ily`

---

## Verzeichnisstruktur auf dem Pi

```
/srv/hubdata/
├── stacks/
│   └── stoqr/
│       └── docker-compose.yml    ← aus docs/docker-compose.fam.ily.yml
└── state/
    └── stoqr/
        ├── .env                  ← Secrets (aus docs/env.fam.ily.example, befüllt)
        └── postgres/             ← PostgreSQL-Daten (auto-erstellt beim Start)
```

Optionaler Symlink (nur für `docker compose` CLI-Komfort, nicht zwingend):
```bash
ln -s /srv/hubdata/state/stoqr/.env /srv/hubdata/stacks/stoqr/.env
```

---

## Einmalige Vorbereitung

### 1. Verzeichnisse anlegen

```bash
mkdir -p /srv/hubdata/stacks/stoqr
mkdir -p /srv/hubdata/state/stoqr/postgres
```

### 2. Compose-File kopieren

```bash
cp /pfad/zu/stoqr/docs/docker-compose.fam.ily.yml \
   /srv/hubdata/stacks/stoqr/docker-compose.yml
```

### 3. Secret-Datei anlegen

```bash
cp /pfad/zu/stoqr/docs/env.fam.ily.example \
   /srv/hubdata/state/stoqr/.env

chmod 600 /srv/hubdata/state/stoqr/.env
```

### 4. Secrets generieren und eintragen

Auf dem Pi ausführen — Werte direkt in die `.env` schreiben:

```bash
# Werte anzeigen lassen, dann manuell in .env eintragen:
echo "POSTGRES_PASSWORD=$(openssl rand -base64 24 | tr -d '=+/')"
echo "BETTER_AUTH_SECRET=$(openssl rand -base64 32)"
echo "ENCRYPTION_KEY=$(openssl rand -hex 32)"
```

In `/srv/hubdata/state/stoqr/.env` eintragen:
- `POSTGRES_PASSWORD` — und denselben Wert in `DATABASE_URL` nach `stoqr:` einsetzen
- `BETTER_AUTH_SECRET`
- `ENCRYPTION_KEY`

### 5. Pi-hole DNS-Eintrag

In der Pi-hole Admin-Oberfläche unter **Local DNS Records**:

| Domain | IP |
|---|---|
| `stoqr.fam.ily` | `<Pi-IP>` |

### 6. Starten

```bash
cd /srv/hubdata/stacks/stoqr
docker compose up -d
```

Der Container führt beim Start automatisch alle Datenbankmigrationen aus (`entrypoint.sh` → `migrate.js`).

### 7. Seed-Daten einspielen (einmalig)

Nährwerttypen und Standardkategorien:

```bash
docker compose cp /pfad/zu/stoqr/packages/db/drizzle/seed.sql \
  stoqr-postgres-1:/tmp/seed.sql
docker compose exec postgres psql -U stoqr -d stoqr -f /tmp/seed.sql
```

> Servicename prüfen: `docker compose ps`

### 8. Ersten Account anlegen

```bash
curl -k -X POST https://stoqr.fam.ily/api/auth/sign-up/email \
  -H "Content-Type: application/json" \
  -d '{"email":"dein@email.de","password":"sicherespasswort","name":"Admin"}'
```

Danach unter `https://stoqr.fam.ily/login` einloggen.

---

## TLS-Konfiguration

Kein `certresolver` im Compose — der bestehende Traefik übernimmt das lokale Zertifikat.
Bei Wildcard `*.fam.ily` wird `stoqr.fam.ily` automatisch abgedeckt.

---

## Healthchecks

| Service | Prüfung | Intervall |
|---|---|---|
| `stoqr` | `wget http://localhost:3000/` → HTTP-Antwort | 30s |
| `postgres` | `pg_isready -U stoqr -d stoqr` | 10s |

`stoqr` startet erst wenn `postgres` healthy ist.

---

## Backup & Restore

### Backup einrichten (cron)

```bash
# Script kopieren
cp /pfad/zu/stoqr/scripts/backup-db.sh /srv/hubdata/stacks/stoqr/backup-db.sh
chmod +x /srv/hubdata/stacks/stoqr/backup-db.sh

# Cron-Eintrag (täglich 02:30):
crontab -e
# Zeile hinzufügen:
30 2 * * * BACKUP_DIR=/srv/hubdata/state/stoqr/backups DB_CONTAINER=stoqr-postgres-1 RETENTION_DAYS=30 /srv/hubdata/stacks/stoqr/backup-db.sh
```

### Manuelles Backup

```bash
mkdir -p /srv/hubdata/state/stoqr/backups
docker exec stoqr-postgres-1 \
  pg_dump -U stoqr -d stoqr --format=custom \
  | gzip > /srv/hubdata/state/stoqr/backups/stoqr_$(date +%Y%m%d_%H%M%S).dump.gz
```

### Restore

```bash
docker compose stop stoqr

gunzip -c /srv/hubdata/state/stoqr/backups/stoqr_DATUM.dump.gz \
  | docker exec -i stoqr-postgres-1 \
    pg_restore -U stoqr -d stoqr --clean --if-exists

docker compose start stoqr
```

---

## Updates

```bash
cd /srv/hubdata/stacks/stoqr
docker compose pull
docker compose up -d
# Migrationen laufen automatisch beim Neustart
```

---

## Fehlerbehebung

```bash
# App-Logs
docker compose logs -f stoqr

# Migrationsfehler prüfen
docker compose logs stoqr | grep -i "migrat"

# DB-Verbindung testen
docker compose exec postgres psql -U stoqr -d stoqr -c "\dt"

# Healthcheck-Status
docker inspect stoqr-stoqr-1 | grep -A5 Health
```
