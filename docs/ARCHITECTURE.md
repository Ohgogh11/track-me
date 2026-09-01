# Architecture

## Runtime shape

The Expo app owns the interactive experience and is authoritative while offline. Every write commits to `track-me.db` and upserts one coalesced mutation into `sync_outbox` in the same SQLite transaction. Synchronization runs after login, on foreground, after connectivity returns, on manual refresh, and after a short post-edit debounce.

The OneBun API authenticates the bearer token, derives the account exclusively from the verified Clerk `sub`, and passes that user ID to the sync service. The client can never choose the server-side user scope. The API stores aggregate JSON plus searchable sync metadata in Turso through Drizzle's direct libSQL driver.

```text
Expo screens
  -> local repository transaction
     -> local_entities
     -> sync_outbox
  -> POST /v1/sync
     -> Clerk guard
     -> version/idempotency transaction
        -> sync_entities
        -> processed_mutations
        -> sync_changes
  <- acknowledgements, conflicts, cursor changes
```

## Data choices

- IDs are client-generated UUIDs, timestamps are UTC ISO strings, calories/seconds/grams are integers, and RPE is stored in tenths.
- The profile timezone controls local-date grouping. Weight storage is always grams; kg/lb affects display and input conversion only.
- A set row is the set count. Each row contains its own set type, rep range, target RPE, and rest seconds.
- Starting from a plan clones it into a workout aggregate. Completed workout exercises retain snapshot names and muscle assignments, so later catalog edits do not rewrite history.
- Timer segments make pause/resume duration durable across backgrounding and process restarts. A current rest deadline is reconstructed from the latest completed set timestamp and rest prescription.
- Mobile-only tables contain local aggregates, outbox mutations, conflicts, and cursor state. Server-only tables contain current aggregates, an append-only change sequence, processed mutation IDs, devices, and a migration ledger.

## Synchronization rules

1. A null cursor bootstraps all changes visible to the verified user. Later numeric cursors pull sequence-ordered changes.
2. Mutation IDs are recorded server-side, so a retry returns the original acknowledgement without applying the mutation again.
3. Upserts/deletes require `baseVersion` to match the cloud version. A mismatch returns both metadata and the current cloud payload.
4. Local pending entities are never overwritten by pulled changes. The conflict remains explicit in Settings.
5. Selecting cloud for a template or workout first creates a new recoverable local aggregate. Simple entries expose Keep mine/Use cloud.
6. Only one cloud workout may be active. A rejected offline session can be kept as a draft, or Take over can demote the prior cloud session to a recoverable draft before activating the new one.
7. Deletes increment versions and flow as tombstones.

## Analytics invariants

Only completed, non-deleted work sets are eligible. A primary muscle receives `1.0` per set and every secondary muscle receives `0.5`. Load volume is external kilograms multiplied by completed reps; missing load never fabricates volume. Epley estimated 1RM applies only to loaded sets of 1–12 reps. PRs are evaluated chronologically against all earlier eligible history, then filtered for the selected display range.

## Security boundaries

- Clerk publishable keys may be present in the mobile build; Clerk JWT public keys and Turso tokens are API-only.
- Demo authentication is ignored whenever `NODE_ENV=production`.
- Expo Go uses unencrypted SQLite. SQLCipher is enabled only by the EAS development profile, with its generated database key held in SecureStore.
- Server rows use `(user_id, entity_type, entity_id)` scope, and integration tests verify cross-user isolation.
