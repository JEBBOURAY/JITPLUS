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
        if [ -f "./node_modules/prisma/build/index.js" ]; then
          node ./node_modules/prisma/build/index.js migrate resolve \
            --schema ./prisma/schema.prisma \
            --rolled-back "$mig" || true
        else
          ./node_modules/.bin/prisma migrate resolve \
            --schema ./prisma/schema.prisma \
            --rolled-back "$mig" || true
        fi
      fi
    done
  fi

  PRISMA_CLI="./node_modules/prisma/build/index.js"
  if [ ! -f "$PRISMA_CLI" ]; then
    PRISMA_CLI="./node_modules/.bin/prisma"
  fi

  echo "[Entrypoint] Running prisma migrate deploy with: $PRISMA_CLI"
  if node "$PRISMA_CLI" migrate deploy --schema ./prisma/schema.prisma; then
    echo "[Entrypoint] Migrations complete successfully."
  else
    MIG_STATUS=$?
    echo "[Entrypoint] ERROR: prisma migrate deploy exited with code $MIG_STATUS."
    node "$PRISMA_CLI" migrate status --schema ./prisma/schema.prisma || true
    exit "$MIG_STATUS"
  fi
fi

# ── Admin bootstrap ─────────────────────────────────────────────────────────
# If ADMIN_PASSWORD is set, create the admin account when it does not exist.
# Used by the migration Cloud Run Job to bootstrap the first admin.
#
# An existing admin is left untouched: its password (possibly changed since),
# isActive flag and brute-force lockout are NOT reset on every deploy. To
# deliberately reset the password and unlock the account, run one deploy /
# job execution with ADMIN_FORCE_RESET=true.
if [ -n "$ADMIN_PASSWORD" ]; then
  echo "[Entrypoint] Ensuring admin account exists..."
  node -e "
    const{PrismaClient}=require('@prisma/client');
    const b=require('bcryptjs');
    (async()=>{
      const p=new PrismaClient();
      const email='contact@jitplus.com';
      const force=process.env.ADMIN_FORCE_RESET==='true';
      try{
        const existing=await p.admin.findUnique({where:{email},select:{id:true}});
        if(existing&&!force){
          console.log('[Entrypoint] Admin already exists (id:'+existing.id+') — left unchanged.');
          return;
        }
        const h=await b.hash(process.env.ADMIN_PASSWORD,12);
        if(existing){
          await p.admin.update({
            where:{email},
            data:{password:h,isActive:true,failedLoginAttempts:0,lockedUntil:null}
          });
          console.log('[Entrypoint] ADMIN_FORCE_RESET=true — admin password reset and account unlocked (id:'+existing.id+').');
        }else{
          const a=await p.admin.create({data:{email,password:h,nom:'Admin JitPlus',role:'ADMIN'}});
          console.log('[Entrypoint] Admin created (id:'+a.id+').');
        }
      }finally{await p.\$disconnect();}
    })().catch(e=>{console.error('[Entrypoint] Admin bootstrap failed:',e);process.exit(1);});
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
