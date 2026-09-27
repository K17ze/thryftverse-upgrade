# PKG-07 — Frontend discovery/search — Report

Status: COMPLETE. All five findings closed; typecheck clean; focused tests green.

## Findings

### FRESH-02 — search request race (High) — CLOSED
`useDiscoverySearch.ts` now owns a monotonic `searchEpochRef` bumped on every
effect run (new query text, filter-set identity, scope switch, retry). The
debounced initial fetch captures the epoch alongside its `cancelled` flag;
`loadMoreSearch` captures the epoch that issued the page request. Every async
write (results, paging, hasMore, fallback flag, error, loading flags) is
guarded — a slow page-2 from query A can never append into query B or clobber
its paging state. Regression test resolves deferred responses out of order
across two query identities and across a filter edit mid-page-load.

### FRESH-03 — invisible pagination failure (Med-High) — CLOSED
Append failures are a distinct `searchPageError` channel (never the
full-screen `searchError`). `DiscoverySearchResultsView` renders a
bottom-anchored failed-page strip (hairline edge, meta copy, brand Retry —
same grammar as the active-filters row) whenever `pageError` is set on a
populated list. `retrySearchPage()` re-issues the exact failed page because
`searchPage` only advances on successful appends — verified by test asserting
the retried request carries `page: 2` again.

### FRESH-08 — editorial hero noninteractive (Med) — CLOSED
`DiscoveryFeedView` accepts `onEditorialPress`; `UnifiedDiscoveryScreen`
navigates to the `Galleria` route (the surface that owns `GalleriaEditorial`
— the model carries no per-item deep link, so the home surface is the honest
destination). Without a handler the hero renders as a plain `View` — no fake
affordance. Both branches are tested.

### FRESH-10 — stale/missing failure attribution (Med) — CLOSED
`useDiscoveryContent` exposes `staleModules` as typed `DiscoveryModuleId[]`
(looks/posters/moodboards/collections/editorials). The feed view renders a
restrained inline retry row at each failed module's own position: editorials
at the hero slot, collections under its rail (cached cards stay visible),
looks/posters/moodboards + the listings-sync `lastError` (new `listingsError`
prop, forwarded from `useDiscoveryFeed`) at the feed head. The generic
"Some sections couldn't refresh" note is gone. Rows are suppressed while
offline (the OfflineBanner owns that state). Cached module content is
preserved on refresh failure — the allSettled fan-out only writes fulfilled
results.

### S20-05 — recommendation controls hide failed persistence (Med) — CLOSED
- `recommendationFeedbackApi.ts`: `FeedControlResult.failure` distinguishes
  `'anonymous'` (guest — retry can never succeed) from `'unavailable'`
  (retryable). New `undoItemNotInterested` writes a compensating item-scope
  `usual` intent mutation.
- `UnifiedDiscoveryScreen`: "Not interested" applies the local hide at once
  and queues the durable write behind a 4 s undo window — Undo inside the
  window is a true reversal (write never fires); Undo during an in-flight
  write triggers the compensating mutation. A single bottom notice strip
  reports honest states: queued / saving / saved / session-only (guest, no
  dead retry) / failed (Retry re-issues the same writes). Queued hides flush
  on unmount. "Show less" surfaces the same failed/session states instead of
  silently no-op'ing.
- Search-scope fix: `hiddenListingIds` filters the personalised feed only —
  explicit search results are never suppressed (search intent beats
  preference), verified by test.
- Accessibility hint now describes real behavior ("tries to save the
  preference; you can undo or retry") instead of promising unconditional
  suppression.

## Files changed
- `frontend/src/hooks/discovery/useDiscoverySearch.ts` — epoch ref, `searchPageError`, `retrySearchPage`, guarded async writes.
- `frontend/src/hooks/discovery/useDiscoveryContent.ts` — `DiscoveryModuleId` typed stale-module identity.
- `frontend/src/components/discovery/DiscoverySearchResultsView.tsx` — `pageError`/`onRetryPage` props + failed-page strip; people-scope branch restructured.
- `frontend/src/components/discovery/DiscoveryFeedView.tsx` — `staleModules` typed ids, `listingsError`, `onEditorialPress`, per-module retry rows, interactive/non-interactive hero branches.
- `frontend/src/screens/UnifiedDiscoveryScreen.tsx` — feedback-notice state machine, undo window + unmount flush, `hiddenListingIds` scoped to feed only, `listingsError`/`pageError` wiring, editorial navigation, honest a11y hint.
- `frontend/src/services/recommendationFeedbackApi.ts` — `failure` taxonomy on `FeedControlResult`, `undoItemNotInterested`.
- `frontend/src/__tests__/discoverySearchRequestIdentity.test.tsx` (new) — race + failed-page regressions.
- `frontend/src/__tests__/discoveryFailureAttribution.test.tsx` (new) — view-level retry surfaces + screen-level S20-05 state machine.

## Verification
- `cd frontend && npx tsc --noEmit` — exit 0, no output (clean).
- `npx vitest run src/__tests__/discoverySearchRequestIdentity.test.tsx src/__tests__/discoveryFailureAttribution.test.tsx` — 17/17 pass.
- Tests fail on pre-fix code by construction: they exercise APIs that did not
  exist (`searchPageError`, `retrySearchPage`, `pageError`, `onRetryPage`,
  `onEditorialPress`, `undoItemNotInterested`, module-id retry rows, the
  notice strip) and assert behaviors the old code violated (stale page
  appends, hidden items filtered from search results, silent persistence
  failure).

## Notes / residuals
- Out-of-scope observation (read-only for pkg-07, likely owned by a sibling
  package): `useForYouFeed.loadForYouFeed` does `setPage(null)` on refresh
  error and `BackendDataContext.refreshListings` does `setListings([])` on a
  failed refresh — both blank cached listing content on refresh failure.
  Within pkg-07's owned files the module-content path preserves cached data
  and attributes staleness inline; the listing-cache blanking may need its
  own fix wherever those hooks are owned.
- `unifiedDiscoveryStyles.ts` still defines now-unused `staleNote`/
  `staleNoteText` keys — that file is outside pkg-07 ownership; left intact.
- No commits made.
