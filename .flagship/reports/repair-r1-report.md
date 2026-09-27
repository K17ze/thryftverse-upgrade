# Repair R1 — Leaf Repair Report

Scope: FIN-03 residual gross-balance 1ZE debit paths (Task A), listing Q&A moderation fail-open
(Task B), bulk listing edit moderation fail-open (Task C).
Status: **complete** — typecheck clean, all focused + adjacent tests green. Not committed.

Shared vocabulary used throughout: `listingTextGateAction` in
`backend/api/src/lib/moderation/moderationService.ts` maps `rejected → block`,
`review → hold`, `failed → hold`, `approved → publish`. Reservation-aware spendability is owned
by `backend/api/src/lib/walletMoneyPath.ts` (`lockWalletRowsForUpdate`,
`computeSpendableOnezeUnits`, `assertSpendableOnezeUnits`) — wallet row `FOR UPDATE` first, then
reservation rows in deterministic id order, inside the caller's transaction.

---

## Task A — Reservation-aware 1ZE debit paths (FIN-03)

**Defect:** four remaining spend decisions read the gross `wallets.oneze_balance_units` only, so
funds already reserved by enforceable coOwn reservations could be double-spent through these
paths.

**Fix — all in `backend/api/src/index.ts`, inside each path's existing mutation transaction:**

- **Burn** `POST /wallet/1ze/burn` (~line 21919): `assertSpendableOnezeUnits` runs before the
  segment debit and the `BURN` ledger posting. Previously the segment debit was the only gate.
- **Convert** `POST /wallet/convert-1ze-to-fiat` (~line 22235): the gross
  `Number(wallet.oneze_balance_units)` read is replaced by `computeSpendableOnezeUnits`; the
  `INSUFFICIENT_1ZE_BALANCE` error now reports `grossUnits`, `reservedUnits`, `spendableUnits`
  and `requestedAmountUnits` instead of a bare gross figure.
- **Withdrawal accept** `POST /wallet/1ze/withdrawals/:withdrawalId/accept` (~line 23490):
  `assertSpendableOnezeUnits` runs immediately before the `WITHDRAWAL_RESERVED` ledger debit.
  The check belongs here — the QUOTED request stage only writes pricing and moves no funds, so
  acceptance is the actual spend decision. Quote creation was deliberately left unreserved.
- **`oneze_internal` checkout** `POST /payments/intents` (~line 29254): the preflight replaces
  `readOnezeBalanceUnitsForUpdate` (gross) with `computeSpendableOnezeUnits`, so the quoted
  affordability check and the 402 `INSUFFICIENT_1ZE` response reflect spendable funds.
- **`settlePaymentIntent`** (~line 7541): `assertSpendableOnezeUnits` runs before the `PURCHASE`
  debit, so every settle entry point — checkout, manual confirm, stale-submission reconcile, DLQ
  retry — is guarded, not just the checkout route's preflight.

The P2P transfer path already locked both wallet rows via `lockWalletRowsForUpdate` and asserted
spendable before the balanced postings (~line 22920); it needed no change.

Lock ordering: every new call site goes through the shared primitive — wallet row first, then
reservation ids sorted — so no path duplicates reservation logic and the wallet→reservation order
matches the coOwn reservation-placement order (no new lock-order inversion).

## Task B — Listing Q&A moderation hold semantics

**Defect:** `POST /listings/:id/questions` and `POST /listings/:id/questions/:qaId/answer` only
blocked `rejected` verdicts; `review` and provider `failed` silently published. The `listing_qa`
table also had no moderation column, so held content had nowhere durable to live.

**Fix:**

- New migration `backend/api/src/db/migrations/332_listing_qa_moderation_state.sql` (+ down):
  adds `moderation_state` (question) and `answer_moderation_state` (answer) to `listing_qa` with
  the chat-style vocabulary `visible | quarantined | denied`, backfilling existing rows as
  `visible`, plus supporting indexes. `denied` is reserved for operator takedown; nothing writes
  it yet.
- Question write (`index.ts` ~17834): `listingTextGateAction` — `block` returns 422
  `MODERATION_REJECTED` unpersisted; `hold` persists the row with
  `moderation_state='quarantined'` and logs a warn.
- Answer write (~17913): same gate — `block` 422s; `hold` stores `answer_text`/`answered_by`/
  `answered_at` with `answer_moderation_state='quarantined'`.
- Public reads filter held content: listing-detail Q&A counts (~17433, ~17461), the
  `/qa-summary` endpoint (~17698–17713), and the Q&A list GET (~17779) expose only `visible`
  rows. The GET still shows the asker/answerer their own quarantined content marked with
  `moderationState` (mirrors the chat quarantine pattern); everyone else never sees it.

## Task C — Bulk listing edit moderation hold

**Defect:** `applyListingFieldPatch` in `backend/api/src/lib/listingPatch.ts` only refused
`rejected` verdicts; `review`/`failed` logged a warning and published the edit on a live listing.

**Fix (`listingPatch.ts` ~lines 245–300):**

- The text-moderation branch now routes through `listingTextGateAction`.
- `block` keeps the existing early-return `rejected` result.
- `hold` on an `active` listing writes `status='risk_pending'` inside the same patch transaction
  and cancels all non-terminal live lots (`scheduled|open|closing|passed`), emitting a
  `lot.cancelled` `live_lot_events` row per lot with `reason: 'listing_moderation_hold'` — the
  same invariant the single-PATCH route applies (a held listing must not stay biddable).
- `hold` on a non-public listing applies the patch without a status write — it is already
  unservable and the publish gate re-runs moderation before any future activation.
- `ListingFieldPatchResult` gains `newStatus?: string` so the batch receipt reports the landing
  status honestly; `backend/api/src/routes/sellerHub.ts` propagates it into the per-item receipt.

The single-edit listing route in `index.ts` was also routed through `listingTextGateAction`
(~line 581 of diff) so both edit surfaces share one gate vocabulary.

---

## Tests added / updated

- `backend/api/src/__tests__/walletMoneyPathReservations.test.ts` — 4 new source-level wiring
  assertions: burn asserts spendable before segment+ledger debits; convert gates on spendable not
  gross; withdrawal accept asserts before `WITHDRAWAL_RESERVED`; `oneze_internal` preflight
  computes spendable while settlement asserts it. These fail against the old gross-balance code.
- `backend/api/src/__tests__/listingRiskEnforcement.test.ts` — moderation mocks updated for the
  `listingTextGateAction` import; new cases: `review` holds a live listing at `risk_pending`,
  `failed` holds a live listing at `risk_pending`, held verdict on a non-public listing applies
  the patch with no status write; live-lot fixture rows exercise the cancellation path.
- `backend/api/src/__tests__/moderationImportSafety.test.ts` — new source-level Q&A assertions:
  both writes route through `listingTextGateAction`, held states persist as `quarantined`, and
  public reads filter on `moderation_state`/`answer_moderation_state`.

## Validation run

- `npx tsc --noEmit -p tsconfig.json` — clean (exit 0).
- `node --import tsx --test walletMoneyPathReservations.test.ts` — 13/13 pass.
- `node --import tsx --test listingRiskEnforcement.test.ts` — all pass, including the 3 new hold
  cases.
- `npx vitest run moderationImportSafety.test.ts` — 31/31 pass.
- `node --import tsx --test sellerHubBatchEdit.test.ts checkoutMoneyPathGuards.test.ts` — 31/31
  pass.
- `node --import tsx --test walletMoneyPath.test.ts` — 13/13 pass.
- `node --import tsx --test ugcReportIntake.test.ts` — 8/8 pass.

## Limitations / notes

- The node:test runner hangs after tests complete because `index.ts`-adjacent imports open a
  Redis queue connection that retries `ECONNREFUSED` forever in this environment; results were
  read before the hang (exit-124 timeouts reflect the kill, not test failures).
- `listing_qa` 'denied' state is schema-only for now — reserved for an operator takedown flow
  that does not yet exist.
- The `onezeBalance` figure in the 402 checkout response now reports spendable (not gross)
  amount-units — the more honest "what you can actually spend" number.
- The migration was authored but not applied to a live database in this environment; apply via
  `npm run migrate`.
- Working tree contained many pre-existing campaign/frontend modifications; only the files listed
  above were touched for this repair. No commit was created.
