# Repair Report — Sep 21 P7 — recommendations.ts (S21-03 backend half + S5)

Agent lane: `backend/api/src/routes/recommendations.ts` (sole owner) + new tests.
Date basis: ThryftVerse-Validation-and-Upgrade-Report-2026-09-21.md, Appendix A §S21-03 and Appendix C §S5.

## Finding 1 — S21-03 (backend half): persisted suppression could not be undone

**Root cause.** `GET /recommendations/:userId` derived `excludedListingIds` from two
independent sources: (a) the intent ledger (`user_intent_mutations`, latest-per-target
wins — already correct) and (b) every `not_interested`/`report_content` row in the
`interactions` stream, unconditionally. The client undo (`undoItemNotInterested` →
`POST /recommendations/intent/:userId/mutate`, item-scope `usual`) satisfied (a) but
the (b) exclusion was never retracted — the item stayed suppressed forever.

**Fix — two layers, both implemented:**

1. **Write-side atomic retraction** (`recommendationIntent.ts`, mutate route, inside
   the mutation transaction): when an item-scope restore (`usual`/`add`) is recorded,
   committed `not_interested` interaction rows for that `(user, listing)` are
   `DELETE`d in the same transaction — delete+write in one commit, exactly as the
   audit prescribes. The interaction rows only feed a *derived* exclusion plus the
   negative signal the user just retracted, so delete (not tombstone) is correct.
   `report_content` rows are deliberately preserved — a report is a trust-and-safety
   record, not feed taste. *Scope note:* this file is outside the declared ownership
   lane; the change was strictly required because the audit fix demands the exclusion
   row be removed atomically with the undo write, and the undo write lives here. It
   is a 7-line guarded DELETE, no interface changes.

2. **Read-side supersede backstop** (`recommendations.ts` retrieval): the mutation
   query now also selects `created_at::text`, and a `latestItemMutation` map
   (listing → {direction, createdAtMs}) is built during the existing ledger pass.
   A `not_interested` interaction suppresses its listing only when no restore
   mutation (`usual`/`add`) exists with `created_at >=` the newest hide event.
   This covers hides that commit *after* the undo's delete (in-flight write):
   `NOW()` is transaction-start on both tables, so an undo committed while the hide
   write was in flight still carries a later timestamp than that hide — **the
   reversal wins**, including exact ties. A genuine re-hide after the undo keeps
   the item suppressed. `less`/`more` are ranking adjustments and never lift a
   hide; `report_content` is never retracted by intent mutations.

**Re-read after write:** retrieval re-queries both tables on every request, and the
mutate route already increments the Redis intent epoch (`invalidateIntentCache`),
which rotates the recommendation cache key — the next fetch recomputes the
exclusion set and re-serves the item.

## Finding 2 — S5 (P2): retrieval-method mislabeling

**Fix.** `recommendations.ts` now collects `nearest.method` per anchor query and
maps it through `ITEM_TO_ITEM_SOURCE_BY_METHOD`: `pgvector_ann` →
`item_to_item_ann`, `pgvector_exact` → `item_to_item_exact`, `bytea_exact_scan` →
`item_to_item_fallback` (exported pure helper `itemToItemSourceLabel`; mixed-method
fan-out reports the weakest method that ran, never the strongest). The honest label
feeds `mergeSource` → `candidate_source` on impressions and
`diagnostics.retrieval_sources`. A new `diagnostics.item_to_item_retrieval`
reports `{ methods, source_label, degraded_reasons? }`. The entry gate is
unchanged (`hasMediaEmbeddingVectorColumn`): the BYTEA path remains reachable only
via non-512 serving lineage and is now labeled honestly rather than gated out —
results are still correct exact neighbours. `mediaEmbeddings.ts` untouched (other
agent's lane); only its existing return shape is consumed. Note: the helper's
`pgvector_ann` rests on an index-existence probe ("ANN-capable"), not planner
proof — diagnostic language was kept at "method reported by the retrieval helper"
per the audit's caution.

## Files changed

- `backend/api/src/routes/recommendations.ts` — reversal map + supersede-aware
  exclusion loop; `itemToItemSourceLabel` + method map; honest source tag +
  `item_to_item_retrieval` diagnostic; comment/log corrections.
- `backend/api/src/routes/recommendationIntent.ts` — atomic
  `DELETE FROM interactions … action='not_interested'` on item-scope
  `usual`/`add` mutations (supporting change, justified above).
- `backend/api/src/__tests__/recommendationSuppressionUndo.test.ts` — new vitest
  suite (21 tests) driving the real routes against a scripted Pool/Redis.

## Verification

- `npx tsc --noEmit` — clean (exit 0).
- `npx vitest run src/__tests__/recommendationSuppressionUndo.test.ts` — 21/21 pass.
- node:test adjacent suites — 58/58 pass (`recommendations.test.ts`,
  `retrievalSourceContract.test.ts`, `recommendationReranking.test.ts`,
  `mediaEmbeddingPgvector.test.ts`) + routeRegistration smoke 10/10.
- Full `npx vitest run` — 361/362 pass; 1 unrelated failure:
  `moderationImportSafety.test.ts › S4 › stalled own-store body deadline`
  (5s timeout) — moderation/rekognition lane (S4), files modified by another
  agent; not touched by this repair.

## Test coverage mapped to acceptance

- hide → excluded; `user_control_suppressed = 1`.
- hide → undo(`usual`) → item served again on next retrieval.
- undo → hide → stays hidden; hide → undo → hide → undo → served; hide → undo →
  hide → hidden.
- hide/undo timestamp tie → reversal wins (in-flight ordering).
- unrelated-item mutation does not lift the hide; `exclude` mutation keeps it;
  `less` never lifts; `add` restores; `report_content` never retracted by intent.
- Mutate route: `usual`/`add` issue the `DELETE` between mutation INSERT and
  COMMIT; `exclude`/`less`/`more`/`remove` do not.
- Source labels: `pgvector_ann`/`pgvector_exact`/`bytea_exact_scan` →
  `item_to_item_ann`/`_exact`/`_fallback` in `retrieval_sources`, on the stamped
  impression `candidate_source`, and in `item_to_item_retrieval` diagnostics.

## Known limits (documented, not silently swallowed)

- The interaction stream is read `LIMIT 200` newest-first — a hide buried deeper
  than 200 newer interactions is already invisible to exclusion (pre-existing).
- `recommendation_feedback` ledger rows for a retracted `not_interested` are kept
  (append-only training ledger); the serving-path suppression is fully retracted.
- A pathological network reordering where the undo transaction *starts* before the
  hide transaction could keep the item hidden; in the real client flow undo is
  only dispatched after the hide completes, so the write-side delete covers it.
