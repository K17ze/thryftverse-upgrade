# Repair R2 — Leaf Repair Report

Scope: FRESH-02 blank-on-error residuals (Task A), dead styles (Task B), docs/config smalls (Task C).
Status: **complete** — typecheck clean, all focused + adjacent tests green. Not committed.

---

## Task A — Blank-on-error residuals (FRESH-02)

### A1. `useForYouFeed` — `frontend/src/hooks/useForYouFeed.ts`

**Defect:** the catch path of `loadForYouFeed` called `setPage(null)` unconditionally, so a failed
pull-to-refresh on a populated For You feed blanked all personalised content.

**Fix (follows the epoch-guard + inline-error convention in `useDiscoverySearch.ts`):**

- New `refreshError: string | null` channel on `ForYouFeedState` — the distinct inline-error
  channel for refresh failures on a populated feed. `error` remains the initial-load /
  no-content channel (screens already gate their error surfaces on `listings.length === 0`).
- `feedEpochRef`: monotonic epoch bumped by an identity-reset effect keyed on `(userId, surface)`.
  Every async write (success, error, finally) is discarded once the epoch has moved on — a slow
  response from a previous identity can no longer clobber the new identity's page or pending flags.
- The identity-reset effect is the **only** place the cached page is cleared (plus the signed-out
  early return). It also releases `isLoading`/`isRefreshing` since a dead epoch's `finally` is guarded.
- Error routing: refresh failure with a cached page → `refreshError` (last-good content stays);
  refresh failure with nothing cached, or initial-load failure → `error` (honest no-content state).
  Both channels clear on success.
- `pageRef` (effect-synced) lets the stable `useCallback` read the committed page for the
  error-channel decision.

**Consumers:** `HomeScreen` (`forYouHasError` already requires `listings.length === 0`),
`useDiscoveryFeed`, `DiscoverScene`, `useDynamicAlgorithmSignals` — additive field, no breakage.
`refreshError` is exposed for surfaces to render an inline retry note; wiring consumers to it was
left to the surface owners (several are owned by the parallel commerce-frontend agent).

### A2. `BackendDataContext.refreshListings` — `frontend/src/context/BackendDataContext.tsx`

**Defect:** any empty result — including a failed request — hit `setListings([])`, blanking the
app-wide listing cache.

**Complication found:** `fetchHomeFeed` sets `error: 'Feed returned zero listings.'` even on a
*successful* empty response (`frontend/src/services/feedApi.ts:103`), so `result.error` alone
cannot distinguish failure from a genuinely empty feed.

**Fix:**

- `HomeFeedResult` gained a `failed?: boolean` discriminant, set only in the catch path
  (`feedApi.ts`) — additive, no consumer breakage.
- `refreshListings` branch order: non-empty success → `ENABLE_RUNTIME_MOCKS` fixtures →
  `result.failed` (keep last-good) → genuine empty success (clears, truthful).
- On failure: listings/cursor/hasMore untouched (they belong to the page still on screen),
  `lastError` set (existing channel — screens already render `SyncRetryBanner` off it), and
  `source` degrades to `'cache'` when last-good content is being served. The `'cache'` union
  member already existed and `getBackendSyncStatus` already renders it as cached/offline —
  no new context fields needed.
- `listingsRef` (effect-synced) provides last-good detection inside the stable `useCallback`
  without re-creating it (which would re-fire the mount-load effect).
- Updated the now-stale "never set in this build" comment in
  `frontend/src/components/home/HomeFeedHeader.tsx`.

**Out of scope, noted:** `loadMoreListings` still clears cursor/hasMore on an empty *failed* page
(`result.failed` is now available if a future pass wants retryable pagination).

---

## Task B — Dead styles

`frontend/src/components/discovery/unifiedDiscoveryStyles.ts` — removed `staleNote` /
`staleNoteText` keys (the "Stale-module note (F21)" strip). Verified via repo-wide grep:
zero references remained outside the definitions; zero after the edit.

---

## Task C — Docs/config smalls

- **`README.md` (~line 284):** `worker:start` → `worker:start:dev`. Verified in
  `backend/api/package.json`: `worker:start` runs `node dist/workers/index.js` (compiled build —
  needs `npm run build` first), `worker:start:dev` runs `tsx src/workers/index.ts` (source — the
  correct local-dev command). Added a one-line note clarifying the distinction.
- **`.github/workflows/staging-deploy.yml`:** `eas update --channel preview` → `--channel staging`.
  Verified `frontend/eas.json`: the `preview` build profile binds `"channel": "staging"`, so
  updates published to a `preview` channel never reached preview-profile installs. Step/job labels
  updated to "staging channel" / "preview profile → staging channel" for accuracy. The
  `--profile preview` build step is correct and unchanged.
- **Release-gating workflows (report only, untouched):** `release-train.yml`, `build-and-deploy.yml`,
  `ota-staged-rollout.yml`, `ota-rollback.yml` use `staging`/`canary`/`production` channels —
  no `preview` channel references; consistent with `eas.json`. Note: `canary` is used by
  `build-and-deploy.yml`/`ota-*.yml` but is not a build-profile channel in `eas.json` — valid for
  `eas update`, flagged for awareness only.

---

## Tests added (FAIL on pre-fix behaviour)

- **`frontend/src/__tests__/forYouFeedRefreshResilience.test.tsx`** (new, 4 tests):
  refresh failure keeps last-good page + `refreshError`/`error` channel separation; retry clears
  `refreshError`; stale response dropped after user-identity change (epoch guard); no-content
  refresh failure still uses `error`.
- **`frontend/src/__tests__/backendDataPagination.test.tsx`** (+4 tests, new describe block):
  failed refresh keeps listings + `lastError` + `source: 'cache'` + preserved `hasMore`;
  recovery to `source: 'api'` on next success; no-cache failure reports `source: 'api'`;
  genuinely empty success still clears.

## Verification

- `cd frontend && npx tsc --noEmit` — **clean**.
- `npx vitest run forYouFeedRefreshResilience backendDataPagination` — **12/12 pass**.
- Adjacent suites `discoverySurfaces`, `discoveryFailureAttribution`, `syncStatus`,
  `discoverySearchRequestIdentity` — **35/35 pass**.

## Files touched

| File | Change |
|---|---|
| `frontend/src/hooks/useForYouFeed.ts` | epoch guard, `refreshError` channel, identity-scoped clearing |
| `frontend/src/context/BackendDataContext.tsx` | keep last-good on `result.failed`, `source:'cache'` freshness signal |
| `frontend/src/services/feedApi.ts` | `HomeFeedResult.failed` discriminant |
| `frontend/src/components/home/HomeFeedHeader.tsx` | comment accuracy only |
| `frontend/src/components/discovery/unifiedDiscoveryStyles.ts` | removed `staleNote`/`staleNoteText` |
| `frontend/src/__tests__/forYouFeedRefreshResilience.test.tsx` | new regression suite |
| `frontend/src/__tests__/backendDataPagination.test.tsx` | +4 regression tests |
| `README.md` | `worker:start` → `worker:start:dev` |
| `.github/workflows/staging-deploy.yml` | `--channel preview` → `--channel staging` |

Nothing committed. `.flagship` canonical files untouched. Release-gating workflows untouched.
