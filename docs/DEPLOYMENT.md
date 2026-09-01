# Test Deployment: Turso, Clerk, Koyeb, and Expo Go

Use separate test resources. Never paste a Turso token or Clerk secret into a committed file or an `EXPO_PUBLIC_` variable. If a real Turso token has appeared in an example file or terminal transcript, revoke it and issue a new one before continuing.

## 1. Create test Turso resources

1. Create a test database in a European location near Koyeb Frankfurt.
2. Create a database-scoped token with only the access this API needs.
3. Copy `apps/api/.env.example` to the ignored `apps/api/.env`, then set `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, and `CLERK_JWT_KEY` there.
4. From the repository root, run `bun run db:migrate`. Bun executes the API workspace script from `apps/api`, where it loads that `.env`.
5. Run it a second time. The `_track_me_migrations` ledger should make the command a safe no-op.

Do not put either value in `apps/mobile/.env`.

## 2. Configure Clerk

1. Create a test Clerk application.
2. Enable email/password, email verification, and Google OAuth. Phone/SMS is not part of V1.
3. Add the app's development redirect URI shown by Expo/Clerk during the first Google attempt, and later add the `trackme://continue` native redirect for development builds.
4. Copy the publishable key to `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` in `apps/mobile/.env`.
5. Copy Clerk's JWT verification public key (PEM) to Koyeb as `CLERK_JWT_KEY`. Preserve line breaks or use escaped `\\n`; the API normalizes escaped newlines.

Test sign-up, email verification, password reset, sign-out, password sign-in, and Google sign-in before using production accounts.

## 3. Deploy the Docker API to Koyeb

1. Push this repository to a private Git host accessible to Koyeb, or connect the repository directly.
2. Create a Web Service in the Frankfurt region using the repository root as build context and `apps/api/Dockerfile` as the Dockerfile.
3. Expose HTTP port `3000` and set the health check path to `/health`.
4. Set these secrets/environment values in Koyeb:

   - `NODE_ENV=production`
   - `HOST=0.0.0.0`
   - `PORT=3000`
   - `TURSO_DATABASE_URL=<test database URL>`
   - `TURSO_AUTH_TOKEN=<new test token>`
   - `CLERK_JWT_KEY=<Clerk JWT public key>`
   - `ALLOW_DEMO_AUTH=false`

5. Deploy and verify `https://<service-domain>/health`, `/docs`, and `/openapi.json`.
6. Do not run migrations automatically on every scaled instance. Run `bun run db:migrate` explicitly from a trusted terminal before deploying a schema change.

Free instances can scale to zero. The mobile app retries network/502/503/504 failures with backoff while retaining the local outbox, so a cold start does not block offline work.

## 4. Connect Expo Go on iPhone

Create `apps/mobile/.env`:

```dotenv
EXPO_PUBLIC_API_URL=https://<your-koyeb-service-domain>
EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_<your-key>
EXPO_PUBLIC_USE_SQLCIPHER=false
```

Run `bun run dev:mobile`, install Expo Go on the iPhone, and scan the QR code. The computer and iPhone must be able to reach the Expo development server. Use the tunnel option if LAN discovery is unavailable.

## 5. Signed development builds later

After Apple signing access is available, install/authenticate the EAS CLI and run a development build from `apps/mobile` using the `development` profile in `eas.json`. That profile turns on SQLCipher and the app creates/stores its key in SecureStore. Build Android from the same profile after the iOS development build is working. Never enable `EXPO_PUBLIC_USE_SQLCIPHER=true` inside Expo Go.

## Rollback and rotation

- API rollback: redeploy the prior image. Schema changes must remain backward-compatible until all clients have updated.
- Turso token rotation: issue a replacement, update Koyeb, redeploy, then revoke the old token.
- Clerk key rotation: update `CLERK_JWT_KEY` and redeploy before retiring the prior key.
- Mobile public config changes require restarting Expo or producing a new build.
