#!/bin/sh
set -e

echo "[stoqr] Running database migrations..."
node /app/migrate.js

# Media-Verzeichnis (Artikel-/Katalog-Bilder) sicherstellen — im gemounteten
# Volume. Non-fatal: schlaegt mkdir/Schreiben fehl (falsche Volume-Rechte), darf
# der Start NICHT abbrechen — der Bild-Download degradiert dann (localImagePath=null).
# WICHTIG: das gemountete Verzeichnis muss dem Container-User (uid 1000) gehoeren,
# sonst 404 auf /media. Host: chown -R 1000:1000 <media-dir>.
MEDIA_DIR="${MEDIA_DIR:-/data/media}"
echo "[stoqr] Ensuring media dir at ${MEDIA_DIR}..."
if mkdir -p "${MEDIA_DIR}" 2>/dev/null && [ -w "${MEDIA_DIR}" ]; then
  echo "[stoqr] media dir OK (writable)"
else
  echo "[stoqr] WARN: ${MEDIA_DIR} nicht beschreibbar — Bild-Download deaktiviert. Host: chown -R 1000:1000 auf den Mount pruefen."
fi

echo "[stoqr] Starting application..."
exec node build
