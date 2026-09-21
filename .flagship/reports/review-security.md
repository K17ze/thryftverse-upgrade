# Security & Financial Integrity Review — Thryftverse Campaign

**Scope:** Adversarial, read-only audit of the working tree at `C:/Users/User/Desktop/thryftverse-upgrade` (HEAD `3c702e32`).
**Claims audited:** (1) auction winner payment settles only after provider-verified success; (2) unsigned Mollie webhooks verified server-side, retrieval outage → 503 before `db.connect`; (3) spendable-balance gating, claim-before-mutate idempotency, single-use P2P contexts; (4) segment-aware Co-Own debits, explicit missing-wallet failure, versioned GBP↔1ZE quotes; (5) SSRF protections with DNS pinning, per-hop blocklists, bounded bodies; (6) Rekognition sends only `Image.Bytes`/`S3Object`, ≤5 MB JPEG/PNG.
**Method:** full diff scan of all modified files, plus deep tracing of every money-path caller, webhook state machine, lock ordering, and metadata provenance. Claims were tested against actual control flow, not comments.

---

## Findings

### P0 — Client-controlled payment metadata forges the mint quote: pay £1, mint arbitrary 1ZE

**Evidence:**
- `backend/api/src/index.ts:29075` — `POST /payments/intents` accepts `metadata: z.record(z.unknown()).optional()` on **every** channel, including `wallet_topup`.
- `backend/api/src/index.ts:29175` — caller metadata is passed into provider intent creation and persisted to `payment_intents.metadata`.
- `backend/api/src/index.ts:20800–20892` — `/wallet/1ze/mint/quote` builds server metadata `{ mintOperationId, quoteHash, mintQuote: {...}, ...(payload.metadata ?? {}) }`. The spread of `payload.metadata` comes **after** `mintQuote`, so caller-supplied `mintQuote` overwrites the server-computed quote entirely.
- `backend/api/src/lib/walletMoneyPath.ts:1152–1263` (`materializeMintOperationForPaymentIntent`) — reads `metadata.mintQuote` off the intent, converts `izeAmountUnits`/`ratePerGram`/`fiatAmountMinor` with `decimalToMinorUnits`, and inserts the `mint_operations` row. There is **no recompute against `intent.amount_minor`, no comparison of `fiatAmountMinor` to the amount actually paid, and no MAC/HMAC on `quoteHash`** — `quoteHash` is a `createHash('sha256')` digest of metadata any client can produce (`index.ts:21081` and `20830`).
- `backend/api/src/index.ts:11788` — the reserve-allocation worker credits `ize_amount_units` straight into the wallet via `applyWalletLedgerDelta`.

**Impact:** A user creates a `wallet_topup` intent via the generic `POST /payments/intents` (or calls the mint-quote route with crafted `metadata.mintQuote`), paying £1 through a real gateway (Stripe/Razorpay/Mollie — all allowed for `wallet_topup` per `countryCapabilityPolicy.ts`). On the genuine `payment.succeeded` webhook, `processMintOperationPaymentWebhook` (`index.ts:31138`) materializes the forged quote and credits, e.g., 10⁹ units. Arbitrary minting of the platform's gold-backed currency.

**Why the claim fails:** "claim-before-mutate" protects against *duplicate* mutation; nothing authenticates the *content* being claimed. The mint materializer trusts metadata fields it must treat as untrusted.

**Fix:** compute `izeAmountUnits` from `intent.amount_minor` + server-side rate at materialization time (or HMAC the quote server-side and reject mismatches); strip `mintQuote`/`quoteHash`/`auctionId`/`winnerBidderId` from client metadata at ingest.

---

### P1 — Client metadata can hijack auction settlement binding (`auctionId` / `winnerBidderId`)

**Evidence:**
- `backend/api/src/index.ts:29075, 29175` — arbitrary metadata lands in `payment_intents.metadata` (same sink as above).
- `backend/api/src/routes/auctions.ts:838–840, 897–901` — `settleAuctionWinForVerifiedIntent` resolves `boundAuctionId` from `intent.metadata.auctionId`; `boundWinnerId` from `metadata.winnerBidderId ?? auction.winner_bidder_id`. **Winner binding is optional:** if `winnerBidderId` is absent, the intent binds to whoever is current winner, and `intent.user_id` is never compared to the winner.
- `backend/api/src/routes/auctions.ts:1269–1270` — `POST /auctions/:auctionId/payment` Phase-A lookup finds "any intent bound to this auction via `metadata->>'auctionId'`", `ORDER BY created_at DESC LIMIT 1`.

**Impact:** (a) Any authenticated user can create a `commerce` intent with `metadata.auctionId = <victim auction>`; if they complete it with an amount matching `current_bid_gbp`, the winner check is satisfied *only* when they also set `winnerBidderId` — and they can set it to the victim's id (free-form). The Phase-A query then returns *their* intent to the winner (`client_secret` hand-off / hijack). (b) An intent with `auctionId` set but no `winnerBidderId` settles for **whoever the current winner is** — the "winner binding" claim is a default, not an enforcement. (c) An attacker's *newer non-terminal* intent shadows the winner's succeeded intent in `ORDER BY created_at DESC LIMIT 1`, breaking the self-heal path.

**Status:** Confirmed bypass of "winner-bound" claim.

---

### P1 — `wallet_ize_transfers` context metadata is client-overridable; "single-use context" is also racy

**Evidence:**
- `backend/api/src/index.ts:22896` — `recordIzeTransfer` persists `metadata: { contextType, contextId, contextRole, expectedAmountUnits, ...(payload.metadata ?? {}) }` — caller metadata **overrides** the authorized context fields.
- `backend/api/src/index.ts:22775–22810` — `evaluateP2pPolicyEligibility` enforces single-use by a `SELECT` over `wallet_ize_transfers.metadata` (line ~1227 of `walletMoneyPath.ts`), but `recordIzeTransfer` only inserts at `index.ts:22876` — the check and the insert are **not** in one claim; there is no unique index on the context fields (`014_ize_p2p_transfers.sql:63–69` has only btree indexes, no UNIQUE).

**Impact:** (a) `assertP2pTransferContextAuthorized` reads `record.context_type` from the row it just inserted — the row stores whatever `payload.metadata.contextType` said, so an attacker who settled *any* `coOwn_trade` can stamp `contextType='platform_reward'` / any `contextId` and launder transfers under a privileged label; repeated transfers are unbounded because each new row just needs `payload.metadata.contextId` to differ from prior *stored* values, and the stored value is attacker-controlled anyway. (b) Even without clobbering, two concurrent transfers race the `SELECT` — both pass before either commits (the insert happens before wallet locks are taken at `index.ts:22922`, and rows are invisible to the other tx until COMMIT). One settled trade authorizes N transfers.

**Status:** Confirmed. "Privileged contexts authorized and single-use" is neither.

---

### P1 — Second-chance winner can be charged the *previous* winner's bid

**Evidence:**
- `backend/api/src/routes/auctions.ts:1176–1185` — `POST /auctions/:id/second-chance/accept` sets `status='awaiting_payment'` and clears `second_chance_offered_to`, but **never updates `current_bid_gbp` to the accepting bidder's bid** — it only verifies the user's bid exists (`1171–1174`).
- `backend/api/src/routes/auctions.ts:817–821` — settlement requires `intent.amount_gbp === Number(auction.current_bid_gbp)` and amount binding uses `current_bid_gbp`.

**Impact:** If winner A bid £500 and flakes, second-chance bidder B (bid £400) accepts; `current_bid_gbp` may still be £500 (only true if `highest_bid_gbp` was refreshed — `1128` computes `nextHighestBidGbp` but the UPDATE at `1176` doesn't set `current_bid_gbp`). B's payment intent is minted/validated against the stale amount — B is charged £500 for a £400 bid, or the intent amount mismatches and payment can never settle. This is a direct financial-harm bug in the payment path the campaign touched.

**Status:** Confirmed by reading the full UPDATE statement — `current_bid_gbp` is absent from the SET list.

---

### P1 — SSRF: IPv4-mapped hex/octal/decimal literals bypass `isDisallowedRemoteAddress`

**Evidence:**
- `backend/api/src/lib/safeRemoteMediaFetch.ts:90–115` — `normalizeRemoteAddress` only strips `::ffff:` when the tail is **dotted IPv4**. `isDisallowedRemoteAddress` (`lib/remoteMediaGuards.ts:41–89`) checks the literal string `'::ffff:7f00:1'`/`'::ffff:127.0.0.1'` style forms only via dotted-IPv4 parse; `parseRemoteIp` (`remoteMediaGuards.ts:23–38`) does not accept hex/octal/decimal tail forms at all.
- Therefore `http://[::ffff:7f00:1]/`, `http://[::ffff:0x7f.0.0.1]/` style redirects pass the blocklist; `pinnedLookup` (`safeRemoteMediaFetch.ts:222`) then calls `resolveRemoteHostname` on the bracketless literal → `dns.lookup('::ffff:7f00:1')` returns the mapped address → Node undici connects to `127.0.0.1`.

**Impact:** A redirect hop to a mapped-IPv4 non-dotted literal reaches loopback/private space — the exact class the "IPv6 and unusual representations cannot bypass" claim asserts is closed. The earlier claim against `2130706433`-style decimal literals is handled at the URL layer by `publicAddressForRemoteUrl`, but the `::ffff:`-with-integer-tail form is not canonicalized before `isDisallowedRemoteAddress`.

**Status:** Confirmed. All other tested vectors (redirect revalidation per hop, shared deadline `fetchStartedAt` at `277`, bounded body `331–370`, `UndiciAgent` lookup actually used in `request()` at `317–330`, `S3Object` path pinned via `resolveS3ObjectPublicAddress` `remoteImport.ts:50`) hold.

---

### P1 — Legacy read-then-write wallet idempotency still wraps five mutation paths

**Evidence:** `walletMoneyPath.ts:357–426` (`getWalletIdempotentResponse` / `saveWalletIdempotentResponse`) uses SELECT-then-INSERT-ON-CONFLICT-DO-NOTHING. Routes still on the legacy pattern: `index.ts:20892` (mint/quote — though it delegates to intents idem), `index.ts:21477` (gold redemption), `index.ts:21779, 22004` (burn flow), `index.ts:22196` (convert), `index.ts:22420` (buy 1ZE), `index.ts:22511` (redeem-by-usd), `index.ts:23421` (withdrawal request). Only the P2P transfer (`index.ts:22761`) uses `claimWalletIdempotencyKey`.

**Impact:** Two concurrent requests with the same key both read `null`, both mutate (burn/convert/withdrawal debit), and one `saveWalletIdempotentResponse` silently loses the conflict. `completeWalletIdempotencyClaim` stores a payload hash to *detect* mismatched bodies; the legacy path cannot even detect them. The claim "claim-before-mutate idempotency is used" is true for one route of eight.

**Status:** Confirmed — real double-spend window wherever no secondary unique constraint intervenes (e.g., `withdrawals` idempotency index is on `idempotency_key` of a different table, not `wallet_idempotency`).

---

### P2 — `POST /payments/intents` leaks `client_secret` to the seller of the bound auction

**Evidence:** `backend/api/src/routes/auctions.ts:1588` — `GET /payment-status` returns `client_secret` for any `activeIntent`; the seller-reach branch (`1529`) still reaches it (the `requires_payment`/`settled` blocks return early only for specific states; a `pending` intent falls through to the shared response builder at `1570–1595`).

**Impact:** Seller can pass an intent to Stripe confirmation. Combined with the winner-collision check the claim describes, secrets should be emitted only to `intent.user_id === requester`.

---

### P2 — `payment-status` reports `paid` for a succeeded intent whose settlement was skipped

**Evidence:** `auctions.ts:1513–1521` — when `intent.status==='succeeded'` but the self-heal `settleAuctionWinForVerifiedIntent` throws non-`AUCTION_ALREADY_SETTLED` (e.g., `AUCTION_PAYMENT_AMOUNT_MISMATCH` from a forged `auctionId` on an unrelated intent), the code logs and continues, then `deriveAuctionPaymentStatus` returns `'paid'` with `winner_paid=true`.

**Impact:** UI lies to buyer/seller that payment settled. Also `deriveAuctionPaymentStatus` treats `expired` as `failed` while the auction still accepts payment — informational.

---

### P2 — `POST /payment` settled-replay runs before the winner check

**Evidence:** `auctions.ts:1304–1316` — `orderByAuction` lookup and the `status:'settled'` early-return happen **before** `auction.winner_bidder_id !== actorUserId` at `1337`. A non-winner learns the winner's `orderId`, `orderStatus`, `escrowStatus`, and (at `1297–1316`) gets `paymentStatus:'settled'`.

**Impact:** Information disclosure; the replay should be winner/admin-gated like the rest of the route.

---

### P2 — Concurrent winner payment mints (different client keys) create double live intents

**Evidence:** `auctions.ts:1378–1395` Phase-A → Phase-C with no unique constraint on `(metadata->>'auctionId', status)`; two simultaneous POSTs with different `idempotencyKey`s each see no intent and each mint one. Winner completes both → second capture is orphaned (can't settle twice — good — but money is captured and needs refund).

---

### P2 — DRIP handler locks issuer wallet before buyer wallet; opposite of every other debit path

**Evidence:** `coOwnDripExecutionHandler.ts:409–418` — `SELECT ... FOR UPDATE` on issuer wallet, then `loadWalletRow` on buyer. `coOwnSettlement.ts:190` and `settleCommerceOrderWithOneze` both lock **buyer/payer first**. Opposing lock order across two writers of the same pair = classic deadlock. Moderate likelihood: only fires when the drip issuer also holds a position being concurrently debited.

---

### P2 — `createGatewayPaymentIntent` contains a dead `oneze_internal → 'succeeded'` branch

**Evidence:** `index.ts:6513` returns `requires_confirmation` for `oneze_internal`; the identical gateway check at `index.ts:6746–6756` returns `initialStatus:'succeeded'` and is **unreachable**. If the ordering ever shifts, internal-gateway intents would be created `succeeded` without `settlePaymentIntent` — money-state divergence. Remove the dead branch.

---

### P2 — `rekognitionProvider` trusts `Content-Type` header when sniff fails, and proceeds on `unavailable` preflight

**Evidence:** `rekognitionProvider.ts:497` — `const sniffedType = fetched.sniffedContentType ?? fetched.contentTypeHeader ?? fetched.mimeType ?? 'application/octet-stream'` — an attacker serving `Content-Type: image/jpeg` on non-image bytes passes the `isAllowedRekognitionImageType` gate; the bytes go to Rekognition anyway (provider rejects — noise + cost, not breach). `evaluateRekognitionPreflight` returns `'unavailable'` on fetch failure (`512`) and the caller proceeds to the provider call for remote inputs; >5 MB **S3 objects** are rejected only via `content_length` head — chunked/unknown-length uploads slip the size gate to the provider. Claim "files over 5 MB or non-JPEG/PNG are refused preflight" is only true when the sniffed signature is decisive. `Image.Bytes`/`S3Object`-only verified clean (`185–260`).

---

### P2 — Webhook `payment_webhook_events` insert dedupes on `providerEventId` built from payload, not verified data

**Evidence:** `index.ts:30820–30834` — `INSERT ... ON CONFLICT DO NOTHING` uses `event.providerEventId` = `${eventType}:${paymentRef}`. For unsigned Mollie events both fields are now provider-derived (good), but the dedup happens before `settlePaymentIntent`; a replayed stored row whose `webhook_event_id` differs reprocesses — fine — while two *different* statuses for one payment (`payment.paid:tr_x` vs `payment.failed:tr_x`) are distinct keys, so a provider that emits both can flip a settled intent if its retrieval is spoofed upstream. Low residual risk; noted for completeness.

---

## Verified claims (no finding)

- **Auction settle** (`settleAuctionWinForVerifiedIntent`, `auctions.ts:798–930`): intent `FOR UPDATE` → `status==='succeeded'` → auction `FOR UPDATE` → `paid_at IS NULL` + `status='settled'` update + order insert + wallet ledger all in one transaction; replay returns idempotent `already_settled` with a fresh ledger repair pass. Duplicate settlement structurally impossible within the same DB.
- **Mollie unsigned path** (`paymentProviders.ts:836–896`): rejects non-`tr_*` refs, retrieves via `mollie.payments.get`, maps retrieval failure to `{retryable:true}` → webhook returns **503** at `index.ts:30797` — `db.connect()` happens at `30804`, so the outage 503 fires before any DB work. Signed events fail closed on bad HMAC. DLQ replay (`trustedStoredPayload`) still calls `retrieveMolliePaymentSnapshot` — no payload-trust path. `normalizeWebhookEvent` (the trusting path) is unreachable from live ingest.
- **Spendable gating**: `assertSpendableOnezeUnits`/`computeSpendableOnezeUnits` present on commerce settle (`index.ts:7546`), burn (`21923`), convert (`22240`), P2P (`22923`), withdrawal accept (`23494`), `oneze_internal` checkout (`29259`). Wallet row locked before reservations; reservations locked in `id` order; `lockWalletRowsForUpdate` orders multi-wallet locks by `wallet_id`. Verified.
- **Co-Own settlement** (`coOwnSettlement.ts:130–350`): single tx, deterministic wallet ordering, `assertCoOwnResalePermitted` lockup check, `applyWalletLedgerDelta` for both sides, earned segment drained before purchased (`earnedDebit` first), `WALLET_NOT_FOUND` on missing issuer. `computeCoOwnSettlementUnits` uses `Math.ceil` payer debit / `Math.floor` payee credit with versioned `coown_settlement_quotes` (route `coOwn.ts:854–890` uses the same quote for reservation and settlement). DRIP missing-issuer-wallet → `WALLET_NOT_FOUND` → `markJobRetry` → no partial mutation. Verified.
- **SSRF baseline**: per-hop `publicAddressForRemoteUrl` revalidation, shared deadline via `fetchStartedAt`, `MAX_REMOTE_MEDIA_BYTES` enforcement during streaming, `createPinnedLookupDispatcher` applied to the actual `request()` call (both `direct` and `dispatch` paths), `resolveS3ObjectPublicAddress` for S3 fetches. All present except the `::ffff:` hex-tail gap (P1).
- **ML service** (`backend/ml-service/app/main.py`): production now 503s on missing `DECISION_SERVICE_TOKEN`/`ADMIN_SERVICE_TOKEN` — fail-closed, no committed prod secret. Verified good change.

---

## Verdict

**FAIL**

Blocking issues: the forged-mintQuote path (P0) allows arbitrary 1ZE minting against a genuine £1 payment — the campaign's own claim that debits/credits are "settlement-verified" is false at the metadata layer. Winner binding, P2P single-use contexts, and the `::ffff:` SSRF variant all fail their stated claims. The report's own spending-limit and lock-ordering claims are largely met, but the payment-metadata provenance hole taints the auction, mint, and transfer paths simultaneously.
