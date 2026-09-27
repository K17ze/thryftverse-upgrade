# PKG-08 — Visual search provenance/reset/crop-a11y + moodboard outcomes + replay guard — Report

Status: COMPLETE. All five findings closed; `npm run typecheck` clean;
focused vitest files green (10/10).

## Findings

### S20-01 — reset doesn't invalidate pending search (High) — CLOSED
`useVisualSearchResults.ts` now owns `invalidatePendingSearch()` — aborts
the in-flight `AbortController` AND advances `requestSequenceRef`, so even
a response that already resolved past the network layer can never pass the
sequence check. It runs on all three moments the pending request's subject
stops being valid: `resetResults()`, image removal (`imageUri → null`
routes through `resetResults`, leaving status idle with no stale
results/facets/scope), image replacement (`A → B` now invalidates
unconditionally before the region clear — the re-run is a fresh sequence,
not a continuation), and unmount (effect cleanup calls it instead of a
bare abort).

### S20-02 — cached fallback inherits false provenance (High) — CLOSED
Provenance now travels WITH the displayed collection. When the client-side
cache supplies the visible set (`itemsFromCache`), the hook publishes
explicit filter-only provenance: `visualMatching=false`,
`similarityMethod='filter_only'`, `queryScope=undefined`, `facetCounts=null`
(API facet counts describe a different candidate set), an honest
filter-match note, and status `'partial'` — the bannered "some results
from your saved data" state rather than a silent swap. API-sourced results
keep their real visual/region claims untouched.

### S20-03 — adjustable crop handles without actions (High a11y) — CLOSED
`VisualSearchRegionCropper.tsx` implements the standard `increment`/
`decrement` `accessibilityActions` on the frame and all four corner
handles. Frame adjust nudges the region by a 5%-of-fitted-edge step with
the same bounds clamping as the pan handler; corner-handle adjust
grows/shrinks from that corner with the opposite corner anchored via the
same `resizeFromCorner` helper (min-size and letterboxed-image bounds
respected). Resulting bounds are exposed through `accessibilityValue` and
announced via `AccessibilityInfo.announceForAccessibility` using the new
`visualSearch.frame.value` i18n key (added to `en.json`). Reset/confirm/
cancel remain accessible buttons, so the crop is operable end-to-end
without touch.

### S20-04 — moodboard history advances on non-persisted inverses (High) — CLOSED
`submitBoardOps` (and `flushOutbox`, exposed as `retrySync`) now return a
discriminated `SubmitBoardOpsOutcome`: `applied | queued | conflict |
forbidden | failed`. `applied` = every op persisted; `queued` = durable
outbox intent (offline, concurrent drain, or leftover pending rows);
`conflict`/`forbidden`/`failed` = the batch did not fully persist —
possibly only a prefix. `useMoodboardHistory` advances the undo/redo stack
ONLY on `applied`/`queued`; on any other outcome it calls
`reconcileBoard()` to re-fetch canonical board state (the optimistic
inverse never keeps claiming a state the server rejected) and keeps the
entry on its stack so the command stays recoverable. Ordering policy:
submissions serialize on the server board revision — a concurrent edit
that lands first surfaces as `conflict` and reconciles, rather than a
client-side lock that could deadlock the editor.

### S20-07 — replay load lacks stale-response guard (Med) — CLOSED
`LiveStreamReplayScreen.tsx` guards the primary fetch with a monotonic
`loadEpochRef`: every load captures its epoch, only the newest request may
write state, and the effect cleanup bumps it so unmounted/superseded
responses are dropped. Playback retry no longer remounts the same expired
signed URL — it refetches the replay payload through `fetchSessionReplay`
for a fresh `recordingUrl` (or the honest processing/not-found state when
the recording is gone), then remounts the player stage.

## Files changed
- `frontend/src/hooks/visualsearch/useVisualSearchResults.ts`
- `frontend/src/components/visualsearch/VisualSearchRegionCropper.tsx`
- `frontend/src/components/moodboard/useMoodboardBoard.ts`
- `frontend/src/components/moodboard/useMoodboardHistory.ts`
- `frontend/src/screens/LiveStreamReplayScreen.tsx`
- `frontend/src/i18n/locales/en.json` (`visualSearch.frame.value` key)

## Tests (all FAIL on pre-fix code)
- `frontend/src/__tests__/visualSearchResults.test.tsx` — 4 tests: slow
  request → reset → late resolve stays idle; image removal invalidates the
  pending search and clears provenance; visual=true + zero results + cache
  → filter-only provenance (`partial`, no facet counts, no region scope);
  API results keep real provenance.
- `frontend/src/__tests__/moodboardHistoryOutcome.test.tsx` — 4 tests:
  failed multi-op undo → stack doesn't advance + board reconciled +
  command recoverable; conflicted undo keeps entry and reconciles;
  applied/queued inverses advance without reconcile.
- `frontend/src/__tests__/liveStreamReplayRace.test.tsx` — 2 tests:
  session-change race → the newer session's recording wins and the late
  stale response is dropped; playback retry refetches a fresh URL instead
  of remounting the expired one.

## Verification
- `cd frontend && npm run typecheck` — clean (exit 0).
- `npx vitest run src/__tests__/visualSearchResults.test.tsx
  src/__tests__/moodboardHistoryOutcome.test.tsx
  src/__tests__/liveStreamReplayRace.test.tsx` — 10/10 pass.

## Notes
- `submitBoardOps` callers besides history (`useMoodboardMutations`
  keep-local path, `MoodboardEditorScreen` retry) ignore the return value
  — signature change is backward compatible; their outcomes were already
  surfaced through `syncStatus`/`conflictDetail` inside `submitBoardOps`.
- No commits made; `.flagship` canonical files untouched.
