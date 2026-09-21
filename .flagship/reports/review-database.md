# Adversarial Review — Database / Money-Path Campaign

**Scope:** migrations 330/331/332 (+ the in-place edit of 326), lock discipline on every new wallet/reservation call site, claim-before-mutate idempotency, the reindex advisory lease + blue/green swap, Q&A moderation-state filtering, and the pgvector bytea codec.
**Mode:** read-only review. No source files modified.
**Verdict: FAIL** — two P0s (a deploy-blocking migration-ledger violation and an incomplete idempotency rollout that leaves double-spend live on burn/convert/buy), plus systemic lock-order inversions on the reservation money path.

---

## P0

### P0-1 — Migration 326 was edited in place; the runner aborts on checksum mismatch before 330/331/332 can run

`backend/api/src/db/migrations/326_media_embeddings_pgvector.sql` is modified in the working tree (committed earlier at `85ae3098`): the codec body at **326:66-73** was changed from int4 arithmetic to `::bigint` promotion and now even references "330_* companion fix". But `backend/api/src/db/migrate.ts:67-81` enforces checksums:

```ts
// migrate.ts:75-79
if (storedChecksum && storedChecksum !== currentChecksum) {
  throw new Error(`[migrate] checksum mismatch for ${fileName} ...`);
}
```

Any database that applied the buggy 326 **with a checksum recorded** (the runner writes one on apply, `migrate.ts:93/101`) will now fail `runMigrations()` at file 326 — the loop `continue`s or `throw`s before ever reaching 330/331/332. That is exactly the population 330 was written for ("databases where 326 is already marked applied"). The 330 header (`330:14-18`) bets that all buggy-326 ledgers "predate checksums" (`checksum IS NULL` skips verification at `migrate.ts:75`); if any environment applied 326 after the checksum column existed — CI, staging, fresh deploys between 326 landing and this campaign — the entire migration run wedges.

Cascade: if migrations are skipped/aborted and the app still boots, `coOwnAlertEvaluatorHandler.ts:182` (`SELECT ... activation_seq`) and the Q&A read paths (`index.ts:17432, 17694, 17710, 17763`) reference columns that don't exist → worker error-loop and 500s on `/listings/:id/qa-summary` and `/listings/:id/questions` (no try/catch there, unlike 17430-17439).

**Fix direction:** revert 326 to its committed bytes (checksum-identical) and let 330's `CREATE OR REPLACE` fix every environment; or accept that 326 was never applied anywhere and drop 330's companion rationale.

### P0-2 — Claim-before-mutate idempotency exists but was wired into exactly ONE of seven money routes; the rest still double-spend under concurrent same-key requests

`walletMoneyPath.ts:429-448` itself documents the hole in the old pair: *"two concurrent requests with the same absent key can both read 'no row', both mutate the wallet ... a double spend."* `claimWalletIdempotencyKey`/`completeWalletIdempotencyClaim` (walletMoneyPath.ts:466-598) fix it correctly — INSERT … ON CONFLICT DO NOTHING inside the mutation transaction serializes claims; the pending-marker UPDATE commits the response atomically; loser replays or 409s. Verified sound.

But only the transfer route uses it (`index.ts:22768`, `23030`). Every other money-mutating route still uses `getWalletIdempotentResponse` (read) + `saveWalletIdempotentResponse` (write):

| Route | Read | Save | Double-mutation? |
|---|---|---|---|
| `POST /wallet/1ze/burn` | index.ts:21778 | index.ts:22097 | YES — two concurrent same-key burns both pass the read, serialize on the wallet FOR UPDATE inside `assertSpendableOnezeUnits` (21923), and each commits a `-amountUnits` ledger debit. User is debited twice for one key. |
| `POST /wallet/convert-1ze-to-fiat` | index.ts:22203 | index.ts:22419 | YES — same shape: 1ZE debited twice, fiat credited twice. |
| `POST /wallet/buy-1ze` | index.ts:22510 | index.ts:22626 | YES — fiat debited twice, 1ZE minted twice. |
| `POST /wallet/1ze/mint` | index.ts:21476 | index.ts:21636 | Partial backstop only: `wallet_ize_operations.payment_intent_id` unique (migration 307) catches retries **that carry a paymentIntentId**; key-only retries mint twice. |
| `POST /wallet/1ze/mint` quote | index.ts:20891 | index.ts:21208 | Two payment intents for one key (user can fund both). |
| `POST /wallet/1ze/withdrawals` quote | index.ts:23156 | ~23335 | Two quotes — lower blast radius. |
| `POST .../withdrawals/:id/accept` | index.ts:23420 | index.ts:23593 | Secondary guard: `loadWithdrawalById(..., forUpdate:true)` at 23434 serializes, second sees `RESERVED` → early-return (23446). Idempotency still racy for the stored response only. |

This is a realistic retry scenario (client timeout → same key re-sent while the first request is still in-flight) on a user-funds-out path. The primitive is built and tested; the rollout is simply incomplete.

---

## P1

### P1-1 — Lock-order inversion: reservation rows are locked BEFORE the wallet on the co-own reserve/order paths

Canonical order (`walletMoneyPath.ts:153-157`, implemented in `computeSpendableOnezeUnits` at 272-290): **wallet FOR UPDATE → reservation rows FOR UPDATE in id order.**

Violations:

- **`routes/coOwn.ts:3417-3424`** — reserve route opens the transaction with `UPDATE coown_order_reservations SET status='expired' WHERE user_id AND asset_id AND status='active'` — that UPDATE takes row locks on reservation rows **before** `SELECT ... FROM wallets ... FOR UPDATE` at **3478**. A concurrent `assertSpendableOnezeUnits`/`computeSpendableOnezeUnits` caller (burn 21923, convert 22240, transfer 22923, settle 7546, checkout 29259) holds the wallet and wants ALL of the same user's reservation rows in id order → **deadlock**: reserve holds res-rows → wants wallet; spendable path holds wallet → wants res-rows.
- **`routes/coOwn.ts:3900-3902`** — order placement locks `coown_order_reservations ... FOR UPDATE` (and `coOwn_assets ... FOR UPDATE` at 3839) before any wallet lock; the wallet is first locked inside `debitCoOwnOnezeUnits` (706/4280 → `computeSpendableOnezeUnits`). Same inversion against every spendable caller; additionally asset→reservation here vs reservation→asset in the reserve path is a second inverted pair for the same user+asset.

Postgres deadlock detection kills one side → user-facing 500s on hot paths under concurrency. No corruption, but it's exactly the cycle the documented lock discipline was added to prevent — and `computeSpendableOnezeUnits`'s new `FOR UPDATE` on reservations makes the collision real where none existed before.

### P1-2 — Multi-entity locks are acquired in caller order, not canonical order, in three places

- **`index.ts:22914-22922` (transfer):** `ensureWallet(sender)` then `ensureWallet(recipient)` run **before** `lockWalletRowsForUpdate`. `ensureWallet`'s `INSERT ... ON CONFLICT DO UPDATE` (index.ts:3181-3202) takes a real row lock on each wallet — in sender→recipient order, i.e. arbitrary. Two opposite-direction transfers (A→B, B→A) can deadlock at the `ensureWallet` stage before the ordered helper is ever reached. The id-ordered lock exists but is undermined by the earlier unordered locks.
- **`routes/coOwn.ts` `applyCoOwnTransfer`:** `getCoOwnHoldingForUpdate(buyer)` then `(seller)` at **598-599**, and `debitCoOwnOnezeUnits(buyer)` (706) then `creditCoOwnOnezeUnits(seller)` (728) — holdings and wallets both locked buyer→seller rather than by id. Simultaneous opposite-direction trades between the same pair deadlock on `coOwn_holdings` and/or `wallets`.
- **`workers/handlers/coOwnDripExecutionHandler.ts:297`:** locks the **issuer** wallet (`lockCoOwnWalletForUser`) before the user's wallet+reservations at **317** — a different multi-wallet order than the trade path (buyer→seller), so DRIP ↔ trade between related parties can deadlock.

### P1-3 — P2P transfer context "single-use" is check-then-act with no lock and no unique constraint

`assertP2pTransferContextAuthorized` (walletMoneyPath.ts:733-751) enforces single-use with a plain `SELECT 1 FROM wallet_ize_transfers WHERE status='committed' AND metadata->>'contextType'=$1 AND metadata->>'contextId'=$2`. `wallet_ize_transfers` (migration 014:44-70) has **no unique index** on the context pair, and the `coOwn_trades` row read at **639-659** is not `FOR UPDATE`. Two concurrent transfers carrying the same `coOwn_trade` context (different or absent idempotency keys — the claim layer only dedups same-key retries) both pass the check and both commit: the seller is credited twice for one trade. Needs a unique partial index on `(metadata->>'contextType', metadata->>'contextId') WHERE status='committed'` or a FOR UPDATE lock on the context anchor row.

### P1-4 — `denied` moderation state leaks to the author on the public questions read

Migration 332's contract: *"denied — hidden from everyone (reserved for operator takedown)"* (`332_listing_qa_moderation_state.sql:15-16`). But `GET /listings/:listingId/questions` returns a row to its asker regardless of state — `q.moderation_state = 'visible' OR q.asker_id = $2` (index.ts:17779) — and returns an answer to its author regardless of state — `answer_moderation_state = 'visible' OR answered_by = viewerId` (index.ts:17795). Operator-denied content stays visible to the person who posted it. Quarantined→author-visible is the documented intent; denied→author-visible contradicts the spec'd semantics. Either the doc or the predicate is wrong; on a moderation surface that's a contract violation.

---

## P2

1. **Post-commit idempotent save on withdraw-accept** — `index.ts:23572` COMMIT, then `saveWalletIdempotentResponse` at **23593-23601** runs in autocommit: non-atomic (the convert path's own comment at 22416-22418 forbids exactly this), and if it throws the catch returns 500 after funds moved. Self-heals via the `RESERVED` early-return, but violates the invariant.

2. **Advisory-lock release failure leaks the lease** — `searchSync.ts:786-796`: if `pg_advisory_unlock` fails while the pooled session survives, `lockClient.release()` returns a still-locked session to the pool → every subsequent reindex gets `reindex_in_progress` until that connection dies. Release with an error (`lockClient.release(err)`) to destroy the client on unlock failure.

3. **Swap task timeout misreports state** — `searchSync.ts:939-942`: `pollMeilisearchTask` timeout throws → reported `swapped:false`, but `swapIndexes` may complete server-side — the live name can be repointed while the result claims it wasn't.

4. **Throws outside the result contract** — `searchSync.ts:740` (`dbPool.connect()`) and `searchSync.ts:831` (`loadMeiliClient()`) run before the try blocks; failures propagate as exceptions to callers expecting `BlueGreenReindexResult`. (Lock release itself is correctly in `finally`, and every early return inside the locked body is covered — verified.)

5. **Per-document index calls in full reindex** — `searchSync.ts:264-275`: one `adapter.index()` HTTP round-trip per listing; no bulk addDocuments. Correct but O(N) requests — slow on large catalogs.

6. **Unbounded alert snapshot** — `coOwnAlertEvaluatorHandler.ts:71-79`: `SELECT ... WHERE active AND triggered_at IS NULL` with no LIMIT; the whole active set is materialized per pass. Also no partial index on `(active, triggered_at IS NULL)` (migration 106 indexes user_id/asset_id only).

7. **`ensureWallet` upsert writes a dead tuple per call** — `index.ts:3189-3190` `DO UPDATE SET user_id = EXCLUDED.user_id` produces a new row version on every invocation, on every money path → wallets-table bloat. It doubles as the row lock; a `SELECT ... FOR UPDATE` + conditional insert avoids the write.

8. **Reserve-route idempotency read is outside the txn, and expire-first silently kills the original reservation** — `getCoOwnReservationIdempotentResponse(db, ...)` at `coOwn.ts:3401` reads on the pool; two concurrent same-key requests both pass, then the second txn's expire-UPDATE (3417) expires the first caller's fresh `active` reservation. The first client is left holding a `reservationId` that immediately fails `CO_OWN_RESERVATION_INVALID` on placement (3906-3912). One hold is preserved (unique partial index 052:32-34), but a same-key retry invalidates the original response.

9. **330 backfill is a single unbatched UPDATE** — `330:93-99` decodes every NULL row in one transaction, 512 plpgsql iterations per row; long row-lock window on a large `media_embeddings`. Also `'public.media_embeddings'::regclass` (330:29) throws `undefined_table` if the table is ever absent — the feature-detection fails closed rather than no-op (narrow; 145 creates it). Down-migration is a documented deliberate no-op — acceptable, noted for completeness.

10. **332 lock/validation cost and guard gap** — `ADD COLUMN ... CHECK` requires a validation scan and `CREATE INDEX` (332:31-33) is non-concurrent — ACCESS EXCLUSIVE + SHARE locks on `listing_qa` for the duration (small table today; flag if it grows). `IF NOT EXISTS` also means a pre-existing column without the CHECK would silently keep no constraint.

11. **Soft-limit races (pre-existing class, still open)** — daily/weekly burn caps are read before the wallet lock (`index.ts:21848-21851` vs 21923); concurrent burns each under the cap both commit. Same shape for P2P jurisdiction daily/monthly reads. Compliance limits, not fund safety — but worth a row-lock or serialized check.

12. **`questionCount` asymmetry for the author** — listing detail counts only `moderation_state='visible'` (17432) while the list shows the asker's own quarantined rows (17779); an author sees a question the count excludes. Defensible ("public count"), but flag for consistency.

13. **Nits** — `Promise.all` over two `applyWalletLedgerDelta` on one client (index.ts:22928) serializes anyway; `Number(...) || 1` in the evaluator (coOwnAlertEvaluatorHandler.ts:193) masks a hypothetical seq=0; `AND id <> $2` with `''` at coOwn.ts:3494-3496 is dead code.

---

## Verified clean (adversarially checked, no finding)

- **Codec round-trip (330):** `writeFloatLE` ↔ the corrected bigint LE decoder is exact for normals, subnormals, ±0, Inf/NaN; the overflow analysis (int4 × 16777216 for high byte ≥ 128) is real and the fix correct. `embedding_vec` backfill predicate matches 326's.
- **331:** `ADD COLUMN IF NOT EXISTS ... DEFAULT 1` is metadata-only on PG ≥ 11 — safe on large tables; down-migration reverses. PATCH re-arm bumps seq only on triggered→re-arm (coOwn.ts:1059-1062); the evaluator re-reads seq under FOR UPDATE (180-187) and stamps dedup/idempotency keys `coown_price_alert:<id>:<seq>` (236-237) — exactly-once per activation is genuinely achieved. `INTEGER` ↔ `Number()` consistent.
- **Claim implementation:** `claimWalletIdempotencyKey` is correct — claim insert, conflict-block-then-read FOR UPDATE, hash-mismatch rejection, replay, 409 on pending; `completeWalletIdempotencyClaim` stores the response in the same txn (atomic commit) and refuses to commit an unrecorded mutation.
- **Transfer wallet order:** `lockWalletRowsForUpdate` locks `WHERE id = ANY(...) ORDER BY id FOR UPDATE` (walletMoneyPath.ts:213-222) — correct canonical order (see P1-2 for the ensureWallet gap before it).
- **Checkout/settle ordering:** intent → wallet → reservations is consistent across checkout (`index.ts:29206-29259`), `settlePaymentIntent` (7193-7226 intent FOR UPDATE before wallet work at 7538/7546), and the stale-submission reconciler (8101-8112). FX TOCTOU handled via `resolvedOnezeDebitQuote` (29308/7500-7515).
- **Q&A filtering consistency:** count (17432), answered count (17459), summary counts + `latest_activity_at` (17694-17717 — held answers don't leak timestamps), GET list (17778-17796), question write (17844), answer write (17923-17942) all apply the state vocabulary uniformly; `'review'`/`'failed'` → `hold` → `quarantined` is fail-closed. Existing `listing_qa_listing_created_idx` covers the public read; the new partial index serves the operator surface.
- **Reindex lease:** `pg_try_advisory_lock` on a dedicated session, released in `finally` on every exit path including early returns and verification failure (searchSync.ts:740-797). `awaitTasks` genuinely gates all staged settings writes before swap (864-867 + 133-143); settle-poll + staged-count verification + embedder check precede `swapIndexes`; swap is atomic; catch-up replay uses a DB-clock watermark; prune keeps the rollback snapshot.
- **Actor-context auth on co-own reserve/order:** body `userId` is enforced against `authUser` by the global preHandler (`index.ts:1830-1837` + `resolveActorUserId`/`BODY_ACTOR_KEYS` 1364-1373, 1647-1671) — not a bypass despite the routes reading `payload.userId` directly.
- **Withdrawal row lock:** `loadWithdrawalById(..., { forUpdate: true })` (23434) serializes accept; `canTransitionWithdrawalStatus` gates QUOTED→RESERVED.

## Bottom line

The new primitives (claim-based idempotency, `computeSpendableOnezeUnits`, blue/green lease) are individually well-built and mostly correctly used where applied — but the campaign is **inconsistent**: the idempotency fix covers only the transfer route while burn/convert/buy keep the documented double-spend; the wallet→reservations lock order is violated by the reserve expire-UPDATE and the order-path reservation lock; and editing migration 326 in place under a checksum-verifying runner can wedge deploys on exactly the databases 330 targets. **FAIL** until P0-1 is reverted/re-scoped, P0-2 is rolled out to all wallet-mutating routes, and the P1 lock inversions are brought to canonical order.
