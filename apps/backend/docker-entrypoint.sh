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

  # ── Auto-resolve failed migrations (P3009) ──────────────────────────────
  # If a previous Cloud Run Job attempt left a migration in a "failed" state
  # in _prisma_migrations, `migrate deploy` refuses to proceed. We detect
  # those rows and mark them as rolled-back so the migration can be retried.
  # The DDL in our migrations runs in a single transaction, so a failed run
  # leaves no partial changes to revert in the app DB.
  echo "[Entrypoint] Checking for previously failed migrations..."
  FAILED_MIGRATIONS=$(node -e "
    const{PrismaClient}=require('@prisma/client');
    (async()=>{
      const p=new PrismaClient();
      try{
        const rows=await p.\$queryRawUnsafe(
          \"SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NULL AND rolled_back_at IS NULL\"
        );
        console.log(rows.map(r=>r.migration_name).join('\n'));
      }catch(e){
        // Table may not exist yet on a fresh DB — nothing to resolve.
        if(!/does not exist/i.test(String(e))) throw e;
      }finally{await p.\$disconnect();}
    })();
  " 2>/dev/null || true)

  if [ -n "$FAILED_MIGRATIONS" ]; then
    echo "[Entrypoint] Found failed migrations, resolving as rolled-back:"
    echo "$FAILED_MIGRATIONS"
    echo "$FAILED_MIGRATIONS" | while IFS= read -r mig; do
      if [ -n "$mig" ]; then
        echo "[Entrypoint]   → prisma migrate resolve --rolled-back $mig"
        ./node_modules/.bin/prisma migrate resolve \
          --schema ./prisma/schema.prisma \
          --rolled-back "$mig" || true
      fi
    done
  fi

  # Use the locally installed Prisma CLI (avoids npx downloading it)
  ./node_modules/.bin/prisma migrate deploy --schema ./prisma/schema.prisma
  echo "[Entrypoint] Migrations complete."
fi

# ── Admin bootstrap ─────────────────────────────────────────────────────────
# If ADMIN_PASSWORD is set, upsert the admin account (idempotent).
# Used by the migration Cloud Run Job to bootstrap the first admin.
if [ -n "$ADMIN_PASSWORD" ]; then
  echo "[Entrypoint] Creating/updating admin account..."
  node -e "
    const{PrismaClient}=require('@prisma/client');
    const b=require('bcryptjs');
    (async()=>{
      const p=new PrismaClient();
      try{
        const h=await b.hash(process.env.ADMIN_PASSWORD,12);
        const a=await p.admin.upsert({
          where:{email:'contact@jitplus.com'},
          update:{password:h,nom:'Admin JitPlus',isActive:true,failedLoginAttempts:0,lockedUntil:null},
          create:{email:'contact@jitplus.com',password:h,nom:'Admin JitPlus',role:'ADMIN'}
        });
        console.log('[Entrypoint] Admin ready:',a.email,'(id:'+a.id+')');
      }finally{await p.\$disconnect();}
    })();
  "
fi

# Si c'est un Job Cloud Run ou la commande "echo" envoyée par cloudbuild, on quitte.
# Cela empêche de lancer le serveur Web qui causerait un timeout.
if [ -n "$CLOUD_RUN_JOB" ] || [ "$1" = "echo" ]; then
  echo "[Entrypoint] Job de migration terminé. Arrêt du conteneur."
  exit 0
fi

echo "[Entrypoint] Starting application..."
exec "$@"
