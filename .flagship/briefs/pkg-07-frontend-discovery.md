# PKG-07 — Frontend discovery/search: request identity, pagination failure, stale attribution, preference persistence

Repo root: C:/Users/User/Desktop/thryftverse-upgrade (HEAD 76c0733). Audit: ThryftVerse-Post-Upgrade-Audit-2026-09-20.md Appendix B.

## Findings to close

### FRESH-02 (High) — search request race
`frontend/src/hooks/discovery/useDiscoverySearch.ts:220-265` appends page responses and sets paging state with NO epoch/cancel guard. QueryA's slow page-2 can append into QueryB's results. Fix: an epoch/request-identity token incremented on every new query/filter set; every async write checks it (or AbortController); late responses discarded. Cover page fetches AND initial fetches AND filter changes mid-load.

### FRESH-03 (Med-High) — invisible pagination failure
Same hook sets `searchError`; `components/discovery/DiscoverySearchResultsView.tsx:200-209` only shows it for zero units — a failed page-2 on a populated list is invisible. Fix: populated branch gets a failed-page footer with inline retry that re-issues the exact failed page; error state must distinguish initial-load failure from append failure.

### FRESH-08 (Med) — editorial hero noninteractive
`components/discovery/DiscoveryFeedView.tsx:204-225` renders editorial title/byline/read-time inside a non-interactive View. Fix: wire a real destination (the editorial/collection/article route — find what the data model links to; if the backend item carries a target, navigate to it). If no destination exists in the data, do not render fake affordances — either add the navigation with the real link or downgrade the presentation so it doesn't look tappable. Follow the audit's anti-AI policy: no decorative chrome without function.

### FRESH-10 (Med) — stale/missing failure attribution
`hooks/discovery/useDiscoveryContent.ts:29-53` tracks module failures but DiscoveryFeedView renders a generic note; UnifiedDiscovery doesn't forward listing `lastError` to the populated feed surface. Fix: forward per-module error identity to the view; failed module renders a restrained inline retry state at its position — never silently absent, never a generic error over healthy modules.

### S20-05 (Med) — recommendation controls hide failed persistence
`screens/UnifiedDiscoveryScreen.tsx:189-206` hides "Not interested" immediately and ignores the result; "Show less" only acts if persisted. `services/recommendationFeedbackApi.ts:116-131,143-169` returns persisted:false on failure/anonymous. Accessibility hint (:411) promises "stops recommending it" unconditionally. `hiddenListingIds` also filters SEARCH results (:239-245) — suppressing a recommendation silently removes an explicit search hit. Fix:
- Distinguish states: locally-hidden / persisted / failed-with-retry. Brief undo affordance after hide.
- Scope: NOT-interested affects recommendations only — do NOT filter explicit search results by hiddenListingIds (search intent beats preference); verify with a test.
- Accessibility hint must describe actual behavior.

## File ownership
- EXCLUSIVE: `frontend/src/hooks/discovery/useDiscoverySearch.ts`, `frontend/src/hooks/discovery/useDiscoveryContent.ts`, `frontend/src/components/discovery/DiscoverySearchResultsView.tsx`, `frontend/src/components/discovery/DiscoveryFeedView.tsx`, `frontend/src/screens/UnifiedDiscoveryScreen.tsx`, `frontend/src/services/recommendationFeedbackApi.ts`, NEW test files under `frontend/src/__tests__/`.
- Read-only: everything else (existing tests showing patterns: backendDataPagination.test.tsx, moodboardHistory.test.ts).

## Constraints
- React Native/Expo codebase — match existing hooks/state patterns (check how sibling hooks do epoch/abort; reuse existing primitives before inventing).
- Follow AGENTS.md anti-AI design policy: restrained, honest states; no new decorative wrappers.
- Tests must FAIL on old code: race test (deferred responses resolving out of order for two query identities), failed-page footer retry, hidden-item not filtering search, persistence-failure retry surface.
- Verify: `npm run typecheck` (frontend) with no new errors; focused jest/vitest runs for your tests. Frontend has a heavy suite — run only your test files. No commit.

## Report
`.flagship/reports/pkg-07-report.md`. Return: status, files changed, one-line test summary.
