#!/bin/sh
set -e

echo "[stoqr] Running database migrations..."
node /app/migrate.js

# Media-Verzeichnis (Katalog-Bilder, G7) sicherstellen — im Docker-Volume.
MEDIA_DIR="${MEDIA_DIR:-/data/media}"
echo "[stoqr] Ensuring media dir at ${MEDIA_DIR}..."
mkdir -p "${MEDIA_DIR}"

echo "[stoqr] Starting application..."
exec node build
