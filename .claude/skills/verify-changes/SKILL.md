---
name: verify-changes
description: Verify a change in the jit-plus monorepo reliably — backend jest/tsc and Prisma migrations on the Linux copy with a throwaway Postgres 16, mobile tsc/jest through cmd.exe. Use after any code change before saying it works, when tests/tsc fail with EIO or "Cannot find module", or when checking a Prisma migration, drift or a query plan.
---

# Verify changes in jit-plus

The repo lives on OneDrive under `/mnt/c`. Parts of `node_modules` are online-only, so WSL reads fail at random (`EIO`, `TS6053`, `Cannot find module …/.pnpm/…`, thousands of bogus "react-native has no exported member" errors). These are **not** code failures. Pick the right runner below instead of retrying blindly.

## 1. Backend (`apps/backend`) — Linux copy

```bash
SRC=/mnt/c/Users/ayoub/OneDrive/Desktop/JIT/jit-plus
rsync -a --delete --exclude node_modules --exclude .git --exclude dist \
  "$SRC/apps/" ~/jitplus-verify/apps/
rsync -a "$SRC/packages/" ~/jitplus-verify/packages/ --exclude node_modules
cp "$SRC"/{package.json,pnpm-lock.yaml,pnpm-workspace.yaml} ~/jitplus-verify/
cp -r "$SRC/patches" ~/jitplus-verify/
cd ~/jitplus-verify && ~/.local/bin/pnpm install --frozen-lockfile   # pnpm 10.29.3; corepack is broken on this node
cd apps/backend && npx tsc --noEmit -p tsconfig.json && npx jest --ci
```

- Run a single suite with `npx jest path/to/file.spec.ts` while iterating; run the full suite once at the end.
- `src/admin/admin-auth.service.spec.ts` can time out under load (bcrypt). Re-run it alone before calling it a regression.

## 2. Prisma migrations — throwaway Postgres 16 only

Never write to the user's local DB (`localhost:5432/jit_db`).

```bash
cd ~/pg-throwaway && node start.mjs &      # prints READY, port 55432, db verify, user/pass tmp
export DATABASE_URL=postgresql://tmp:tmp@localhost:55432/verify
export DIRECT_DATABASE_URL=$DATABASE_URL   # MANDATORY: schema.prisma uses directUrl; otherwise apps/backend/.env wins
cd ~/jitplus-verify/apps/backend
npx prisma migrate deploy                   # from scratch, like the Cloud Run job jitplus-migrate
npx prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel prisma/schema.prisma --script   # must be empty (no drift)
```

Rules: indexes live in Prisma migrations (no manual SQL in prod); keep index names ≤ 63 chars or Postgres truncates them and causes drift. Use `EXPLAIN ANALYZE` on this DB for query-plan questions. Stop the DB afterwards (`kill %1`).

## 3. Mobile apps and admin — through Windows

`node_modules` was installed by the Windows pnpm; WSL pnpm must never be forced on it.

```bash
W='C:\Users\ayoub\OneDrive\Desktop\JIT\jit-plus'
cmd.exe /c "cd /d $W\apps\jitpluspro && node node_modules\typescript\bin\tsc --noEmit -p tsconfig.json"
cmd.exe /c "cd /d $W\apps\jitpluspro && npx jest --ci"
cmd.exe /c "cd /d $W\apps\jitplus && npx jest --ci"
cmd.exe /c "cd /d $W\apps\jitplus && node scripts\check-i18n.js"
cmd.exe /c "cd /d $W\apps\admin && npx tsc --noEmit"
```

Adding a dependency: `cmd.exe /c "cd /d $W && pnpm --filter <app> add <pkg>"`.

## Known red tests (not regressions)

- jitpluspro `__tests__/rewardManager.test.tsx` "follows its updates" fails on main.
- jitpluspro `scratchCampaignForm` Morocco TZ test fails only with Windows Node ICU.

If the only failures are these, treat the run as green and say so.

## Reporting

State what ran and what passed, by suite count. If a step could not finish because of EIO, say it was not verified. Do not call it a pass.
