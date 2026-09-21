# Repair R3 — Database / Money-Path Leaf Repair Report

Scope: findings in `.flagship/reports/review-database.md` (P0 ×2, P1 ×4, P2 ×13).
Status: **complete** — typecheck clean, all focused suites green. Not committed.
`.flagship` canonical files untouched.

This was a resumed pass: the previous pass had already landed both P0s, all P1s,
and most enumerated P2s. This pass verified each landed fix against the finding,
repaired the remaining P2s (12, 8, 7, 6), and fixed the DRIP test double that the
previous pass's new queries had left stale.

---

## Verified already landed (no change needed)

| Finding | Evidence |
|---|---|
| **P0-1** migration 326 edited in place | `git diff backend/api/src/db/migrations/326_media_embeddings_pgvector.sql` is **empty** — restored to committed bytes. 330's `CREATE OR REPLACE` is the fix vehicle. |
| **P0-2** claim-before-mutate on 1/7 routes | All **8** money routes now claim inside the mutation txn: `mint_quote` (claim `index.ts:20900`, complete `21229`), `mint` (`21501`/`21673`), `burn` (`21819`/`22159`), `convert_1ze_to_fiat` (`22269`/`22498`), `buy_1ze` (`22592`/`22720`), `p2p_transfer` (`22861`/`23135`), `withdraw_quote` (`23283`/`23473`), `withdraw_accept` (`23562`/`23609`+`23730`). Each follows the full pattern: atomic `INSERT … ON CONFLICT` claim inside the txn, COMMIT+replay on `replay`, 409 on `in_progress`, `IDEMPOTENCY_KEY_REUSED` on hash mismatch (thrown by the primitive), response stored atomically via `completeWalletIdempotencyClaim` before COMMIT. |
| **P1-1** reserve/placement lock inversions | Reserve route (`coOwn.ts`): asset `FOR UPDATE` (`3625`) → wallet `FOR UPDATE` (`3646`) → expire-UPDATE on reservations (`3657`). Placement: asset `FOR UPDATE` → `lockCoOwnWalletForUser` (`3943`) → reservation `FOR UPDATE` (`3967`). Both now wallet→reservations. |
| **P1-2** multi-entity lock order | Transfer: `ensureWallet` now resolves both parties in **user-id order** (`index.ts:23048-23055`), then `lockWalletRowsForUpdate` re-locks in wallet-id order (`23062`). `applyCoOwnTransfer` (`coOwn.ts:634-660`): both wallets locked in a single id-ordered scan → buyer reservations via `computeSpendableOnezeUnits` → holdings in user-id order. DRIP handler (`coOwnDripExecutionHandler.ts:300-309`): user+issuer wallets locked in **one** `WHERE user_id = ANY … ORDER BY id FOR UPDATE` scan — same order as the trade path. |
| **P1-3** P2P context single-use check-then-act | Migration `333_wallet_ize_transfers_context_single_use.sql`: partial unique index `wallet_ize_transfers_context_uidx` on `(metadata->>'contextType', metadata->>'contextId') WHERE status='committed' AND both keys present` — idempotent (`IF NOT EXISTS`), down-file drops it. Loser's insert hits 23505 → mapped to `P2P_TRANSFER_CONTEXT_BLOCKED` 409 at `index.ts:23176`. |
| **P1-4** `denied` leaked to author | `GET /listings/:id/questions` (`index.ts:17781-17782`): now `visible OR (quarantined AND asker)` — denied hidden from everyone. Answer predicate `17798-17799` same shape. |
| **P2-1** withdraw-accept post-commit save | Response stored on the claimed row **inside** the txn (`23730`) before COMMIT (`23739`). The post-commit `completeWalletIdempotencyClaim` at `23763` is a guarded best-effort correction for queue-enqueue failure only — wrapped in try/catch, cannot 500 a committed reservation. |
| **P2-2** advisory-unlock failure leaks lease | `searchSync.ts:846-850`: unlock failure → `lockClient.release(unlockError)` destroys the client instead of pooling a still-locked session. |
| **P2-3** swap-poll timeout misreports | `searchSync.ts:999-1038`: poll failure re-reads the task once via `fetchMeiliTaskStatus`; `succeeded` → continues post-swap; `failed` → definitive failure; anything else → `swapUndetermined: true` with an honest "may still repoint server-side" error. `swapUndetermined` added to `BlueGreenReindexResult` (`459`). |
| **P2-4** pre-try throws escape result contract | `dbPool.connect()` wrapped (`774-789`) and `loadMeiliClient()` inside the locked body (`895`) — both return `BlueGreenReindexResult`, never propagate. |
| **P2-11** burn-cap race | `assertSpendableOnezeUnits` wallet `FOR UPDATE` (`index.ts:21928`) now precedes the daily/weekly cap reads (`21935-21938`): concurrent burns serialize on the wallet row and the loser observes the winner's committed operation. Non-architecture fallback documented as lockless legacy path in the comment. |

## Fixed this pass

### P2-12 — `questionCount` asymmetry (`index.ts:17430-17446`)
The listing-detail count used `moderation_state='visible'` while the questions list
shows the asker their own `quarantined` rows — an author saw a question the count
excluded. The count now uses the list's predicate
(`visible OR (quarantined AND asker_id = $2)`, viewer id or NULL), keeping `denied`
hidden from everyone per the 332 contract.

### P2-8 — Reserve-route idempotency was outside the txn; retry expired the winner's reservation (`routes/coOwn.ts`)
Two concurrent same-key reserves both passed the pool-side read, then the loser's
expire-UPDATE retired the winner's fresh `active` reservation while the stored
idempotent response still pointed at it — the first client's `reservationId`
immediately failed `CO_OWN_RESERVATION_INVALID` on placement.

Fix mirrors `claimWalletIdempotencyKey`/`completeWalletIdempotencyClaim`:

- New `claimCoOwnReservationIdempotencyKey` + `completeCoOwnReservationIdempotencyClaim`
  (`coOwn.ts:391-508`): `INSERT … ON CONFLICT (asset_id, user_id, idempotency_key)
  DO NOTHING` with a pending marker inside the JSONB `response_body`; conflict →
  `FOR UPDATE` read → hash-mismatch `IDEMPOTENCY_KEY_REUSED`, pending → `in_progress`
  (409), committed → `replay`. Completion is an UPDATE in the same txn and refuses
  to commit an unrecorded mutation (`IDEMPOTENCY_CLAIM_LOST`).
- Route wiring (`3595-3620`): claim is the **first** statement after `BEGIN` — a
  losing claim replays (200) or 409s and returns *before* the asset/wallet locks
  and the expire-UPDATE, so a retry can never expire the winner's reservation.
  The pre-txn `getCoOwnReservationIdempotentResponse` read stays as a read-only
  fast path and now also filters a (never-committed, defensive) pending marker.
- Removed the now-dead `saveCoOwnReservationIdempotentResponse` and the dead
  `AND id <> $2` / `''` predicate in the buy-side headroom sum (P2-13 nit).

### P2-7 — `ensureWallet` wrote a dead tuple per call (`index.ts:3177`, `workerRuntime.ts:652`)
`INSERT … ON CONFLICT DO UPDATE SET user_id = EXCLUDED.user_id` produced a new row
version on every invocation on every money path. Both copies now do
`SELECT … FOR UPDATE` (same row lock, no write) + conditional
`INSERT … ON CONFLICT DO NOTHING` + locked re-read on a lost insert race.
Lock-order semantics unchanged — the transfer route's canonical-ordering fix
(comment updated to say FOR UPDATE, `index.ts:23042`) still applies verbatim.

### P2-6 — Unbounded alert snapshot (`coOwnAlertEvaluatorHandler.ts`)
The `active AND triggered_at IS NULL` enumeration now caps at
`ALERT_EVALUATION_BATCH_LIMIT = 500` per pass (`77`). Triggered alerts leave the
set (`triggered_at` stamped), so successive passes drain the backlog in
`created_at` order.

### Test repair — `coOwnDripSettlement.test.ts` double was stale
The previous pass added two queries the scripted double didn't recognise
(`Unexpected query in test double` → 4 test failures): the unlocked
holding-headroom estimate (`handler:234`) and the single `ANY($1)` multi-wallet
`FOR UPDATE` scan (`handler:300`). The double now serves the unlocked holdings
read (same lookup as the `FOR UPDATE` branch) and the id-ordered `ANY` wallet
scan. Suite green 6/6.

## Deferred / accepted (documented, not defects-in-scope)

- **P2-5** per-document `adapter.index()` calls in full reindex — perf only; a bulk
  `addDocuments` pass is a separate change, deferred.
- **P2-9** 330 single-transaction backfill + `regclass` fail-closed — documented
  acceptable in the migration header; flagged for large `media_embeddings`.
- **P2-10** 332 non-concurrent index / CHECK validation scan — small table, noted.
- **P2-13** remaining nits — `Promise.all` over two `applyWalletLedgerDelta`
  serialises anyway (harmless); `Number()||1` seq=0 mask is hypothetical.
- **Pre-existing dead code, flagged:** `index.ts:2991/3030` define unused copies of
  `getCoOwnReservationIdempotentResponse`/`saveCoOwnReservationIdempotentResponse`
  (the live ones are in `routes/coOwn.ts`).

## Verification

- `cd backend/api && npx tsc --noEmit -p tsconfig.json` — **clean**.
- `node --import tsx --test` suites:
  - `walletMoneyPath` + `walletMoneyPathReservations` — **26/26**
  - `sellerHubBatchEdit` + `checkoutMoneyPathGuards` + `listingRiskEnforcement` — **47/47**
  - `coOwnAlertLifecycle` + `coOwnOutboxDrain` + `coOwnSurveillanceContract` +
    `coownVerificationDemands` — **23/23**
  - `coOwnDripSettlement` — **6/6**
- `coownMatchingProperty` is a vitest suite (crashes under `node --test` —
  pre-existing runner mismatch): `npx vitest run` — **15/15**.
- Redis `ECONNREFUSED` noise during runs is environmental (no local Redis); one
  combined `node --test` invocation needed `--test-force-exit` because an import
  keeps an ioredis retry loop alive — test results unaffected.

## Files touched this pass

| File | Change |
|---|---|
| `backend/api/src/index.ts` | questionCount predicate (P2-12); `ensureWallet` SELECT-FOR-UPDATE rewrite (P2-7); comment update |
| `backend/api/src/lib/workerRuntime.ts` | `ensureWallet` rewrite mirrored (P2-7) |
| `backend/api/src/routes/coOwn.ts` | reservation claim-before-mutate (P2-8); dead `id <> $2` and dead save helper removed |
| `backend/api/src/workers/handlers/coOwnAlertEvaluatorHandler.ts` | snapshot `LIMIT 500` (P2-6) |
| `backend/api/src/__tests__/coOwnDripSettlement.test.ts` | test double: unlocked holdings read + `ANY` wallet scan |

Nothing committed.
