#!/bin/sh
set -e

echo "[stoqr] Running database migrations..."
node /app/migrate.js

# Media-Verzeichnis (Katalog-Bilder, G7) sicherstellen — im Docker-Volume.
# Non-fatal: schlaegt das mkdir fehl (z.B. Volume-Rechte), darf der Start NICHT
# abbrechen — der Bild-Download degradiert dann einfach (localImagePath=null).
MEDIA_DIR="${MEDIA_DIR:-/data/media}"
echo "[stoqr] Ensuring media dir at ${MEDIA_DIR}..."
mkdir -p "${MEDIA_DIR}" 2>/dev/null || echo "[stoqr] WARN: konnte ${MEDIA_DIR} nicht anlegen (Bild-Download deaktiviert)"

echo "[stoqr] Starting application..."
exec node build
