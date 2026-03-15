#!/bin/sh
set -e

# ── Migrations ──────────────────────────────────────────────────────────────
# On Cloud Run, migrations should be run ONCE via a dedicated Cloud Run Job
# (see cloudbuild.yaml). Set SKIP_MIGRATIONS=1 to bypass them here.
# For local Docker / docker-compose usage, leave SKIP_MIGRATIONS unset.
if [ "${SKIP_MIGRATIONS:-0}" = "1" ]; then
  echo "[Entrypoint] SKIP_MIGRATIONS=1 — skipping migrations."
else
  echo "[Entrypoint] Running database migrations..."
  # Use the locally installed Prisma CLI (avoids npx downloading it)
  ./node_modules/.bin/prisma migrate deploy --schema ./prisma/schema.prisma
  echo "[Entrypoint] Migrations complete."
fi

echo "[Entrypoint] Starting application..."
exec "$@"
