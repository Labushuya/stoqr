#!/bin/sh
set -e

echo "[stoqr] Running database migrations..."
node /app/packages/db/migrate.js

echo "[stoqr] Starting application..."
exec node build
