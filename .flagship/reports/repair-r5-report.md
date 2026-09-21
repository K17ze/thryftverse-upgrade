# Repair Round 5 — Frontend State-Truthfulness Findings

Scope: close-out of every finding in `.flagship/reports/review-frontend.md` (PASS-WITH-FINDINGS). Verification was done against current working-tree code — a previous pass had already landed the substantive repairs; this pass verified each finding line-by-line, completed the remaining MAX_FONT_SCALE migration, and added a dedicated regression suite.

## Verification verdicts (current code)

| Finding | Status | Evidence |
|---|---|---|
| P1-1 `useDiscoveryContent` epoch guard | Already landed | `useDiscoveryContent.ts:48-83` — `loadEpochRef` bumped per load; single post-`allSettled` epoch check drops every write (module arrays, `staleModules`, `discoveryError`, `isDiscoveryLoading`) for a dead epoch. |
| P1-2 `refreshListings` sequencing | Already landed | `BackendDataContext.tsx:74-154` — `refreshEpochRef` latest-wins guard on all state writes; `refreshInFlightRef` count keeps `isSyncing` until every pending refresh settles; stale failure still records diagnostics but cannot set `source:'cache'`/`lastError` over fresh content. |
| P1-3 clear-filters stale closure | Already landed | `useVisualSearchFilters.ts:44-81,113-131,178-187` — `filtersRef` is the payload source of truth; setters and `clearFields` write it synchronously; `buildFilterPayload`/`filterCachedListings` read the ref. `VisualSearchScreen.tsx:129-140` — `handleClearFilters` calls `void runSearch()` directly; no deferred stale dispatch. |
| P2 moodboard partial-failure reconcile | Already landed | `useMoodboardMutations.ts:163-176` (`reconcileLocalBoard` via `fetchMoodboardDetail`), called from the catch paths of `handleDeleteSelected` (197) and `handleBringAllToFront` (227). |
| P2 history entries only on applied/queued | Already landed | `useMoodboardHistory.ts:172-194` (`handlePositionCommit`) and `262-274` (`handleThemeChange`) — inverse recorded only when the awaited forward mutation returns `'applied'`/`'queued'`; both mutations now return `SubmitBoardOpsOutcome` (`useMoodboardMutations.ts:57-89, 236-254`). |
| P2-3 capability fail-closed | Already landed | `capabilityPolicy.ts:35-45` — `fallback` parameter; `CheckoutScreen.tsx:976-977` — `isPaymentMethodAllowed(checkoutCapabilities, 'apple_pay'/'google_pay', false)`. |
| P2-4 For You same-identity serialization | Already landed | `useForYouFeed.ts:155,189-190,226-237` — `inFlightEpochRef` dedups a second load for the same identity; the slot is released only by its holder before the epoch check. |
| P2 `LiveShoppingHomeScreen.load` epoch | Already landed | `LiveShoppingHomeScreen.tsx:202-225` — `loadEpochRef` guards success, catch and finally writes. |
| P3 `ListingQA` fabricated "just now" | Already landed | `ListingQA.tsx:49-53` (`parseCreatedAt` returns null on missing/unparseable), `318-320` and `331-333` omit the time line when null. |
| P2-5 MAX_FONT_SCALE adoption | **Completed this pass** | See below. |

## Changes made this pass

### MAX_FONT_SCALE migration (remaining campaign-touched files)

All other campaign-touched files were already on named tiers; three files still used `={2}` literals:

- `frontend/src/components/myprofile/ClosetGrid.tsx` — 6 literals → `reorderTitle` → `heading` (modal surface title); `gridHeaderAction` ×2, `viewAllFooterText`, `listingsEmptyImportText` → `utility` (compact chrome/action labels); `listingsEmptyBody` → `content` (reflowable empty-state copy). Added `MAX_FONT_SCALE` to the typography.v2 import.
- `frontend/src/screens/UnifiedDiscoveryScreen.tsx` — 3 literals → `utility` (feedback-notice strip text + Retry/Undo actions, all `numberOfLines={1}` chrome). Added import.
- `frontend/src/screens/CheckoutScreen.tsx` — 1 literal → `content` (terms text is readable legal copy). Added import.

Verified: no `maxFontSizeMultiplier={<number>}` remains in any campaign-touched (git-modified) frontend file. Files outside the campaign diff (OrderReceiptScreen, SignUpScreen, etc.) intentionally untouched per scope.

### New regression suite

`frontend/src/__tests__/stateTruthfulnessRepairs.test.tsx` — 23 tests, all controlling resolution order with deferred promises or injectable boundary fakes. Every test fails on the pre-repair code:

- **P1-1** (3 tests): stale load settling last cannot overwrite fresher module data; a stale rejection cannot re-mark a just-refreshed module in `staleModules`; `isDiscoveryLoading` holds until the *latest* load settles.
- **P1-2** (2 tests): overlapping `refreshListings` — a stale `failed` result resolving last cannot set `source:'cache'`/`lastError` over fresh listings; a stale success cannot roll back a newer snapshot; `isSyncing` tracks the in-flight count.
- **P1-3** (2 tests): a `buildFilterPayload` captured pre-clear produces the cleared payload after `clearFields()`; `handleClearFilters` source no longer dispatches via `setTimeout`.
- **P2 moodboard reconcile** (3 tests): `handleDeleteSelected`/`handleBringAllToFront` refetch and apply the canonical board on partial failure; success path unchanged.
- **P2 history gating** (3 tests): failed transform/theme commits record no undo entry; `queued`/`applied` do.
- **P2-3** (3 tests): `isPaymentMethodAllowed(null, branded, false)` → false; card rail keeps default fail-open; CheckoutScreen passes `false` for both branded CTAs.
- **P2-4** (2 tests): a refresh during the mount load issues no second request; two overlapping refreshes settle as one.
- **P2 live home epoch** (2 tests): stale summary/flag writes from an older load are dropped.
- **P3 ListingQA** (2 tests): unparseable/empty timestamps render no time line (no fabricated "just now"); parseable timestamps still render relative time.
- **P2-5** (1 test): no numeric `maxFontSizeMultiplier` literal in any campaign-touched file.

## Validation

- `npx tsc --noEmit` — clean, 0 errors.
- `npx vitest run src/__tests__/stateTruthfulnessRepairs.test.tsx` — 23/23 pass.
- `npx vitest run` on the eight existing campaign suites (discoverySearchRequestIdentity, forYouFeedRefreshResilience, liveStreamReplayRace, moodboardHistoryOutcome, pkg09CommerceSurfaces, discoveryFailureAttribution, visualSearchResults, backendDataPagination) — 57/57 pass.

## Not committed

No commits made; `.flagship` canonical files untouched.
