# PKG-08 — Visual search reset/provenance/crop-a11y + moodboard outcome semantics + replay identity guard

Repo root: C:/Users/User/Desktop/thryftverse-upgrade (HEAD 76c0733). Audit: ThryftVerse-Post-Upgrade-Audit-2026-09-20.md Appendix B (S20-01..04, S20-07).

## Findings to close

### S20-01 (High) — reset doesn't invalidate pending search
`frontend/src/hooks/visualsearch/useVisualSearchResults.ts:84-90` assigns request sequence + abort controller to new searches; completion checks sequence (:125-126). `resetResults` (:210-217) clears state WITHOUT aborting or advancing the sequence. Image removal sets imageUri null; image-change effect (:194-205) doesn't run a replacement for null. A response from the removed image passes the unchanged sequence check and repopulates results after reset.
Fix: reset must abort the in-flight controller AND advance the epoch; same for identity change and unmount. Removing the image must leave status idle with no stale results/facets/scope.

### S20-02 (High) — cached fallback inherits false provenance
`useVisualSearchResults.ts:131-136` replaces empty/fallback API results with filter-matched cached listings, but :159-166 takes `visualMatching`, `similarityMethod`, `retrievalMeta.queryScope` from the API — so filter-only cache results get described as visual/region matches. Comment at :146-149 claiming honest empty is contradicted.
Fix: provenance travels WITH the displayed collection — cached/filter-only fallback gets explicit filter-only provenance (no visual/similarity/scope claims, no API facet counts attached to a different candidate set), OR preserve the real empty result and offer fallback as a clearly separate exploration. Choose whichever matches the screen's existing UX contract; honesty is the requirement.

### S20-03 (High a11y) — adjustable crop handles without actions
`components/visualsearch/VisualSearchRegionCropper.tsx:335-353` gives frame + 4 corner handles `accessibilityRole="adjustable"` but only PanResponder handlers — no `accessibilityActions`/`onAccessibilityAction`. Per RN docs: adjustable components must implement `increment`/`decrement` standard actions (VoiceOver swipe up/down; TalkBack volume keys / adjust gesture). Fix: implement onAccessibilityAction on each handle — increment/decrement moves/resizes the region by a sensible step, respecting min-size and letterboxed image bounds; announce changed bounds via accessibilityValue/announcement. Verify the crop stays operable end-to-end (move + resize + reset + confirm/cancel) without touch.

### S20-04 (High) — moodboard history advances on non-persisted inverses
`components/moodboard/useMoodboardHistory.ts:105-119` optimistic undo/redo awaits submitBoardOps; :124-145 moves the stack entry. No-local-DB branch `useMoodboardBoard.ts:333-350` catches network failures / breaks on conflict-forbidden but resolves without an outcome — history treats resolution as success; multi-op inverse may persist only a prefix while the full inverse displays.
Fix: submitBoardOps must return a discriminated outcome — applied | queued | conflict | forbidden | failed — and history must only advance on applied/queued; failed/conflict must reconcile actual board state (re-fetch or rollback the optimistic inverse), surface honest sync state, and keep the command recoverable. Concurrent normal edit during an inverse needs an explicit ordering policy (serialize on board version or reject conflicting edit — pick the simpler sound option).

### S20-07 (Med) — replay load lacks stale-response guard
`screens/LiveStreamReplayScreen.tsx:193-217` fetches by sessionId and applies response without cancellation/epoch; the secondary rail (:222-236) does have cancellation. Signed URL expiry gets remount of the same expired URL; playback retry only increments playbackAttempt (:244-249). Fix: epoch/cancel guard on the primary fetch; on playback failure/expired-URL response, refetch a fresh recording URL through the existing API path instead of remounting the expired one.

## File ownership
- EXCLUSIVE: `frontend/src/hooks/visualsearch/useVisualSearchResults.ts`, `frontend/src/components/visualsearch/VisualSearchRegionCropper.tsx`, `frontend/src/components/moodboard/useMoodboardHistory.ts`, `frontend/src/components/moodboard/useMoodboardBoard.ts`, `frontend/src/screens/LiveStreamReplayScreen.tsx`, any closely-coupled helpers in those same directories that only these files consume, NEW test files under `frontend/src/__tests__/`.
- If `useVisualSearchScreen`/parent screens need prop changes, keep the hook's public interface stable or update the sole caller — check call sites before changing signatures.

## Constraints
- RN/Expo patterns; match existing code. accessibilityActions API per reactnative.dev/docs/accessibility (standard actions increment/decrement; custom actions need name+label).
- AGENTS.md anti-AI policy: honest states, no decorative fixes.
- Tests that FAIL on old code: slow-request→reset→late-resolve stays idle; visual=true+zero results+cache → filter-only provenance; failed op-2 of multi-op undo → stack doesn't advance + state reconciled; replay session-change race → correct session's recording.
- `npm run typecheck` clean for your files; run only your test files. No commit.

## Report
`.flagship/reports/pkg-08-report.md`. Return: status, files changed, one-line test summary.
