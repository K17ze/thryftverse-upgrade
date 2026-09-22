# Repair Report — S21-04: Moodboard partial enqueue outliving a reported failed command

**Date:** 2026-09-21 (repair pass p8)
**Finding:** `ThryftVerse-Validation-and-Upgrade-Report-2026-09-21.md`, Appendix A S21-04 (HIGH — data integrity)
**Status:** DONE

## Defect

1. `submitBoardOps` enqueued a command's ops **one row at a time** into `mutation_outbox`. If insert N threw, the catch returned `'failed'` while the durable prefix stayed queued and would drain on reconnect — the command was neither fully rejected nor fully queued, and history had already reported it as failed.
2. The history lock (`applyingRef`) was released in `finally` **before** the failed-inverse `reconcileBoard` fetch completed, so a second undo/redo could interleave and have its optimistic write silently overwritten by the late reconcile response.
3. `reconcileBoard` swallowed fetch errors — a failed reconciliation left optimistic state on screen indistinguishable from applied truth, and `flushOutbox` still returned `'applied'`/`'synced'`.

## Fix

### 1. Atomic batch enqueue — `frontend/src/storage/moodboardOutbox.ts`
- Added `enqueueMoodboardOperationBatch(inputs)`: all ops for a command are inserted inside **one `db.transaction()`** (same transaction primitive the migration runner uses). A mid-batch insert failure rolls the transaction back — either every op is durable or none is. No durable prefix can survive a `'failed'` outcome, so no tombstone/command-id scheme is needed.
- `enqueueMoodboardOperation` is now a single-element wrapper over the batch API — one write path.

### 2. Ordering — `frontend/src/components/moodboard/useMoodboardHistory.ts`
- `undo` and `redo` now hold `applyingRef` through **both** the mutation submit *and* the `reconcileAfterFailedInverse` fetch (lock moved outside so it wraps outcome handling). A second history command during the reconcile window early-returns instead of interleaving.
- `reconcileAfterFailedInverse` returns `Promise<boolean>` (propagates the reconcile truth value).

### 3. Truthful failure — `frontend/src/components/moodboard/useMoodboardBoard.ts`
- `SubmitBoardOpsOutcome` extended with `'unreconciled'`: ops drained but the canonical re-fetch failed → local state is unverified, not applied.
- `reconcileBoard` now returns `Promise<boolean>`; on fetch failure it flags `syncStatus='error'` plus an honest `conflictDetail` message ("couldn't verify the latest board state… retry sync") — the sync overlay's "Couldn't save / Retry" path re-runs the reconcile.
- `flushOutbox` tracks `lastReconcileOk` and returns `'unreconciled'` instead of `'applied'` when the post-drain fetch fails; history treats `'unreconciled'` like failure (entry kept, recoverable, re-reconciled under lock).
- Additionally fixed a masked-status race found by the new tests: `flushOutbox` only writes `'synced'` when **this call actually pushed rows** (`pushedAny`). An empty-queue flush (mount/reconnect effect, or a drain that already emptied) previously claimed `'synced'` and stomped a just-set `'error'` flag.

### Consumer type adjustments
- `reconcileBoard` returning `Promise<boolean>` required widening two callback signatures (return value is ignored by both callers):
  - `useMoodboardImport.ts`: `onItemAdded` → `void | Promise<unknown>`
  - `MoodboardSourcePicker.tsx`: `onItemAdded` → `void | Promise<unknown>`
  - `MoodboardEditorScreen.tsx` unchanged (both call sites are compatible after widening).

## Tests — `frontend/src/__tests__/moodboardAtomicBatch.test.tsx` (new, 6 tests)

Mounts the **real** `useMoodboardBoard` + `useMoodboardHistory` and the **real** `storage/moodboardOutbox` module against an in-memory fake of the op-sqlite boundary (`execute` + `transaction` with snapshot/rollback semantics), so the durable SQLite enqueue path is exercised rather than stubbed:

1. Second storage write fails mid-batch → outcome `'failed'`, **zero** durable rows, rollback ran, post-"reconnect" `drainMoodboardOutbox()` pushes nothing and never hits the operations endpoint.
2. Healthy 2-op command commits in **one** transaction and drains both ops in seq order → `'applied'`.
3. Second `undo()` while the failed inverse's reconcile is pending → ignored; no second submission; canvas not overwritten; entry stays recoverable.
4. Same serialization on the **redo** path (second `redo()` during pending reconcile ignored).
5. Drain succeeds but reconcile fetch fails offline → outcome `'unreconciled'`, `syncStatus='error'`, never `'synced'`.
6. `'unreconciled'` inverse keeps the undo entry on the stack (recoverable) with error status flagged.

**Verified:** all 6 tests FAIL on the pre-fix code (HEAD versions of the three source files — confirmed by checkout-and-run, then restored).

## Commands run

- `npx tsc --noEmit` — 0 errors in touched files. 4 pre-existing errors remain in unrelated files (`src/screens/UnifiedDiscoveryScreen.tsx` ×3, `src/__tests__/s21FrontendRepairs.test.tsx` ×1) — not introduced by this change.
- `npx vitest run src/__tests__/moodboardAtomicBatch.test.tsx src/__tests__/moodboardHistoryOutcome.test.tsx src/__tests__/moodboardHistory.test.ts` — **31/31 pass** (6 new + 4 + 21 existing).
- `npx vitest run src/__tests__/stateTruthfulnessRepairs.test.tsx` — **23/23 pass** (no regression in the moodboard fan-out/history outcome coverage).
- Pre-fix verification: `git checkout HEAD -- <3 source files>` → 6/6 new tests fail → restored.

## Files changed

- `frontend/src/storage/moodboardOutbox.ts` — batch enqueue API + docstring
- `frontend/src/components/moodboard/useMoodboardBoard.ts` — outcome type, batch call, `reconcileBoard` boolean + error flagging, `flushOutbox` `lastReconcileOk`/`pushedAny`
- `frontend/src/components/moodboard/useMoodboardHistory.ts` — lock spans reconcile; `reconcileAfterFailedInverse` returns boolean
- `frontend/src/components/moodboard/useMoodboardImport.ts` — callback signature widening
- `frontend/src/components/moodboard/MoodboardSourcePicker.tsx` — callback signature widening
- `frontend/src/__tests__/moodboardAtomicBatch.test.tsx` — new test file

## Residual notes

- The non-DB online fallback path in `submitBoardOps` still submits op-by-op to the server (no server batch endpoint exists); a mid-batch network failure there can persist a server-side prefix — mitigated by the reconcile-under-lock + `'unreconciled'` honesty, but a true server-side batch endpoint would close it fully.
- `'unreconciled'` keeps the history entry on its stack; a retried undo computes ops against the reconciled board (`opsForEntry` drops no-ops), so it cannot double-apply.
