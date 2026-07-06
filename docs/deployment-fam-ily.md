# stoqr — Deployment auf fam.ily-Ökosystem

Zielumgebung: Raspberry Pi 5 · Docker Compose v2 · Traefik · Pi-hole · lokale Domain `fam.ily`

---

## Verzeichnisstruktur auf dem Pi

```
/srv/hubdata/
├── stacks/
│   └── stoqr/
│       ├── docker-compose.yml    ← aus docs/docker-compose.fam.ily.yml
│       └── .env                  ← aus docs/env.fam.ily.example (befüllt)
└── state/
    └── stoqr/
        └── postgres/             ← PostgreSQL-Daten (auto-erstellt)
```

---

## Einmalige Vorbereitung

### 1. Verzeichnisse anlegen

```bash
mkdir -p /srv/hubdata/stacks/stoqr
mkdir -p /srv/hubdata/state/stoqr/postgres
```

### 2. Dateien kopieren

```bash
# Compose-File
cp /pfad/zu/stoqr/docs/docker-compose.fam.ily.yml \
   /srv/hubdata/stacks/stoqr/docker-compose.yml

# Env-Datei als Vorlage
cp /pfad/zu/stoqr/docs/env.fam.ily.example \
   /srv/hubdata/stacks/stoqr/.env
```

### 3. Secrets generieren und in .env eintragen

```bash
# Auf dem Pi ausführen:
echo "DB_PASSWORD=$(openssl rand -base64 24 | tr -d '=+/')"
echo "BETTER_AUTH_SECRET=$(openssl rand -base64 32)"
echo "ENCRYPTION_KEY=$(openssl rand -hex 32)"
```

Die drei Werte in `/srv/hubdata/stacks/stoqr/.env` eintragen.

### 4. Pi-hole DNS-Eintrag

In der Pi-hole Admin-Oberfläche unter **Local DNS Records**:

| Domain | IP |
|---|---|
| `stoqr.fam.ily` | `<Pi-IP>` |

### 5. Starten

```bash
cd /srv/hubdata/stacks/stoqr
docker compose up -d
```

Der Container führt beim Start automatisch alle Datenbankmigrationen aus.

### 6. Seed-Daten einspielen (einmalig)

```bash
# Service-Name ermitteln
docker compose ps

# Seed-SQL einspielen (Nährwerttypen + Kategorien)
docker compose cp /pfad/zu/stoqr/packages/db/drizzle/seed.sql \
  stoqr-postgres-1:/tmp/seed.sql
docker compose exec postgres psql -U stoqr -d stoqr -f /tmp/seed.sql
```

### 7. Ersten Account anlegen

```bash
curl -k -X POST https://stoqr.fam.ily/api/auth/sign-up/email \
  -H "Content-Type: application/json" \
  -d '{"email":"dein@email.de","password":"sicherespasswort","name":"Admin"}'
```

Danach unter `https://stoqr.fam.ily/login` einloggen.

---

## TLS-Konfiguration

Kein `certresolver` im Compose-File — der bestehende Traefik übernimmt das lokale Zertifikat automatisch.

Falls du ein Wildcard-Zertifikat für `*.fam.ily` verwendest, wird `stoqr.fam.ily` automatisch abgedeckt. Falls du ein selbstsigniertes Zertifikat nutzt, muss `curl -k` oder das Zertifikat im Browser als vertrauenswürdig markiert werden.

Für HTTP→HTTPS-Redirect: Falls Traefik das nicht global macht, die auskommentierte Middleware-Zeile im Compose-File aktivieren.

---

## Healthchecks

| Service | Check | Intervall |
|---|---|---|
| `stoqr` | `wget http://localhost:3000/` → HTTP 200 | 30s |
| `postgres` | `pg_isready -U stoqr -d stoqr` | 10s |

`stoqr` startet erst wenn `postgres` healthy ist (`depends_on: condition: service_healthy`).

---

## Backup & Restore

### Backup-Script

Das enthaltene Script `scripts/backup-db.sh` anpassen:

```bash
# Auf dem Pi in cron eintragen (täglich 02:30):
30 2 * * * BACKUP_DIR=/srv/hubdata/state/stoqr/backups \
           DB_CONTAINER=stoqr-postgres-1 \
           RETENTION_DAYS=30 \
           /srv/hubdata/stacks/stoqr/backup-db.sh
```

Script kopieren:
```bash
cp /pfad/zu/stoqr/scripts/backup-db.sh /srv/hubdata/stacks/stoqr/backup-db.sh
chmod +x /srv/hubdata/stacks/stoqr/backup-db.sh
```

### Manuelles Backup

```bash
docker exec stoqr-postgres-1 \
  pg_dump -U stoqr -d stoqr --format=custom \
  | gzip > /srv/hubdata/state/stoqr/backups/stoqr_$(date +%Y%m%d).dump.gz
```

### Restore

```bash
# Container stoppen
docker compose stop stoqr

# Dump einspielen
gunzip -c /srv/hubdata/state/stoqr/backups/stoqr_DATUM.dump.gz \
  | docker exec -i stoqr-postgres-1 \
    pg_restore -U stoqr -d stoqr --clean --if-exists

# Container starten
docker compose start stoqr
```

---

## Updates

```bash
cd /srv/hubdata/stacks/stoqr
docker compose pull
docker compose up -d
```

Migrationen laufen automatisch beim Neustart. Optional Watchtower für Auto-Updates:

```bash
# Watchtower nur für stoqr-Container
docker run -d \
  --name watchtower-stoqr \
  -v /var/run/docker.sock:/var/run/docker.sock \
  containrrr/watchtower \
  --interval 3600 \
  --cleanup \
  stoqr-stoqr-1
```

---

## Fehlerbehebung

```bash
# Container-Logs
docker compose -f /srv/hubdata/stacks/stoqr/docker-compose.yml logs -f stoqr

# Migrationsfehler
docker compose logs stoqr | grep -i "migrat"

# DB-Verbindung testen
docker compose exec postgres psql -U stoqr -d stoqr -c "\dt"
```
