# Frontend State-Truthfulness Review — Adversarial Verification

Scope: the frontend state-truthfulness campaign in `frontend/src/` — epoch guards, blank-on-error, payment truthfulness, moodboard outcomes, visual-search provenance/a11y, commerce surfaces, typography scale tiers, i18n completeness, and the seven new regression tests.

Method: read-only adversarial verification. Every claimed fix was traced through the owning hook → service boundary → render branch, and the async write paths were audited for stale-response windows, unguarded `finally`/`catch` writes, and last-writer-wins races. The seven new test files were run locally (`npx vitest run`): **49 tests, all green** — and read to confirm they control resolution order with deferred promises rather than asserting implementation trivia.

---

## Findings

### P1-1 — `useDiscoveryContent` has no request-identity guard; a stale load can overwrite a fresher one and mis-attribute module freshness

**File:** `frontend/src/hooks/discovery/useDiscoveryContent.ts:42-70`

```ts
const loadDiscoveryContent = useCallback(async () => {
  setIsDiscoveryLoading(true);
  setDiscoveryError(null);
  const [looksRes, ...] = await Promise.allSettled([...]);
  ...
  setStaleModules(stale);          // line 63 — wholesale overwrite
  if (fulfilled === 0) setDiscoveryError('Discovery content is temporarily unavailable.');
  setIsDiscoveryLoading(false);    // line 69 — fires for whichever load finishes FIRST
}, []);
```

There is no epoch, abort, or `cancelled` flag — the same protection the campaign added to `useDiscoverySearch` (searchEpochRef, `useDiscoverySearch.ts:119-125`) and `useForYouFeed` (feedEpochRef, `useForYouFeed.ts:147`) is absent here. `loadDiscoveryContent` is invoked by the mount effect (line 72-74) and exposed to `UnifiedDiscoveryScreen.handleRefresh` (`UnifiedDiscoveryScreen.tsx:501-505`), so a pull-to-refresh issued while the mount load — or a prior refresh — is still in flight produces two same-identity loads whose writes interleave:

- If load B succeeds for `looks` but load A's `looks` request rejected, and A settles last, line 63 re-writes `staleModules: ['looks']` — the surface then renders **"Looks couldn't load. Tap to retry."** over content that was just refreshed successfully (`DiscoveryFeedView.tsx:136-143`). A false failure claim.
- A stale fulfilled response writes its older `looks`/`posters`/`moodboards` arrays over newer data (lines 55-62).
- `setIsDiscoveryLoading(false)` runs for the first finisher, so the loading state can read false while a newer load is in flight, and a late `discoveryError` from a dead load can overwrite a clean result.

The fix is the same monotonic-epoch pattern used by the sibling hooks; the gap is a missed surface, not a different requirement.

**Also affected (same class, narrower window):** `LiveShoppingHomeScreen.load` (`LiveShoppingHomeScreen.tsx:196-212`) — `load()` has no epoch; mount + pull-to-refresh + `handleRetry` can overlap, last-writer-wins on `summary`/`error`, and `finally` clears `refreshing` while a newer load runs. Last-good rendering itself is correct (`showRefreshError` at lines 353-357 keeps the populated body), so this is the attribution/loading-flag half of the lie.

---

### P1-2 — `BackendDataContext.refreshListings` is unsequenced; overlapping refreshes can roll back the app-wide feed and lie about `isSyncing`/`lastError`

**File:** `frontend/src/context/BackendDataContext.tsx:64-122`

```ts
const refreshListings = React.useCallback(async () => {
  setIsSyncing(true);                 // 65
  const result = await fetchHomeFeed();
  if (result.listings.length > 0) { setListings(...); setCursor(...); setHasMore(...); setLastError(...); }
  else if (result.failed) { setSource('cache'); setLastError(...); }   // 87-102 — last-good preserved
  else { setListings([]); ... }                                       // 103-119 — genuine empty
  recordListingsSync(...);
  setIsSyncing(false);                // 121 — whichever refresh finishes first clears the flag
}, []);
```

`refreshListings` has multiple independent callers: the mount effect (line 160), pull-to-refresh on the discovery feed (`UnifiedDiscoveryScreen.tsx:504` via `feed.refreshListings`), and the checkout payment flow (`useCheckoutPaymentFlow.ts:324` post-settlement, `:388` post-cancel). Nothing serializes or epochs them:

- A slower, older `fetchHomeFeed` response can land after a newer refresh and overwrite `listings`/`cursor`/`hasMore` — the app-wide listing cache every commerce/discovery surface reads (`useDiscoveryFeed.ts:37`, `useVisualSearchFilters.ts:12`).
- A stale *failed* refresh resolving last sets `lastError` + `source: 'cache'` over a newer successful refresh — the "couldn't refresh — showing cached" banner (`useDiscoveryFeed.ts:78,101`) then mis-attributes freshness to content that IS fresh.
- `setIsSyncing(false)` at line 121 fires on the first finisher, so `isSyncing` reads false while a second refresh is still in flight (a loading-state lie that also drives `showLoadingSkeleton` gating at `useDiscoveryFeed.ts:77-79`).

The last-good-on-failure logic itself (lines 87-102) is correct and was verified — the defect is purely missing request ordering.

---

### P1-3 — "Clear filters" on visual search re-dispatches the PRE-clear filter payload (stale closure)

**File:** `frontend/src/screens/VisualSearchScreen.tsx:129-135`

```ts
const handleClearFilters = useCallback(() => {
  haptic.light();
  clearFields();
  if (imageUri) {
    setTimeout(() => void runSearch(), 0);
  }
}, [haptic, clearFields, imageUri, runSearch]);
```

`runSearch` is captured from the render at press time. `clearFields()` (`useVisualSearchFilters.ts:113-121`) only schedules the state updates; the `setTimeout` still invokes the OLD `runSearch`, whose `buildFilterPayload` (`useVisualSearchFilters.ts:52-69`) is a `useCallback` closed over the pre-clear `description`/`category`/`brand`/`minPrice`/`maxPrice`/`selectedColor`/`selectedStyle`. The re-search therefore dispatches the **cleared filter values** while the UI shows every filter field empty — the user sees "no filters applied" over results that are still narrowed by them, and `requestFiltersRef`-derived provenance keeps claiming a filtered retrieval.

The crop path avoided exactly this hazard via `regionRef` (`useVisualSearchResults.ts:36-38, 197-203`); the filter payload has no equivalent ref, so the comment's "runs after state flush" reasoning is wrong — the problem is the captured closure, not timing.

---

### P2-1 — Moodboard multi-delete / bring-to-front can leave phantom or wrongly-ordered items after partial server success

**File:** `frontend/src/components/moodboard/useMoodboardMutations.ts:198-245`

`handleDeleteSelected` (198-218) issues `Promise.all(ids.map(removeItemFromMoodboard))` and refetches the board ONLY when every delete resolves. On any rejection it returns `false` — but the deletes that already succeeded persisted server-side, and the local `moodboard` is never reconciled: the canvas keeps rendering items the server no longer has (tapping one hits a 404). `handleBringAllToFront` (221-245) has the same shape: sequential `reorderItem` calls partially apply; on failure there is no refetch, so local layer order ≠ server order. The history wrapper (`useMoodboardHistory.ts:210-220, 239-251`) correctly declines to record on `ok === false`, so stacks stay consistent — the lie is the unreconciled canvas. Failure should reconcile via `fetchMoodboardDetail` (or `reconcileBoard`) so the canvas returns to truth.

---

### P2-2 — Undo entries for transform/theme are recorded before the forward mutation's outcome is known

**File:** `frontend/src/components/moodboard/useMoodboardHistory.ts:172-185` (`handlePositionCommit`) and `:253-262` (`handleThemeChange`)

Unlike the delete/reorder wrappers — which record only after the mutation returns `ok` — these two record the inverse entry eagerly, then call fire-and-forget handlers (`useMoodboardMutations.ts:63-124, 247-286`) whose failures surface only via `setSyncStatus('error')`. A drag or theme change that never persisted still lands on the undo stack: history claims an applied edit that failed. Impact is mitigated (undo re-submits the restore op; the optimistic value stays on canvas alongside an honest sync-error banner), but it is inconsistent with the campaign's own "history advances only for persisted/durable edits" rule implemented two hooks below.

---

### P2-3 — Branded wallet buttons can render while regional payment capability is unverified (fail-open fallback)

**Files:** `frontend/src/utils/capabilityPolicy.ts:23-33`; `frontend/src/screens/CheckoutScreen.tsx:969-970`

`isPaymentMethodAllowed(null, methodType)` returns `fallback = true`. When the capability fetch fails, `useCheckoutHydration` leaves `checkoutCapabilities` null and shows `capabilityError` ("Could not verify payment capabilities") — yet `showApplePay`/`showGooglePay` still evaluate true on a supported device, so a branded tender CTA renders alongside the banner that says capability could not be verified. Bounded (device support is still required, and a real confirm failure surfaces an error state), but the affordance is a promise the surface cannot currently back. Failing closed (or suppressing the branded CTA when `capabilityError` is set) would be the truthful default.

---

### P2-4 — Same-identity overlapping refreshes are not serialized in `useForYouFeed`

**File:** `frontend/src/hooks/useForYouFeed.ts:230` (`refresh` → `loadForYouFeed(true)`)

`refresh()` has no in-flight guard; two pull-to-refresh triggers (or a refresh racing the mount load) share one epoch, so whichever response resolves LAST wins — an older same-identity snapshot can overwrite a fresher one, and the earlier `finally` can clear `isRefreshing` while the newer request is still in flight. Narrower than P1-2 because the identity is identical, but the same last-writer-wins window exists. `isRefreshing`/`isLoading` dedup or a request sequence would close it.

---

### P2-5 — `MAX_FONT_SCALE` tier grammar exists but is adopted almost nowhere; campaign files use ad-hoc literals

**File:** `frontend/src/theme/typography.v2.ts:289-293` defines `utility 1.3 / heading 1.5 / content 2` with an explicit "ad-hoc literals are forbidden in new code" rule (lines 270-288). Only **3 components** import `MAX_FONT_SCALE` (`CoOwnDistributionCalendar`, `HomeFeedHeader`, `AppSegmentControl`); **93 files** still pass numeric literals, including campaign-touched surfaces — `DiscoverySearchResultsView.tsx:162,173,302,312`, `ClosetGrid.tsx:86,99,118,138,159,194`, `CheckoutFooter.tsx` (extensive `={2}`), `ItemDetailItemDetails.tsx:73,78,96,111,138,165,276`. Values equal `content` (2×) so there is no immediate user-facing harm, but the "tiers enforced" claim is nominal: the named-tier policy is neither adopted in the changed code nor enforced.

---

### P3 — Minor honesty nits

- `ListingQA.tsx:54,61` — `Date.parse(q.createdAt) || Date.now()` fabricates "just now" when the API returns an unparseable/missing timestamp. Prefer omitting the time line when parse fails.
- `useMoodboardMutations.ts:66-76, 253-255` — optimistic position/theme stays on canvas after a failed submit with only `syncStatus: 'error'` as the signal; deliberate, but the canvas value is then a claim the server never accepted until the next reconcile.

---

## Verified clean (traced, not assumed)

| Surface | Evidence |
|---|---|
| `useDiscoverySearch` | Epoch bumped on every effect run (line 125) — deps cover query/scope/retry/`searchFilters` (line 227); writes guarded in `.then` (161), `.finally` (219); `loadMoreSearch` captures epoch (245) with guarded `.then`/`.catch`/`.finally` (252-298); failed-page vs initial-error channels distinct (97-101, 253-255); retry re-issues the exact failed page (354-357). |
| `useForYouFeed` | Epoch on identity change before the load effect (159-168); every write guarded (196, 203, 215); refresh-failure → `refreshError` with last-good page via `pageRef` (209-213); empty-feed failure → `error`. |
| `useVisualSearchResults` | AbortController + monotonic sequence (50-62, 97-100); stale drops at 118, 136; cache substitution strips API provenance — `visualMatching:false`, `'filter_only'`, `queryScope:undefined`, `facetCounts:null`, `'partial'` status (144-187); reset/image-change invalidate BEFORE clearing (210-221, 233-249); `queryScope` only from `retrievalMeta`. |
| `VisualSearchRegionCropper` | `accessibilityRole="adjustable"` + `increment`/`decrement` actions + `accessibilityValue` + `announceForAccessibility` (259-288, 406-434); whole-image frame → `null` region (309-311) so queryScope is never fabricated; per-image rect reset (132-143); min-region clamps produce contract-valid regions only. |
| Checkout payment flow | `payment_succeeded` only on confirmed settlement (689-696, 725-733, 969-980); `pending` → `payment_pending` + OrderDetail, never Success (736-741, 983-988); `unknown_outcome` locks interaction and offers status-check, not retry (223, 1151-1157, 1240-1300); attempt-id + mounted guards on every async write; app-resume reconciliation (1303-1346); platform-pay confirms the same order intent via the wallet rail — no card PaymentSheet (841-900). |
| Checkout UI | Wallet buttons render only on platform + device support + capability + `!isSubmitting` (CheckoutScreen 969-970, 646-649); `onWalletPay` is a required prop — no silent card fallback (CheckoutFooter 36-45, 138-175); pay label truthfully shows "Waiting for confirmation"/"Checking payment" for pending/unknown (checkoutViewModels 125-139); hydration preserves local selections on section failures (useCheckoutHydration 194-239) and `quoteId:null` keeps Pay disabled after a failed quote (284-298). |
| Moodboard outcomes | `SubmitBoardOpsOutcome` discriminates applied/queued/conflict/forbidden/failed (useMoodboardBoard 66-71); enqueue failure → `'failed'` (364-370); drain reports leftover rows as `'queued'`, terminal rejects as `'failed'` (257-269); history advances stacks only on applied/queued and reconciles + keeps the entry on failure (useMoodboardHistory 135-167). |
| Commerce surfaces | `paused` → "Paused" via `formatPositionStatusLabel` (portfolioViewModels 138-147; PortfolioScreen:215); "For sale" stat selects listings tab + scrolls to measured offset (MyProfileScreen 144-151; StorefrontTabs 145); reorder runs in a modal FlashList over the full list while the inline grid stays capped at 12 (ClosetGrid 63, 79-112, 176-182); condition evidence never labels an arbitrary photo as proof (ItemDetailItemDetails 82-101); blocked seller → composer replaced by honest note + defense-in-depth in `handleAsk`, Q&A stays readable (ListingQA 148, 224-254, 283-285). |
| LiveShoppingHomeScreen | Failed refresh keeps `summary` — `showRefreshError` inline note vs `showError` only when nothing loaded (353-357). |
| i18n | `checkout.postage.default.*` exists in the legacy flat map (`i18n/index.ts:183-187`); all namespaced keys used by changed components resolve in `en.json` (`myProfile.listings.*`, `visualSearch.frame.*`, `liveShopping.refreshFailed.*`, `liveReplay.playbackError.*`, `common.buttons.cancel`). No missing or orphaned keys found in the touched surface. |
| LiveStreamReplayScreen | Epoch guards both the primary fetch and the playback-retry refetch; retry refetches the signed URL rather than remounting the expired one (197-229, 260-279). |
| Recommendation controls | Hidden-item filtering scoped to the feed, not explicit search; persistence failure → honest retry copy; guest → "session only", no dead retry (verified via `discoveryFailureAttribution.test.tsx:622-711`). |

## Test-quality assessment

All seven new tests were executed (`npx vitest run` — 49 tests, all pass) and audited for tautology:

- `discoverySearchRequestIdentity`, `forYouFeedRefreshResilience`, `visualSearchResults`, `liveStreamReplayRace` use deferred promises to control resolution order and assert stale writes are dropped — they fail on the pre-fix code paths.
- `moodboardHistoryOutcome` injects the `submitBoardOps`/`reconcileBoard` boundary and asserts stack advancement only on `applied`/`queued` — behavioral, not implementation-mirroring.
- `pkg09CommerceSurfaces` mixes behavioral assertions (wallet tender rail, pending→OrderDetail, closet virtualization counts, blocked-seller composer removal) with a few source-regex assertions (FRESH-05/06) — the regex checks are brittle but not wrong.
- `discoveryFailureAttribution` exercises the real screen orchestration with hook mocks at the barrel boundary; persistence-failure and undo-window flows are genuinely user-visible assertions.

## Verdict

**PASS-WITH-FINDINGS**

The campaign's headline claims hold up under adversarial tracing: payment truthfulness (pending ≠ success, tender-correct wallet rails, capability-gated branded CTAs), the epoch guards in discovery search / For You / visual search / replay, last-good preservation, moodboard outcome discrimination, commerce-surface semantics, and crop/accessibility provenance are all genuinely implemented and covered by real, order-controlling regression tests.

Three stale-write paths remain that can still present untruthful UI: the discovery-content loader (`useDiscoveryContent`) and the app-wide listings refresh (`BackendDataContext`) lack the request ordering their siblings now have, and the visual-search "Clear filters" handler re-dispatches a stale filter payload. These are reachable in normal use (mount + pull-to-refresh, overlapping callers, clear-then-research) and are the same defect class the campaign set out to eliminate — they should be closed before this area is called done.
