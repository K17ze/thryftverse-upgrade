# PKG-02 Report — Canonical wallet money path: reservations, idempotency, context policy

Repo root: `C:/Users/User/Desktop/thryftverse-upgrade` (HEAD `76c0733`, branch `feat/product-detail-contract-media-device-closure`)
Audit source: `ThryftVerse-Post-Upgrade-Audit-2026-09-20.md` (FIN-03, FIN-04, FIN-08)

## Status: CLOSED — all three findings resolved; typecheck clean; 9/9 focused tests pass.

(Resume-mode note: a prior agent left the implementation substantially complete. This pass verified schema assumptions against migrations, verified every leased hunk in `index.ts`, audited all remaining 1ZE debit call sites, ran the backend typecheck and the focused test file, and produced this report. No code gaps were found; no additional edits were required.)

## Per-finding closure

| Finding | Resolution |
|---|---|
| FIN-03 (High) — gross-balance-only debit path | New canonical primitive `computeSpendableOnezeUnits` / `assertSpendableOnezeUnits` in `lib/walletMoneyPath.ts:239-345`: spendable = `wallets.oneze_balance_units` − unexpired `coown_order_reservations` rows with `status IN ('active','placed')` (identical predicate to the position projection at `index.ts:23933-23941` and the coOwn settlement guard at `routes/coOwn.ts:667-679`). Runs on the caller's transaction: wallet row `FOR UPDATE` first, then reservation rows `FOR UPDATE` in stable id order (same lock discipline as reservation placement). Settler exclusions (`excludeReservationIds`, `excludePlacedOrderId`) mirror the `placed_order_id IS DISTINCT FROM` convention so a settler can ignore the hold it is consuming. `lockWalletRowsForUpdate` (`walletMoneyPath.ts:204-225`) locks multiple wallet rows in deterministic id order so opposite-direction transfers cannot deadlock. Wired into `POST /wallet/1ze/transfer` at `index.ts:22651-22655` before the `TRANSFER_SEND` debit. |
| FIN-04 (High) — transfer idempotency race | New claim-before-mutate pair `claimWalletIdempotencyKey` / `completeWalletIdempotencyClaim` (`walletMoneyPath.ts:466-598`). Inside ONE transaction: `INSERT ... ON CONFLICT (user_id, operation, idempotency_key) DO NOTHING` with a JSONB pending marker — Postgres serializes speculative inserts on the PK, so a concurrent same-key claim blocks until the winner commits or aborts. Loser path re-reads the committed row `FOR UPDATE`: matching `request_hash` → `replay` (durable stored response); mismatched hash → `IDEMPOTENCY_KEY_REUSED` (409); pending marker → `in_progress` (explicit 409 policy). Winner runs the money mutations then UPDATEs the same row with the real response — crash rolls back the claim, retry starts clean. `wallet_idempotency_keys` schema untouched (no status column added; marker lives in `response_payload` and is never visible post-commit). Wired at `index.ts:22490-22520` (claim before any mutation) and `index.ts:22756-22766` (response stored atomically with the balanced postings). |
| FIN-08 (Medium) — arbitrary transfer context | New `assertP2pTransferContextAuthorized` (`walletMoneyPath.ts:617-752`), invoked from `evaluateP2pPolicyEligibility` (`index.ts:3765-3775`) which now accepts `callerRole`. `coOwn_trade`: contextId must be a real `coOwn_trades` row, `settlement_status='settled'`, `buyer_id`/`seller_id` must equal sender/recipient exactly, and `amountUnits` must equal the buyer leg `ceil(roundTo(notional_gbp + fee_gbp, 4) * 1000)` — the identical formula `applyCoOwnTransfer` uses (`coOwn.ts:654`). `platform_reward`: system-originated; requires `callerRole === 'admin'` (no domain table exists — caller authority is the enforceable proof). Both contexts are single-use: rejected if a committed `wallet_ize_transfers` row already carries the `(contextType, contextId)` pair. Unknown context types → `P2P_TRANSFER_CONTEXT_INVALID`. The transfer route passes `request.authUser?.role` at `index.ts:22537`. |

## Files changed

| File | Change |
|---|---|
| `backend/api/src/lib/walletMoneyPath.ts` | +~529 lines: `SpendableOnezeFunds`, `lockWalletRowsForUpdate`, `computeSpendableOnezeUnits`, `assertSpendableOnezeUnits`, `claimWalletIdempotencyKey`, `completeWalletIdempotencyClaim`, `WalletIdempotencyClaimResult`, `assertP2pTransferContextAuthorized`. Existing `getWalletIdempotentResponse`/`saveWalletIdempotentResponse`/`applyWalletLedgerDelta` unchanged for the other wallet routes. |
| `backend/api/src/index.ts` (leased regions only) | Import block `:110-126`; `evaluateP2pPolicyEligibility` gains `callerRole` param `:3727` + FIN-08 authorization call `:3765-3775`; transfer handler `:22490-22520` claim-before-mutate (replacing read-then-write), `:22537` callerRole, `:22647-22655` deterministic wallet locking + spendable assert, `:22756-22766` atomic response store. Verified via `git diff`: all hunks fall inside leased lines ~3700-3770 / ~22340-22700; hunks at ~9355/9375/9630/38663 are another agent's notification work. |
| `backend/api/src/__tests__/walletMoneyPathReservations.test.ts` | NEW (~1000 lines). Fake DB emulating Postgres READ COMMITTED: speculative same-key inserts block on the holder's tx outcome, `FOR UPDATE` serializes per-row, writes apply atomically at COMMIT. |

## Tests run

- `npx tsc --noEmit -p tsconfig.json` (backend/api) — **clean, 0 errors**.
- `node --import tsx --test src/__tests__/walletMoneyPathReservations.test.ts` — **9/9 pass**:
  - concurrent same-key transfers → exactly one TRANSFER_SEND + one TRANSFER_RECEIVE, loser replays the stored response, pending marker never visible;
  - aborted claim frees the key for a clean retry;
  - active+placed reservations are unspendable; expired/cancelled holds do not bind; 1 unit over spendable → `WALLET_INSUFFICIENT_BALANCE`;
  - settler exclusions free the reservation being consumed;
  - recycled key + different payload → `IDEMPOTENCY_KEY_REUSED`, no second debit;
  - `platform_reward` rejected for non-admin, allowed for admin;
  - `coOwn_trade` rejected for missing trade / wrong participants / wrong amount;
  - context single-use enforced after a committed transfer;
  - unknown context type rejected.
- Old-behavior check: the concurrency test fails under the previous read-then-write pattern (both txs pass the absent-key read and both debit); the reservation test fails against a gross-balance check (10 000 gross vs 4 001 requested would pass); the context tests fail against the former presence-only check. All four required demonstrations covered.

## Residual risks

1. **Other 1ZE debit paths still gate on gross balance** — outside this package's leased regions, so intentionally untouched: `convert_1ze_to_fiat` (`index.ts:21975` gross check, debit `:22032`), burn/redeem (debit `:21707`, guarded only by the ledger negative-balance check), withdrawal accept (`:23219`), `oneze_internal` commerce checkout (`:28976` via `readOnezeBalanceUnitsForUpdate` → `settlePaymentIntent` `:7494`), and DRIP (`coOwnDripExecutionHandler.ts`, owned by another package per the brief). `assertSpendableOnezeUnits` is exported and drop-in for adoption; a reserved-funds withdrawal/convert is still possible until those callers switch.
2. **Context single-use is a read-time check (TOCTOU)**: two concurrent transfers citing the same `contextId` could both pass before either commits. A partial unique index on `wallet_ize_transfers (metadata->>'contextType', metadata->>'contextId') WHERE status='committed'` would enforce it in DB — schema change was out of scope.
3. **Other wallet routes keep the legacy read-then-write idempotency pair** (`buy_1ze`, `burn`, `convert_1ze_to_fiat`, `withdraw_*`, mint) — the same theoretical race exists there; only the transfer route was in FIN-04 scope.
4. **`platform_reward` authority is role-only** — no reward domain table exists to cross-check amount/participants; admin role is the entire proof, documented in the code comment.
5. `in_progress` (409) is unreachable under normal operation — uncommitted claim rows are invisible and the conflicting INSERT blocks until the outcome; it is defense-in-depth for rows written outside the claim flow.
6. FIAT debits are not covered — `coown_order_reservations` is denominated in 1ZE units only, so the primitive is 1ZE-scoped by design.

## Test summary

`tsc --noEmit` clean; `walletMoneyPathReservations.test.ts` 9/9 pass (node:test fake-DB suite covering concurrent-claim, reservation gating, payload-mismatch rejection, and privileged-context authorization).
