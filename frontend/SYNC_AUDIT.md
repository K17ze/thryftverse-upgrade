# Offline Sync Engine — Audit & Hardening Report

Audit of the offline-first sync engine in `frontend/src`, conducted against
2026 August research on offline-first architecture (local DB as source of
truth, delta sync, conflict resolution, surfacing sync status, optimistic
updates with idempotency keys, chaos-scenario testing).

---

## 1. Sync infrastructure inventory

| File | Role | Status |
|------|------|--------|
| `src/storage/syncEngine.ts` | Pull/push reconciliation loop against `/sync` endpoints. Single-flighted per domain. Handles 4 server response states: `applied` / `superseded` / `conflict` / `gone`. | Solid contract + stub. Delta apply is generic upsert/soft-delete with a per-domain column rename map. |
| `src/storage/outboxClient.ts` | Durable mutation queue (`mutation_outbox` table). NetInfo + AppState drain triggers. `getOutboxPendingCount`, `getOutboxConflicts`, `markOutboxOperationFailed`. | Solid. Idempotency via `operationId`. Drain is single-flighted via `isDraining` guard. |
| `src/services/chatOutbox.ts` | Chat-specific outbox. Replays pending messages with original `clientMessageId` for server-side dedup. | Solid. Idempotency via `clientMessageId`. Exponential backoff would be an improvement (currently relies on the drain cadence). |
| `src/lib/offlineQueue.ts` | Zustand-persisted HTTP request queue (AsyncStorage). Full-jitter exponential backoff, dedup by signature, 429 `Retry-After` honoured, dead-letter queue after 8 retries. | Solid. This is the *transport-level* queue (raw fetch replay), complementary to the *mutation-level* outbox in SQLite. |
| `src/components/OfflineBanner.tsx` | Full-width / compact offline banner. NetInfo-driven, animated, retry callback. | Works, but only covers the *connectivity* state — not outbox pending/failed/conflict. |
| `src/components/SyncStatusPill.tsx` + `src/utils/syncStatus.ts` | Backend *data freshness* pill (live / syncing / offline-cache) for read surfaces. | Distinct concern from the engine sync state. Not a replacement for an outbox-status indicator. |

### Schema (`src/storage/schema.ts`)

- `mutation_outbox`: `state` transitions `pending → pushing → synced | conflict | failed`. `attempt_count`, `last_error`, `operation_id` (UNIQUE — idempotency key).
- Domain tables (`feed_item`, `listing_draft`, `product`) carry `server_rev`, `sync_seq`, `is_deleted`, `updated_at` for delta reconciliation.
- `sync_cursor`: per-domain `last_rev`, `last_synced_at`, `freshness_ttl_ms`.

---

## 2. Sync status UI — audit findings

### What existed before this change

- **`OfflineBanner`** surfaces *connectivity* (offline / online) with a retry
  button. It does **not** surface outbox state.
- **`SyncStatusPill`** surfaces *data freshness* for a single read surface
  (is the data live from the API, syncing, or offline-cache). It does **not**
  surface outbox state.
- **`getOutboxPendingCount`** and **`getOutboxConflicts`** existed in
  `outboxClient.ts` but were **never called by any UI**. The counts were
  computed nowhere — pending and failed changes were invisible to the user.
- **`MoodboardEditorScreen`** had a screen-local `SyncStatus` type
  (`idle / syncing / synced / conflict / error`) with a saving overlay, but
  this was isolated to the moodboard editor, not a global engine indicator.

### Gap: "never silently lose data"

The engine never silently *drops* data (failed rows stop at `failed` state
after 10 attempts and remain in the table), but the UI **silently hid** the
fact that data was pending or had failed. A user with 5 unsent messages and
3 failed listing publishes saw nothing. This violated the "surface sync
status: pending, failed, retrying — never silently lose data" requirement.

### What this change adds

- **`src/storage/syncStatus.ts`** — `SyncStatus` type
  (`idle | syncing | pending | failed | offline | conflict`), `SyncState`,
  `getSyncStatusLabel`, `shouldShowSyncIndicator`, a pure `deriveSyncStatus`
  reducer, and a `useSyncState` React hook that polls the outbox counts and
  subscribes to NetInfo so the badge reflects offline transitions
  immediately.
- **`src/components/SyncStatusBadge.tsx`** — a subtle, non-intrusive badge
  (icon + label, transparent canvas, semantic colours, pulsing dot for
  `syncing` with reduced-motion collapse, accessibility label). Renders only
  when the engine has something to communicate; `idle` is silence.

### Retry mechanism

- **Transport queue** (`offlineQueue.ts`): full-jitter exponential backoff,
  8 retries, then dead-letter queue. 429 `Retry-After` honoured. 401 kept
  (token may refresh). This is the most mature retry path.
- **Mutation outbox** (`syncEngine.pushOutbox`): network errors leave the row
  `pending`; after 10 attempts it is marked `failed` and stops auto-retrying.
  Drain re-fires on NetInfo reconnect and AppState foreground.
- **Chat outbox**: 5 attempts then `failed`.
- **Gap:** there is no user-initiated "retry failed syncs" button wired to
  re-queue `failed` outbox rows. The `OfflineBanner` retry callback is
  caller-supplied but no caller resets `failed` rows to `pending`. This is a
  follow-up: a `retryFailedOutbox()` helper in `outboxClient.ts` plus a
  badge tap action would close the loop.

---

## 3. Conflict resolution — audit findings

### Policy

The engine uses **server-authoritative last-write-wins with conflict
surfacing**, not pure LWW and not CRDTs:

1. **Pull** applies server deltas as upserts keyed by `id` + `server_rev`.
   Server rev always wins on pull — the local row is overwritten. This is
   LWW on the pull path.
2. **Push** sends `baseRev` (the rev the client based its edit on). The
   server responds with one of:
   - `applied` — accepted at a new rev; outbox row removed.
   - `superseded` — a newer server rev already exists; row marked
     `conflict`, drain stops, a subsequent pull reconciles (server wins).
   - `conflict` — base rev is stale; row marked `conflict`, `attempt_count`
     incremented, `last_error` recorded, drain stops.
   - `gone` — entity deleted server-side; local row soft-deleted, outbox
     row removed.
3. **Reconciliation**: a `conflict` row requires a pull before it can be
   re-evaluated. The drain does **not** re-push conflict rows (it only
   drains `pending`), so there is no infinite loop. The pull overwrites the
   local copy with the server's version — effectively LWW — but the
   conflict row remains in the outbox for the user to review.

### Are conflicts surfaced to the user?

**Partially.** `getOutboxConflicts()` returns conflict rows with
`entityType`, `entityId`, `operation`, `attemptCount`, `lastError` — but
before this change, **no UI called it**. The new `useSyncState` hook reads
`getOutboxConflicts()` and drives the badge to `conflict` status, so the
user now *sees* that a conflict exists. A dedicated conflict-resolution
surface (review diff, keep-mine / keep-server / merge) is **not** present
and is a follow-up.

### Idempotency keys

- **Generic outbox**: `operation_id` (UNIQUE column). `enqueueOperation`
  uses `INSERT OR REPLACE`, so re-enqueuing the same operation id replaces
  rather than duplicates. The server receives `operationId` in the push
  payload for its own dedup.
- **Chat outbox**: `clientMessageId` is the idempotency key. Replayed sends
  carry the original id so the server returns the already-created message
  or creates it now — no duplicate bubbles.
- **Transport queue** (`offlineQueue.ts`): dedup by
  `method:url:body` signature; the newer request replaces the older.

Idempotency is correctly implemented across all three layers.

### Clock skew

`useServerClock` (`src/hooks/useServerClock.ts`) maintains a server-time
offset for timestamp correctness, but the sync engine's rev-based
reconciliation does not depend on wall clocks — it uses monotonic server
revisions. Clock skew does not corrupt the rev ordering. Good.

---

## 4. Files created / changed in this hardening pass

| File | Action | Purpose |
|------|--------|---------|
| `src/storage/syncStatus.ts` | **Created** | `SyncStatus` / `SyncState` types, `getSyncStatusLabel`, `shouldShowSyncIndicator`, pure `deriveSyncStatus` reducer, `useSyncState` hook bridging the outbox to React. |
| `src/components/SyncStatusBadge.tsx` | **Created** | Subtle icon + label badge; pulsing dot for syncing (reduced-motion safe); semantic colours; accessibility label; renders only on non-idle states. |
| `SYNC_AUDIT.md` | **Created** | This document. |

No existing sync files were modified — the engine, outbox, and queues are
unchanged. The new code is purely additive (reads existing outbox queries,
adds a UI surface).

---

## 5. Recommendations (follow-up, not in this pass)

1. **Wire `SyncStatusBadge` into a global surface** (e.g. the home header or
   a persistent dock) so every screen reflects engine sync state, not just
   screens that opt in.
2. **Add `retryFailedOutbox()`** to `outboxClient.ts` that resets `failed`
   rows to `pending` and triggers a drain; wire it to a badge tap action so
   users can recover failed syncs without a full app restart.
3. **Build a conflict-resolution surface**: a sheet that lists
   `getOutboxConflicts()` rows with keep-mine / keep-server / merge-diff
   actions. Currently conflicts are detected and surfaced as a status, but
   the user cannot resolve them in-UI.
4. **Chaos tests**: add tests for flaky networks (drain mid-push), clock
   skew (rev ordering under skewed timestamps), and partial writes (a batch
   push where some rows `applied` and one `conflict` — verify the drain
   stops and remaining rows stay `pending`). The `__tests__/syncStatus.test`
   file covers the freshness helper; engine-level chaos tests are absent.
5. **Backoff for chat outbox**: `chatOutbox` retries on every drain without
   exponential backoff; a flaky connection could spin the drain rapidly.
   Align with `offlineQueue.ts`'s full-jitter backoff.
6. **Batch uploads via background tasks**: large media uploads (listing
   photos) are not currently routed through the outbox as background tasks.
   `expo-background-fetch` / `expo-task-manager` would let uploads complete
   after the app is backgrounded.

---

## 6. tsc result

`Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass; npx tsc --noEmit`
run from `frontend/` after changes. The new files
(`src/storage/syncStatus.ts`, `src/components/SyncStatusBadge.tsx`) compile
with **zero errors**. The only remaining errors are pre-existing and
unrelated to sync: 6 errors in `src/screens/LiveShoppingHomeScreen.tsx`
(`accessible` prop not on `CachedImageProps`). No `__tests__` errors are
introduced.
