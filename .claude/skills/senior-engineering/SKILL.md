---
name: senior-engineering
description: Senior-level engineering standards for the jit-plus codebase — NestJS + Prisma backend, Expo/React Native apps with react-query and zustand, shared package — covering correctness, concurrency, security, performance, error handling and tests. Use when writing or changing any backend endpoint, service, migration or mobile data flow, when reviewing code, or before calling a feature done.
---

# Senior engineering standards (jit-plus)

Write the code a careful senior would sign off on. Change only what the task needs, follow the existing pattern of the module, and prove it works.

## Backend (NestJS 11, Prisma 5, Postgres 16)

- **Structure:** controller (routing, guards, DTO) → service (business rules) → Prisma. Reuse `common/` before writing helpers: `prisma-selects.ts` (typed selects, never return a full model), `repositories/transaction-runner.ts`, `utils/retry-transaction.helper.ts`, `coordination/` (cron locks, OTP limiter), `guards/`, `filters/all-exceptions.filter.ts`.
- **Input:** every body or query is a class-validator DTO (whitelist on). Validate ids, enums, lengths and ranges. Never trust a merchantId or clientId from the body: take it from the JWT (`@CurrentUser`).
- **Authorization:** every query on merchant data is scoped by the caller's merchant (and store or team role). Every query on client data is scoped by the client. Test the cross-tenant case.
- **Errors:** throw Nest exceptions with an i18n key (`'error.<domain>.<reason>'`) and add the fr/en/ar text in `common/i18n/error-messages.ts`. Never send raw strings or stack traces.
- **Money, stamps, points, rewards, coupons, game prizes** = race conditions. Use an interactive transaction, with `Serializable` + `withRetry` or a conditional update (`updateMany where: { id, version / balance >= x }` and check `count`). Never read-then-write outside a transaction. Make operations idempotent when a client can retry (scan, redeem, claim).
- **Queries:** `select` only the needed fields. No N+1 (no query in a loop; use `in` or `include`). Paginate every list (cursor preferred). Add an index in a migration for every new `where`/`orderBy` path on a large table, and check with `EXPLAIN ANALYZE` on the throwaway DB (`verify-changes`).
- **Migrations:** additive and backward compatible. The old API version runs while the job migrates. Add a column nullable or with a default, backfill, then tighten in a later migration. Never edit an applied migration.
- **Rate limits:** sensitive endpoints (OTP, login, redeem, public lookups) get `@Throttle`. OTP sends go through the limiter.
- **Logs:** use the Nest `Logger`, no PII (phone, email, OTP) outside `NODE_ENV=development`. Report errors to Sentry with context, without secrets.
- **Crons:** wrap them in `cron-utils` with a run lock, keep them idempotent, and make them safe when several instances run.

## Mobile (Expo SDK 58, RN 0.88, react-query, zustand)

- **Server state in react-query, client state in zustand.** Never copy server data into a store. Query keys are stable arrays (`['merchant', id, 'rewards']`). After a mutation, invalidate or update exactly the affected keys.
- **Network:** go through the existing api service (`services/api`). Handle 401 refresh, timeouts and offline. Show translated errors (`error.code` from the backend).
- **Lists:** `FlatList`/`FlashList` with stable `keyExtractor`, memoized rows, no inline heavy closures in large lists. Images via `expo-image` with cache and fixed size.
- **Renders:** keep contexts small, memoize derived values that are actually expensive, avoid new objects in props of memo components. Measure before optimizing.
- **Native and platform:** guard platform-specific code (`Platform.OS`), keep Pro iOS App Store rules (`mobile-release-check`), and use `useDir` for RTL in Pro.
- **Secrets:** tokens in SecureStore, never in AsyncStorage or logs. Only `EXPO_PUBLIC_*` values reach the bundle, so they are public by definition.

## Tests and done-ness

- Every bug fix adds a test that fails before the fix. Every new service rule gets unit tests, including the unhappy paths (unauthorized, other tenant, double submit, expired, limit reached).
- Run `verify-changes` (tsc + jest + migrations). Run `i18n-rtl-check` when strings changed. For UI, look at it on the emulator (`run-mobile`).
- Keep diffs small and focused. Preserve CRLF files. Don't commit unless asked.

## Review checklist (for your own diff or someone else's)

Correctness → authz and tenant scoping → concurrency and idempotency → input validation → error keys translated → query count and indexes → migration safety → mobile states (loading, empty, error, offline) → tests → naming and dead code. Use `/code-review` for an independent pass and `security-audit` for auth or payment flows.
