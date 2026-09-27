# Wave 3 Verification Review — Adversarial Audit of Changed Tree

**Scope:** Fresh adversarial review of the changed tree for **new** P0/P1 defects not covered by waves 1–2: payment-intent lifecycle beyond auctions (mint/confirm/cancel/refund, amount/currency authority, cross-user minting, metadata ingest coverage), changed workers (coOwn alert evaluator, DRIP execution, outbox drain, auction sweep, backup expiry), migration chain `326(frozen) → 330 → 331 → 332 → 333 → 334`, frontend checkout/replay truthfulness, cross-cutting auth/rate-limit/validation, and test strength.

**Method:** Read-only trace of working-tree source. No source files were edited.

**HEAD:** `76c0733f8fca7424ad5bfb51c81d2a71a36e866f` — branch `feat/product-detail-contract-media-device-closure`

---

## Overall verdict: PASS-WITH-FINDINGS

One new **P1**: `POST /payments/intents/:intentId/confirm` merges the client-supplied `payload` object into `payment_intents.metadata` with **no sanitization**, reopening the reserved-key boundary that `sanitizePaymentIntentClientMetadata` closed at the create route. An intent owner can forge the server-owned auction binding (`auctionId`, `winnerBidderId`, `initiatedByRole`) during a reachable nonterminal transition, squat the winner's payment slot via the metadata-keyed replay query, and force-flake a winner to buy the item at their own lower second-chance bid.

No new P0 found. Workers, migrations, mint-quote provenance, and the checkout/replay frontend hold up. One P2 liveness gap (outbox `processing` claims have no lease/reaper) and a positive verification (the wave-2 P2P lock-order residual is now fixed) are recorded below.

| # | Area | Verdict |
|---|------|---------|
| 1 | `/payments/intents/:id/confirm` metadata provenance | **P1 — FAILING** (§1) |
| 2 | Mint/confirm/cancel/refund lifecycle, amount & ownership authority | PASS (§2) |
| 3 | Changed workers — retry/crash/ack semantics | PASS; one P2 observation (§3) |
| 4 | Migration chain 326→334 ordering & dependencies | PASS (§4) |
| 5 | Frontend — CheckoutScreen, useCheckoutPaymentFlow, LiveStreamReplayScreen | PASS (§5) |
| 6 | Cross-cutting — auth, rate limit, validation, response contracts | PASS (§6) |
| 7 | Test quality — regression-detection holes | P2 — missing confirm-metadata coverage (§7) |
| 8 | Wave-2 residual re-check — P2P lock ordering | **FIXED** (§8) |

---

## 1. P1 — `/payments/intents/:intentId/confirm` writes unsanitized client keys into `payment_intents.metadata`

**Severity:** P1 — authorization/provenance bypass on the auction money path; reliable exploitation requires only an authenticated account and one cheap wallet-topup intent.

**Locations:**

- `backend/api/src/index.ts:29802–29813` — confirm body schema accepts `payload: z.record(z.unknown()).optional()` — arbitrary keys, no denylist.
- `backend/api/src/index.ts:29905–29916` — the `simulateStatus === 'processing'` branch builds `metadataPatch: { source: 'manual_confirm', ...(payload.payload ?? {}) }`.
- `backend/api/src/index.ts:8587` — `transitionPaymentIntentStatus` persists the patch verbatim: `metadata = COALESCE(metadata, '{}'::jsonb) || $8::jsonb`.
- `backend/api/src/index.ts:8557–8560` — `requires_confirmation → processing` and `provider_submission_pending → processing` are permitted owner transitions; the only gates are ownership (29859–29866) and the admin/maker-checker check for *terminal* statuses (29868–29903), which does not run for `processing`.
- Consumers that trust the forged metadata:
  - `backend/api/src/routes/auctions.ts:830–843` — winner-pay Phase-B replay selects `payment_intents` by `metadata->>'auctionId'` **and** `metadata->>'winnerBidderId'` with **no `user_id` filter**, ordered so a live intent outranks terminal ones.
  - `backend/api/src/routes/auctions.ts:907–917` — any nonterminal match returns `paymentStatus: 'pending'` and short-circuits Phase C (the winner never mints their own intent); `revealSecrets` is false for non-owners, so the winner cannot complete the shadowing intent either.
  - `backend/api/src/routes/auctions.ts:221–241` — `settleAuctionWinForVerifiedIntent` trusts `metadata.winnerBidderId` and `metadata.initiatedByRole === 'admin'` as server-written provenance. The adjacent comments (213–220, 233–237) state both assumptions: reserved keys "are stripped from client payloads at ingest" and "`initiatedByRole` is server-written; clients cannot set it". The confirm route falsifies both.
  - `backend/api/src/routes/auctions.ts:989–1002` — the intended server-side binding write.

**Exploit — winner force-flake / auction-payment squat:**

1. Attacker loses an auction to winner W. `auctionId` and `winnerBidderId` are public: the auction detail payload exposes `auction_winner_id` and public bid history exposes `bidder_id` (index.ts ~36386, 37012, 38559, 38660).
2. Attacker mints a generic `wallet_topup` intent (no `orderId` — index.ts:29182–29199). Razorpay/Mollie/`oneze_internal` gateways return `initialStatus: 'requires_confirmation'` (index.ts:6554, 6642, 6717, 6767, 6793); a Stripe intent with an attached instrument also lands there; `provider_submission_pending` intents are equally exploitable.
3. `POST /payments/intents/:id/confirm` with `simulateStatus: 'processing'` and `payload: { auctionId, winnerBidderId: "<W>", initiatedByRole: "admin" }`. The transition is legal, ownership passes, and the forged keys merge into `payment_intents.metadata` unsanitized.
4. W calls `POST /auctions/:id/payment`. Phase B (auctions.ts:830–843, 907–917) matches the attacker's forged live intent — `ORDER BY` prefers nonterminal rows and `created_at DESC` means the attacker can shadow even a pre-existing legitimate intent by forging after it — returns `'pending'` with secrets redacted, and Phase C is never reached. W is permanently unable to pay; migration 334's partial unique index on `(auctionId, winnerBidderId)` additionally guarantees a binding collision if W's own intent is minted through a path that skips Phase B.
5. The payment deadline lapses; `auctionSweepHandler` expires the win and advances the second-chance offer to the next-highest bidder — the attacker — who buys at their own lower bid. Net effect: the attacker converts a lost auction into a win below the clearing price, at the cost of one un-captured £1 topup intent.

Secondary impact: forging `initiatedByRole: 'admin'` defeats the `payer_not_winner` guard at auctions.ts:236–241 — an attacker who *does* capture the winning amount on the forged intent settles the auction as a non-winner (griefing/settlement manipulation), proving the server-only provenance key is compromised end-to-end.

**Why create-route sanitization does not help:** `POST /payments/intents` runs `sanitizePaymentIntentClientMetadata`, but that only covers the INSERT. `transitionPaymentIntentStatus`'s early returns (index.ts:8539–8554) protect only idempotent/terminal replays — a legal `requires_confirmation → processing` transition applies `metadataPatch` unconditionally. `/confirm` is a second ingest point that was never wired to the sanitizer.

**Fix direction:** do not let `/confirm` write client keys into `payment_intents.metadata` at all — route `payload.payload` to `payment_attempts.raw_payload` (as the terminal branch already does at index.ts:29934–29940) or pass it through `sanitizePaymentIntentClientMetadata`/`PAYMENT_INTENT_CLIENT_METADATA_DENYLIST` before merging. Add a regression test: confirm an owner `processing` transition carrying `{auctionId, winnerBidderId, initiatedByRole:'admin', mintQuote, mintQuoteMac}` leaves metadata untouched and cannot shadow `POST /auctions/:id/payment` Phase B.

---

## 2. Payment-intent lifecycle — PASS

- **Cross-user minting:** create route binds `orderId`/`coOwnOrderId` to the authenticated actor with ownership checks; wallet channels carry no order linkage (index.ts:29182–29253). `instrumentId` is ownership-verified (29234–29253).
- **Amount/currency authority:** canonical `money.minorAmount` wins; `amountGbp`/`money` mutual-exclusion and GBP-only legacy checks at 28711–28730; webhook capture compares provider amounts against `amount_minor`.
- **Terminal status authority:** `succeeded/failed/cancelled` via `/confirm` require admin + production maker-checker (29856–29903); owner `processing` is intentionally non-terminal — its danger is confined to the §1 metadata leak, not status authority.
- **Refunds:** `/payments/intents/:id/refunds` is admin-gated with remaining-refundable enforcement (30020+).
- **Mint quote provenance:** `materializeMintOperationForPaymentIntent` (walletMoneyPath.ts:1166–1292) MAC-verifies quote fields bound to intent+user, compares quoted fiat to `intent.amount_minor`, and recomputes allocation/units from captured amount — the wave-1 forged-quote path stays closed.
- **Metadata ingest coverage:** audited all `payment_intents.metadata` writes — INSERT (sanitized), `transitionPaymentIntentStatus` callers at 8160 (server-fixed keys) and 31420 (provider-webhook fixed keys) are safe; the terminal `/confirm` branch sends `payload.payload` to `payment_attempts.raw_payload` (audit-only, admin-only — safe). The single unsafe ingest is §1.

## 3. Changed workers — PASS with one P2

- **`coOwnAlertEvaluatorHandler`:** bounded 500-alert batch; per-alert transaction re-locks `FOR UPDATE`, re-reads `activation_seq`, computes price from last settled trade, flips state + appends outbox event atomically; per-alert errors roll back without aborting the batch; activation seq feeds dedup keys. Clean.
- **`coOwnDripExecutionHandler`:** per-distribution transactions; wallets locked in canonical `ORDER BY id FOR UPDATE` (300–309); issuer-wallet-missing fails before any debit; reinvestment trade, holding update, `available_units` decrement (clamped under the asset lock), distribution state, and receipt outbox commit atomically; transient errors rethrow for retry, permanent errors mark `reinvest_failed`; payer-rounds-up/payee-rounds-down keeps debits ≥ credits.
- **`auctionSweepHandler`:** `FOR UPDATE SKIP LOCKED`; excluded-bidder tracking prevents second-chance loops; accept path validates recipient, deadline, and reprices `current_bid_gbp` to the accepter's actual bid. Minor pre-existing wart: notifications/realtime are emitted inside the sweep transaction, so a late rollback could phantom-notify — unchanged this wave, noted for completeness.
- **`backupExpiryHandler`:** requires `S3_BACKUP_BUCKET`; 100k-object inventory cap; missing config, inventory errors, and truncation all map to `purge_failed`; `purged_at` is only set when no object post-dates `erased_at`. Fail-closed.
- **`outboxDrainHandler` / `domainOutbox` — P2 liveness gap:** `claimDomainOutboxBatch` flips `pending → processing` under `FOR UPDATE SKIP LOCKED` and commits (domainOutbox.ts:~113). Completion/failure is applied per-event afterward. A worker crash between claim and completion strands events in `processing` **forever**: the claim query only selects `status='pending'`, and no stale-claim reaper exists anywhere in the tree (grep across `src/` confirms only the claim site writes `processing`). Stranded events include money-relevant notifications (`payment.*`, offer, DRIP, price-alert). Impact is notification-delivery loss, not fund corruption — P2. **Fix:** lease `processing` claims (`locked_at` + visibility timeout requeue in the claim query or a sweeper), mirroring the `payment_intents` stale-submission reconciler pattern at index.ts:7954+.

## 4. Migration chain `326 → 334` — PASS

- 326 remains frozen (empty diff); 330 repairs the bytea codec via `CREATE OR REPLACE`, bigint promotion, and pgvector feature-detection — verified in wave 2, unchanged.
- 331 (`coOwn_price_alerts.activation_seq`) depends on migration 106's table — ordering valid.
- 332 (`listing_qa` moderation state + partial index) depends on migration 065's table; additive, `IF NOT EXISTS`-guarded.
- 333 partial unique index on `wallet_ize_transfers` (single-use committed contexts) depends on 014/015 — valid; matches the server-side context override at index.ts:23092–23102 where the authorized `contextType/contextId` pair is written *after* `payload.metadata` so client keys cannot launder privileged contexts.
- 334 partial unique index on `payment_intents` `(metadata->>'auctionId', metadata->>'winnerBidderId')` for non-terminal statuses — valid dependency; note it *strengthens* the §1 squat (forged live intent blocks the winner's binding write) but is itself correct.
- No forward references, invalid index expressions, or down-migration drift found on fresh-database ordering.

## 5. Frontend — PASS

- **`CheckoutScreen` / `useCheckoutPaymentFlow`:** `isSubmittingRef` blocks double-tap; `paymentAttemptRef` epochs discard stale async responses; `pendingIntentIdRef` tracks in-flight intents; terminal failures refetch order state and distinguish released/insufficient-wallet/seller-unavailable/sold/retryable; Platform Pay uses a separate tender branch. No double-charge or pending-to-failure hole found.
- **`LiveStreamReplayScreen` (550 lines, audited in full):** monotonic `loadEpochRef` guards every fetch including retries (197–229, 260–279); missing `sessionId` → not-found (203–207); `status!=='ended'` → honest live/not-ended states (350–361); `recordingEnabled && !recordingUrl` → processing with re-check (374–389); playback error refetches the replay payload for a fresh signed URL and remounts the player via `key` (394–417) instead of replaying the expired URL; `.m3u8` gets `contentType:'hls'` (84–88) and native controls handle seeking. Clean.

## 6. Cross-cutting — PASS

- All payment-intent mutations require `request.authUser` with owner-or-admin checks; global `@fastify/rate-limit` is registered (index.ts:650) and the new payment routes inherit it (per-route overrides exist only where needed, e.g. webhook exemptions).
- `payment_attempts.raw_payload` and server-owned `canonicalMoney` fields are server-computed; client `rawPayload` reaches only audit columns.
- Response-shape spot-check between auction payment responses (`paymentStatus: 'pending'|'paid'`, `intent` payload with `revealSecrets` gating) and frontend consumers shows no drift.

## 7. Test quality — P2 coverage hole

`walletMoneyPath.test.ts` (967 lines), `auctionPaymentSettlement.test.ts` (858 lines), and `searchPublicVisibility.test.ts` (288 lines) cover idempotent replay, forged mint-quote rejection, MAC intent/user binding, amount recomputation, winner-only initiation, verified-capture settlement, winner/amount mismatch, seller suspension, admin settlement, secret redaction, and public-visibility exclusion.

**Hole:** no test exercises `/payments/intents/:intentId/confirm` with a client `payload` carrying reserved keys — `manual_confirm` appears only in source (index.ts:29913/29935/29946), never in `__tests__`/`integration`. A regression that re-opens (or fails to close) the §1 provenance boundary would pass CI green. Add: owner `processing` confirm with `{auctionId, winnerBidderId, initiatedByRole:'admin', mintQuote, mintQuoteMac}` → assert metadata unchanged and Phase-B replay unaffected.

## 8. Wave-2 residual re-check — P2P lock ordering is now FIXED

Wave 2 flagged that `/wallet/1ze/transfer` first-acquired wallet locks in `user_id` order (via per-party `ensureWallet`) while trade/DRIP paths canonically lock `ORDER BY wallets.id`. The current tree first-acquires both wallet rows in a **single** `SELECT ... WHERE user_id = ANY($1) ORDER BY id FOR UPDATE` (index.ts:23111–23121), then inserts missing wallets in deterministic order — the DRIP pattern, exactly the wave-2 fix direction. The ABBA inversion is closed.

---

## Finding register

| ID | Severity | Location | Summary |
|----|----------|----------|---------|
| W3-1 | **P1** | index.ts:29905–29916 → 8587; consumed at auctions.ts:830–843, 907–917, 221–241 | `/confirm` merges unsanitized client `payload` into `payment_intents.metadata`; forged `auctionId`/`winnerBidderId`/`initiatedByRole` enables auction-payment squatting (force-flake winner → buy at lower second-chance bid) and defeats `payer_not_winner` provenance |
| W3-2 | P2 | domainOutbox.ts:~113 + outboxDrainHandler.ts | Claimed `processing` outbox events have no lease/reaper — worker crash strands events permanently (notification loss, incl. payment/offer events) |
| W3-3 | P2 | test suite | No regression test for reserved-key injection via `/confirm` metadata — §1 could regress undetected |

**Verdict: PASS-WITH-FINDINGS** — ship-blocking only if the auction payment path is in the release's money scope (it is); W3-1 should be closed before release sign-off.
