#!/bin/sh
set -e

echo "[stoqr] Running database migrations..."
node /app/migrate.js

echo "[stoqr] Starting application..."
exec node build
