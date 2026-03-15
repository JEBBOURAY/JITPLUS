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

  # Prisma exige que DATABASE_URL soit défini pour valider le schéma, 
  # même si on utilise DIRECT_DATABASE_URL
  if [ -z "$DATABASE_URL" ] && [ -n "$DIRECT_DATABASE_URL" ]; then
    export DATABASE_URL="$DIRECT_DATABASE_URL"
  fi

  # Use the locally installed Prisma CLI (avoids npx downloading it)
  ./node_modules/.bin/prisma migrate deploy --schema ./prisma/schema.prisma
  echo "[Entrypoint] Migrations complete."
fi

# Si c'est un Job Cloud Run ou la commande "echo" envoyée par cloudbuild, on quitte.
# Cela empêche de lancer le serveur Web qui causerait un timeout.
if [ -n "$CLOUD_RUN_JOB" ] || [ "$1" = "echo" ]; then
  echo "[Entrypoint] Job de migration terminé. Arrêt du conteneur."
  exit 0
fi

echo "[Entrypoint] Starting application..."
exec "$@"
