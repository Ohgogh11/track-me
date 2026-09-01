# Track Me

Track Me is a personal, offline-first gym and calorie tracker for iPhone and Android. It is a strict TypeScript monorepo with an Expo Router app, a OneBun API, shared analytics/contracts, Turso/libSQL cloud storage, and local `expo-sqlite` storage.

## What is implemented

- Clerk custom email/password authentication, email verification, password reset, Google SSO, protected routes, and secure token caching. Without Clerk keys the app uses an explicitly non-production demo login.
- Reusable workout plans with ordered exercises and independently editable warm-up/work sets, rep ranges, RPE, and rest.
- Empty or plan-based active workouts with persisted pause/resume segments, editable session prescriptions, rest notifications/haptics, and crash/restart recovery.
- Completing a workout saves the session without changing or creating a workout plan.
- Editable and soft-deletable workout history.
- Seeded and personal exercises, including secondary muscles, copy/hide/archive/restore controls.
- Nutrition tracking with USDA search, Open Food Facts barcode scanning, reviewed servings/macros, personal foods, favorites, recent-food logging, effective-dated targets, and body-weight entries.
- Date-ranged workout, muscle, exercise, PR, calorie, and body-weight analytics with an interactive front/back SVG muscle map.
- Local-first writes, an outbox, idempotent cursor sync, tombstones, user isolation, conflict recovery, and explicit active-workout takeover.

## Repository layout

```text
apps/mobile       Expo / React Native app
apps/api          Bun + OneBun sync API and SQL migrations
packages/contracts Shared domain, validation, analytics, and sync DTOs
packages/database Shared Drizzle/libSQL server schema and client
docs              Architecture, deployment, and manual iPhone QA
```

## Local setup

1. Install Bun 1.4 or newer.
2. Run `bun install` from the repository root.
3. Copy `apps/api/.env.example` to `apps/api/.env` for OneBun and `apps/mobile/.env.example` to `apps/mobile/.env` for Expo. Workspace scripts run from their package directory, so a root `.env` is not used. Never put Turso or Clerk secrets in an `EXPO_PUBLIC_` variable.
4. Add a free `USDA_FDC_API_KEY` to the API environment for food search and identify the app in `OPEN_FOOD_FACTS_USER_AGENT` for barcode lookup. Both remain server-only.
5. For the fastest local UI check, leave the Clerk publishable key empty and set `ALLOW_DEMO_AUTH=true` on the API.
6. Run the migration with `bun run db:migrate`.
7. Start the API with `bun run dev:api`.
8. Set `EXPO_PUBLIC_API_URL` to a URL reachable from the phone (a Koyeb URL or the computer's LAN IP), then run `bun run dev:mobile` and scan the Expo Go QR code.

Useful commands:

```bash
bun run check
bun run db:migrate
bun run dev:api
bun run dev:mobile
bun run --filter @track-me/mobile export
```

Expo Go intentionally uses standard SQLite. The `development` EAS profile enables SQLCipher; use it only after Apple/Android signing access is available. SMS login is intentionally deferred because Clerk production SMS authentication can incur paid-plan/provider requirements.

## Credentials and deployment

The repository contains placeholders only. Create separate test Clerk and Turso resources, rotate any credential that has ever appeared in a terminal or example file, and follow [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md). The API cannot be deployed from this workspace until those account credentials and a Koyeb account are supplied.

## Verification

`bun run check` runs Biome, strict TypeScript checks, unit tests, database tests, Clerk guard tests, and sync integration tests. CI also validates iOS/Android Expo exports and the API Docker image. Physical-device acceptance is documented in [docs/MANUAL_QA.md](docs/MANUAL_QA.md).
