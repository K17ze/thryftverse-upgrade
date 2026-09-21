# Wave 2 Verification Review — Repair Correctness Audit

**Scope:** Verify each Wave-1 repair (P0/P1 security, money-path, database, backend, search, auction, SSRF, frontend truthfulness findings) is real, complete, non-cosmetic, and free of regressions.

**Method:** Read-only trace of current working-tree source against repair reports R3–R7 and the original review findings. No source files were edited.

**HEAD:** `76c0733f8fca7424ad5bfb51c81d2a71a36e866f` — branch `feat/product-detail-contract-media-device-closure`

---

## Overall verdict: PASS-WITH-FINDINGS

All P0 repairs verify clean. Seven of eight P1 items verify clean. One residual defect remains: the P2P transfer route still first-acquires wallet row locks in **user_id order**, while the trade and DRIP paths canonically lock in **wallet_id order** — a cross-path ABBA inversion survives (§4). Postgres deadlock detection prevents corruption (one txn aborts with 40P01), so this is a liveness/robustness residual, not a fund-safety bug — but the inversion class the P1 targeted is not fully eliminated.

| # | Item | Verdict |
|---|------|---------|
| 1 | P0 — mint-quote recompute from `intent.amount_minor` | **VERIFIED** |
| 2 | P0 — claim-before-mutate idempotency on all 8 money routes | **VERIFIED** |
| 3 | P0 — migration 326 frozen; 330 codec repair | **VERIFIED** |
| 4 | P1 — wallet/reservation lock ordering | **PARTIAL** (residual cross-path inversion) |
| 5 | P1 — auction winner/amount binding + second-chance repricing | **VERIFIED** |
| 6 | P1 — SSRF canonicalization (`::ffff:`, numeric IP forms) | **VERIFIED** |
| 7 | P1 — `risk_pending` visibility + active-only search corpus | **VERIFIED** |
| 8 | P1 — frontend request epochs / stale-response guards | **VERIFIED** |
| 9 | Regression hunt — exports, signatures, payloads, test strength | **PASS** (no regressions found) |

---

## 1. P0 — Mint quote recomputation — VERIFIED

`materializeMintOperationForPaymentIntent` (`backend/api/src/lib/walletMoneyPath.ts:1166–1292`):

- Loads `intent.amount_minor` / `intent.amount_currency` from the payment_intents row — never trusts client amounts.
- Verifies the quote MAC via `verifyPaymentIntentMetadataMac` before trusting any quote field (`paymentIntentMetadata.ts:38–81, 109–145`); reserved keys (`mintQuote`, `mintQuoteMac`, `mintOperationId`, `quoteHash`, `auctionId`, `winnerBidderId`, `canonicalMoney`, `targetAssetAmount`, `quoteRateSource`) are server-owned and stripped from client payloads at ingest.
- Requires quote `fiatAmountMinor === intent.amount_minor` — a valid-MAC quote bound to a *different* capture amount fails closed.
- Recomputes through the identical pipeline as the quote route: `moneyFromMinor` → `allocateMoneyByBasisPoints(..., MINT_QUOTE_TOPUP_FEE_BASIS_POINTS)` → `moneyToMajorDecimal` → net fiat ÷ `ratePerGram` → `onezeAmountToUnits` (walletMoneyPath.ts:1260–1280). Any mismatch in fee, net, or units returns `null` — no mint materializes.
- Insert is `ON CONFLICT (payment_intent_id) DO NOTHING` — replay-safe.
- Fee constant shared: `MINT_QUOTE_TOPUP_FEE_BASIS_POINTS = 100` at walletMoneyPath.ts:1117; consumed by the quote route at index.ts:20942 and the materializer at walletMoneyPath.ts:1267 — single source of truth.
- Webhook path (index.ts:11423–11451) invokes the materializer before transitioning the mint operation. The legacy `/wallet/1ze/mint` route separately requires `assertSettledWalletTopupIntent` (index.ts:21631–21638) and uses a server-computed amount — no residual trusted-client-amount path found.

**Test evidence:** `walletMoneyPath.test.ts` — 18/18 pass in this environment, including "forged mint quote metadata (no valid MAC) never materializes", "a quote MAC bound to a different intent does not transplant", "a quote whose fiat amount exceeds the captured amount fails closed", "a valid-MAC quote whose izeAmountUnits does not recompute is rejected".

## 2. P0 — Idempotency claim-before-mutate — VERIFIED

All eight money routes claim inside the mutation transaction **before** the first money mutation. Pattern per route: `BEGIN` → request-hash → `claimWalletIdempotencyKey` → replay→COMMIT+stored payload / in_progress→COMMIT+409 / claimed→proceed → `completeWalletIdempotencyClaim` → `COMMIT`.

| Route | Claim | Replay/409 | Complete |
|-------|-------|-----------|----------|
| `/wallet/1ze/mint/quote` | index.ts:20971 (BEGIN ~20934) | 20978–20991 | ~21323 |
| `/wallet/1ze/mint` | index.ts:21595 (BEGIN 21577) | 21602–21615 | ~21767 |
| `/wallet/1ze/burn` | index.ts:~21913 | adjacent | ~22252 |
| `/wallet/1ze/convert` | index.ts:~22363 | adjacent | ~22498 |
| `/wallet/1ze/buy` | index.ts:~22686 | adjacent | ~22814 |
| `/wallet/1ze/transfer` (P2P) | index.ts:~22955 | adjacent | ~23233 |
| `/wallet/1ze/withdraw/quote` | index.ts:~23381 | adjacent | ~23571 |
| `/wallet/1ze/withdraw/accept` | index.ts:~23660 | adjacent | ~23828 (+ guarded post-commit queue-error correction ~23861) |

- Primitive `claimWalletIdempotencyKey` (walletMoneyPath.ts:435–604): `INSERT ... ON CONFLICT DO NOTHING` claim row with pending marker; on conflict `FOR UPDATE` read; request-hash mismatch → `IDEMPOTENCY_KEY_REUSED`; committed payload → replay; pending marker → `in_progress` → route returns HTTP 409.
- `completeWalletIdempotencyClaim` stores the response before COMMIT; a missing completion row yields `IDEMPOTENCY_CLAIM_LOST`, so a mutation cannot commit without a replayable payload.
- Pre-claim writes audited: mint route runs `ensureUserExists(actorUserId)` (index.ts:21578) before the claim — a user-row upsert, not a money mutation, and `ON CONFLICT`-safe; mint-quote runs only reads (fee breakdown, request hash, SELECTs) between BEGIN and claim. No route retains read-then-write idempotency.

## 3. P0 — Migration 326 freeze — VERIFIED

- `git diff` on `backend/api/src/db/migrations/326_media_embeddings_pgvector.sql` is **empty** (only a CRLF advisory) — the committed migration is untouched.
- `330_media_embeddings_bytea_codec_bigint.sql` repairs via `CREATE OR REPLACE FUNCTION _media_embeddings_bytea_le_to_float4`, promotes to bigint before multiplication, and backfills `WHERE embedding_vec IS NULL`; feature-detection makes it a no-op where pgvector is absent.
- `mediaEmbeddingPgvector.test.ts:626–635` enforces the freeze: asserts the corrected expression is absent from 326, the original committed int4 expression remains in 326, and remediation must ship via 330.

## 4. P1 — Lock ordering — PARTIAL (residual inversion)

**Fixed:**
- `applyCoOwnTransfer` (`backend/api/src/routes/coOwn.ts:766–790`): pre-reads wallet ids with a *non-locking* `SELECT ... WHERE user_id = ANY(...)`, then locks in canonical wallet-id order via `lockWalletRowsForUpdate`; buyer reservations next via `computeSpendableOnezeUnits` (777–780); holding rows last in deterministic user-id order (783–790). Wallet → reservations → holdings ordering respected.
- DRIP (`backend/api/src/workers/handlers/coOwnDripExecutionHandler.ts:300–309`): both wallets locked in a **single** `WHERE user_id = ANY(...) ORDER BY id FOR UPDATE` scan — canonical wallet-id order; missing issuer wallet fails the distribution before any debit (316–330); holding row locked after wallets+reservations (372–380).
- Reserve/placement routes: asset lock → wallet lock (`lockCoOwnWalletForUser`) → reservation rows — consistent tail order.

**Residual finding (W2-1):** The P2P transfer route's *first* wallet lock acquisition is `ensureWallet`'s `SELECT ... WHERE user_id = $1 FOR UPDATE` (index.ts:3205–3208) invoked sequentially in **user_id order** (index.ts:23111–23116). The `lockWalletRowsForUpdate` call at index.ts:23125 cannot reorder locks the transaction already holds — re-locking own-held rows is a no-op. Since `wallets.id` is `wal_${Date.now()}_${rand}` (index.ts:2143–2145) — uncorrelated with `user_id` — for any pair where user_id order and wallet.id order disagree (~50% of pairs), a P2P transfer between U1/U2 concurrent with a coOwn trade or DRIP touching the same two wallets forms a classic ABBA deadlock. The comment at index.ts:23105–23110 acknowledges `ensureWallet` "takes a real row lock in call order" but the chosen order (user_id) differs from the canonical order (wallet_id) used by every other multi-wallet path. **Fix direction:** mirror the DRIP pattern — first acquire both wallets via `WHERE user_id = ANY(...) ORDER BY id FOR UPDATE`, then `INSERT` any missing wallet (new rows cannot be lock-ordered against other txns).

*Severity note:* Postgres deadlock detection aborts one side (40P01 → rollback, no fund corruption); impact is sporadic transfer/trade failures under concurrent same-pair load, not incorrect balances. Classified PARTIAL rather than FAILED because intra-path ordering is correct and the failure mode is detected-and-aborted, but the inversion the P1 targeted is not fully eliminated.

## 5. P1 — Auction binding — VERIFIED

`settleAuctionWinForVerifiedIntent` (`backend/api/src/routes/auctions.ts:121–287`):

- Intent `FOR UPDATE` (125–138); requires `status='succeeded'` (153); auction `FOR UPDATE` (157–172).
- Hard rejects, all four present as non-bypassable early returns:
  - `winner_binding_missing` — auctions.ts:221–223 (auctionId present without winnerBidderId = never legitimately bound);
  - `winner_mismatch` — auctions.ts:228–229;
  - `payer_not_winner` — auctions.ts:236–241 (`intent.user_id !== auction.winner_bidder_id` rejected unless server-written `initiatedByRole === 'admin'` — clients cannot set it, reserved-key stripping enforced at ingest);
  - `amount_mismatch` — auctions.ts:243–247 (captured `intent.amount_gbp` vs `auction.current_bid_gbp`, 0.005 tolerance).
- Seller-suspension recheck at the money-moving point (253–256); settle UPDATE guarded by `paid_at IS NULL` (258–270) with stored-result replay on concurrent settle (272–287).
- Phase A winner-scoped: stored-attempt queries filter `metadata->>'auctionId' = $1 AND metadata->>'winnerBidderId' = $2` at auctions.ts:828–842 (winner-pay), 1030–1031, 1151–1152 — an intent minted for a previous winner never replays to a second-chance successor.
- Second-chance repricing: sweep `advanceSecondChanceOffer` sets `current_bid_gbp = $6 = next.amount_gbp` (auctionSweepHandler.ts:119–131); the accept route re-derives the offered bid, requires `offeredBid.bidder_id === userId` (auctions.ts:1337), and sets `current_bid_gbp = offeredBid.amount_gbp` (1349–1359) — the second-chance buyer pays *their* bid, never the flaked winner's.
- Migration 334 partial unique index `payment_intents_auction_live_uidx` on `(metadata->>'auctionId', metadata->>'winnerBidderId') WHERE ... status NOT IN ('failed','cancelled')` — one live attempt per (auction, winner).

**Test evidence:** `auctionPaymentSettlement.test.ts` — 21/21 pass, asserting all four skip reasons plus an end-to-end `amount_mismatch` (captured £10 vs current bid £50).

## 6. P1 — SSRF canonicalization — VERIFIED

`backend/api/src/lib/safeRemoteMediaFetch.ts`:

- `canonicalizeRemoteIpLiteral` (228–260): expands IPv6 literals; unwraps IPv4-mapped in **both** dotted (`::ffff:127.0.0.1`) and hex-pair (`::ffff:7f00:1`, `0:0:0:0:0:ffff:7f00:1`) forms (236–237), IPv4-compatible (`::7f00:1`), 6to4 `2002::/16` (245), Teredo `2001:0::/32` (249–250).
- inet_aton numeric IPv4 forms parsed at 156–212: bare decimal integer, `0x` hex, octal octets, and collapsed quads (`127.1`) — canonicalized to dotted quads *before* range tests so `getaddrinfo`-style reinterpretation cannot bypass the blocklist.
- Every predicate canonicalizes first: `isLoopbackIp` (263), `isPrivateIp` (297, 315–316), and the pre-flight host check (354–356). DNS resolution results are re-canonicalized per address (486); the pinned undici dispatcher connects to the canonical address (459–463); each redirect hop revalidates; a shared deadline covers DNS+headers+redirects+body; body is streamed with a byte cap and content-type is sniffed from magic bytes (380–427), not headers.

**Test evidence:** `safeRemoteMediaFetch.test.ts` — 38/38 pass under vitest, covering `::ffff:` hex/padded/dotted tails to 127.0.0.1/10.0.0.1/169.254.169.254, decimal/hex/octal/short-quad integers, redirect revalidation to a mapped address, and a positive public-mapped-literal case (`::ffff:5db8:d822` → 93.184.216.34). (Note: the file is Vitest-dialect — `vi.queueMock` — so `node --test` fails on it by design; run via `npx vitest run`.)

## 7. P1 — Visibility & search corpus — VERIFIED

- Detail read: `NON_PUBLIC_STATUSES = {'draft','paused','deleted','risk_pending'}` at index.ts:17454; non-owner/non-privileged viewers get 403 `LISTING_NOT_PUBLIC` (17455–17463).
- Index writes: `syncSingleListing` maintains an active-only corpus — any `status !== 'active'` (draft, paused, risk_pending, sold, deleted) is **evicted** via `adapter.remove`, not indexed (`backend/api/src/lib/searchSync.ts:324–333`), matching the full-sync and fallback-priming predicate.
- Write-path eviction: risk-held upsert evicts at index.ts:17158–17162 and 17348; risk-held PATCH evicts at 19162–19171; delete evicts with a logged catch.
- Serving re-checks: semantic hits and autocomplete suggestions are corroborated against `status='active'` rows (`backend/api/src/routes/search.ts:577–629, 719–737`); vector search forces `status:'active'` into the Meilisearch filter (`backend/api/src/lib/vectorSearch.ts:205–217`); lexical paths already filtered active.

**Test evidence:** `searchPublicVisibility.test.ts` — 6/6 pass (non-active hit dropped even for anonymous viewer; active-corroborated hit served; blocked sellers still excluded; autocomplete corroboration scoped to active rows).

## 8. P1 — Frontend request epochs — VERIFIED

- `useDiscoveryContent.ts:48–65` — `loadEpochRef`; stale loads return early, never write state.
- `BackendDataContext.tsx:74–150` — `refreshEpochRef` latest-wins guard plus `refreshInFlightRef` counting so only the last refresh clears loading state.
- `VisualSearchScreen.tsx:138` — clearing filters calls `void runSearch()` **directly** (no `setTimeout` deferral that could fire a stale filter payload); `useVisualSearchFilters.ts:53–179` keeps `filtersRef` as the synchronous source of truth that `runSearch` reads.
- Same treatment applied beyond the flagged files: `LiveShoppingHomeScreen.tsx:202–220`, `LiveStreamReplayScreen.tsx:197–276`.

**Test evidence:** `stateTruthfulnessRepairs.test.tsx` — 23/23 pass under vitest (epoch-drop assertions, direct `void runSearch()` source contract, timestamp-honesty cases).

## 9. Regression hunt — PASS

- **Exports:** the only `-export` diff lines are moves-in-place — `isLoopbackIp` (safeRemoteMediaFetch.ts:262), `isPrivateIp` (:294), `safeFetchMediaBuffer` (:824), `moderateListingText` (moderationService.ts:209) — all still exported with unchanged signatures; callers in `remoteImport.ts` and `bots.ts` unaffected. New export `listingTextGateAction` is additive.
- **Signatures/response shapes:** no changed public signatures or response-payload breakage observed in the diffs reviewed; route registration unchanged.
- **Silent-failure removal:** `.catch(() => {})` on search-index eviction/sync replaced with logged catches (index.ts diffs) — strictly an observability improvement.
- **Test integrity:** test diffs reviewed are *additions* — contract-pinning regexes for ANN lineage/rank preservation (`retrievalSourceContract.test.ts`), fallback-corpus coherence (`searchAdapterDegradation.test.ts`), forged-quote cases (`walletMoneyPath.test.ts`), all-four-reason settlement cases (`auctionPaymentSettlement.test.ts`), visibility re-checks (`searchPublicVisibility.test.ts`), and frontend truthfulness (`stateTruthfulnessRepairs.test.tsx`). No assertion was found weakened or fixture-twisted to pass.
- **Live test results this environment:** walletMoneyPath 18/18; searchPublicVisibility + auctionPaymentSettlement + coOwnDripSettlement 33/33; safeRemoteMediaFetch 38/38 (vitest); stateTruthfulnessRepairs 23/23 (vitest).

## Open finding for Wave 3

- **W2-1 (P1 residual):** P2P transfer first-acquires wallet locks in user_id order (`index.ts:23111–23116` via `ensureWallet` FOR UPDATE at `index.ts:3205–3208`) vs canonical wallet_id order in trade (`coOwn.ts:766–770`) and DRIP (`coOwnDripExecutionHandler.ts:300–309`). Reorder first acquisition to `WHERE user_id = ANY(...) ORDER BY id FOR UPDATE`, then insert any missing wallet row.

## Caveats

- Line numbers are current-working-tree positions; repair-report citations drifted ±a few lines but all claims traced to real code.
- `node --test` fails on Vitest-dialect suites (`vi.queueMock`) by design — run those via `npx vitest run`.
- Redis-adjacent suites may leave ioredis handles open (pre-existing; `--test-force-exit` used where applicable).
- No PR/merge status inferred; verdicts cover working-tree state only.
