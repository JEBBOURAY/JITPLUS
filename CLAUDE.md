# JIT+ monorepo

Loyalty platform for Moroccan merchants: customers collect stamps/points, merchants run rewards, deals, bookings, lucky wheel and scratch-card games.

## Layout (pnpm 10.29.3 workspace)

| Path | What | Stack |
|---|---|---|
| `apps/backend` | API for both apps and the admin | NestJS 11, Prisma 5, PostgreSQL 16, socket.io (`events/`), Firebase push |
| `apps/jitplus` | Client app (customers) | Expo SDK 58, RN 0.88, expo-router, Reanimated 4, native RTL |
| `apps/jitpluspro` | Merchant app ("Pro") | Expo SDK 58, expo-router, core Animated, **manual RTL via `hooks/useDir.ts`** |
| `apps/admin` | Back-office | Vite + React + react-router |
| `packages/shared` | Code shared by the apps (api factory, currency/date, providers, booking, expo-plugins) | TS |

Backend modules live in `apps/backend/src/<domain>` (auth = merchants, client-auth = customers, admin, rewards, deals, booking, stamp-codes, lucky-wheel, scratch-card, notifications…). The schema is in `apps/backend/prisma/schema.prisma`.

Locales: `fr`, `en`, `ar` in `apps/*/i18n/locales`. French is the reference language.

## Working rules

- **Verification:** the repo sits on OneDrive under `/mnt/c`, so WSL reads of `node_modules` fail at random (EIO). Use the `verify-changes` skill: backend runs on the Linux copy `~/jitplus-verify`, mobile tsc/jest run through `cmd.exe`. Never use WSL `pnpm install` in this folder.
- **Database:** never write to the local dev DB (`localhost:5432/jit_db`). Migrations are tested on the throwaway Postgres 16 and must export both `DATABASE_URL` and `DIRECT_DATABASE_URL`. Every schema change ships as a Prisma migration. Prod runs `prisma migrate deploy` via the Cloud Run job `jitplus-migrate` (see `cloudbuild.yaml`).
- **Line endings:** many mobile files are CRLF. Use the Edit tool. If you script edits, keep `newline=''`. Check `git diff --numstat` after bulk edits.
- **Uncommitted work:** the working tree usually holds large uncommitted changes. Never restore or rebuild a file from `git show HEAD:`.
- **Releases:** run the `mobile-release-check` skill before any EAS build. Building, submitting and deploying are the user's call.
- **Pro on iOS:** no plan upsell copy or CTA (`i18n/iosStoreCopy.ts`). The Meta SDK starts only after ATT.
- **Strings and layout:** run the `i18n-rtl-check` skill after changing user-facing text or layouts.
- **Commits:** do not commit or push unless asked.

## Project skills (`.claude/skills/`)

| Skill | When |
|---|---|
| `senior-engineering` | writing or reviewing any backend or mobile code |
| `jitplus-design-system` | any UI work: tokens, premium and calm look, no "AI look" |
| `ux-review` | designing or reviewing a flow for ease of use |
| `native-feel` | iOS/Android behavior: back, sheets vs alerts, keyboard, safe areas, permissions |
| `fluid-performance` | speed and smoothness: cache, optimistic UI, lists, images, animations, startup |
| `ux-writing` | any user-facing text in fr / ar (Darija) / en, errors, notifications |

### Code review, quality and performance

- **Review a diff:** `/code-review` (bugs), `/simplify` (reuse, quality, efficiency, applies fixes), `/security-review` (auth, payments, data exposure), all checked against `senior-engineering`.
- **Vendored third-party guides** (read-only, provenance and commit in each `SOURCE.md`, vetted 2026-11-21: MIT, markdown only):
  - `react-native-best-practices` (Callstack): RN performance (FPS, re-renders, startup/TTI, bundle size, memory), with a measure-first workflow.
  - `vercel-react-native-skills` (Vercel): RN/Expo code rules (lists, animations, UI patterns, state, monorepo).
  - `supabase-postgres-best-practices` (Supabase): Postgres indexes, query plans, locking, pagination, N+1, connections.
- **Precedence:** CLAUDE.md and the project skills win over these generic guides. In this repo:
  - Schema and index changes go through Prisma migrations only; the RLS sections don't apply (tenant scoping lives in the NestJS services).
  - Adding a dependency they suggest (FlashList, Legend List, Galeria, Jotai, React Compiler, Reanimated or gesture-handler in Pro) is the user's call: propose it with the measured gain, don't install it.
  - Pro keeps core `Animated` and manual RTL (`useDir`) by design.
  - Callstack's `agent-device` CLI is not installed; use the manual profiling fallback and the adb commands in `fluid-performance`.
  - Measure before and after any performance change and report the numbers.
| `verify-changes` | proving a change works (tests, tsc, migrations) |
| `run-mobile` | running the apps on the emulator and taking screenshots |
| `i18n-rtl-check` | strings, Arabic, RTL |
| `mobile-release-check` | before any EAS build or store submission |
