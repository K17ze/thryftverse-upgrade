# Repair R4 — Security / Financial-Integrity Repair Report

Scope: findings in `.flagship/reports/review-security.md` — auction payment
binding, verified-capture settlement, P2P transfer contexts, mint-quote
metadata forgery, SSRF numeric-IP bypass, Rekognition untrusted Content-Type,
and payment-response secret hygiene.

Status: **complete** — `tsc --noEmit` clean, all focused suites green, full
unit + vitest suites re-run. Not committed. `.flagship` canonical files
untouched (`campaign.json`/`gap-registry.json` carry only their pre-existing
working-tree modifications; nothing under `.flagship` was edited by this
pass except this report).

This was a resumed pass. The earlier work in this thread had already landed
the verified-payment architecture (winner pay → provider intent → webhook
settlement) and most of the code edits; this pass inspected every hunk,
closed the remaining gaps, fixed two test-harness problems that masked real
failures, repaired the collateral test breakage, and verified end-to-end.

---

## 1. Verified-payment auction architecture (preserved)

`settleAuctionWinForVerifiedIntent` (`backend/api/src/routes/auctions.ts:121`)
is the single settle path, invoked from:

- the provider webhook inside the same transaction that marks the intent
  `succeeded` (`index.ts:31389-31400`),
- the winner-pay replay path (`auctions.ts` Phase B), and
- `GET /auctions/:auctionId/payment-status` self-heal (`auctions.ts:1173`).

Invariants verified:

- `intent.status === 'succeeded'` required — anything else returns
  `{ kind: 'skipped', reason: 'intent_status:…' }` (no auction mutation).
- `UPDATE auctions … WHERE paid_at IS NULL` guards the authoritative
  transition; a concurrent settle replays the stored result
  (`alreadySettled: true`).
- Order insert is guarded by `SELECT … WHERE auction_id = $1` and the
  listing/ledger writes run inside the caller's transaction
  (`runVerifiedAuctionSettlement` supplies one for non-tx callers).

## 2. Auction binding is now server-authoritative (review P0/P1)

### Hard winner binding — `settleAuctionWinForVerifiedIntent`

- `metadata.winnerBidderId` is **required, not defaulted**
  (`winner_binding_missing`) — no `metadata.winner ?? auction.winner`
  fallback anywhere.
- `boundWinner !== auction.winner_bidder_id` → `winner_mismatch` skip: a
  capture bound to a flaked winner can never settle onto the second-chance
  successor (and vice versa).
- `intent.user_id !== auction.winner_bidder_id` → `payer_not_winner` skip;
  the only exception is `metadata.initiatedByRole === 'admin'`, which is
  written exclusively by the server-side binding code (see §3).
- `|intent.amount_gbp − auction.current_bid_gbp| >= 0.005` →
  `amount_mismatch` skip — the captured amount must equal the live winning
  bid.
- NEW this pass: `getSellerReach` gate inside the settle helper
  (`seller_suspended` skip) — a seller suspended *between* intent mint and
  provider capture cannot take the funds. Skipped captures are logged for
  reconciliation, never silently settled.

### Winner-scoped Phase-A lookup

Both `POST /auctions/:auctionId/payment` and
`GET /auctions/:auctionId/payment-status` now select intents by
`metadata->>'auctionId' = $1 AND metadata->>'winnerBidderId' = $2` (the
server-resolved `auctions.winner_bidder_id`), ordered
`succeeded → live → terminal, created_at DESC` — a previous bidder's or a
newer failed intent can no longer shadow the current winner's verified
capture.

### Server-side binding write + concurrent-mint dedup

After the canonical `POST /payments/intents` mint succeeds, the route writes
the binding itself (`UPDATE payment_intents SET metadata = … || $2`) —
client metadata can never plant `auctionId`/`winnerBidderId` because
`sanitizePaymentIntentClientMetadata` strips all server-owned keys at ingest
(`lib/paymentIntentMetadata.ts`, applied at the generic intents route
`index.ts:29340` and the mint/quote route `index.ts:21111,21231`).

Migration **`334_payment_intents_auction_live_binding.sql`** adds partial
unique index `payment_intents_auction_live_uidx` on
`(metadata->>'auctionId', metadata->>'winnerBidderId') WHERE auctionId IS
NOT NULL AND winnerBidderId IS NOT NULL AND status NOT IN
('failed','cancelled')`. Two concurrent winner-pay requests that both miss
Phase A race this write; the loser's `23505` is caught, its unbound intent
is cancelled (`AUCTION_INTENT_SUPERSEDED`), and the stored winner's attempt
is replayed — closing the double-capture window that different idempotency
keys opened. Down-migration drops the index.

### Authorization before settlement details

The winner gate now runs **before** the settled-replay branch — a non-winner
gets `403 WINNER_RESTRICTED` instead of learning the order id and settled
timestamps.

### Secret hygiene

`toAuctionIntentPayload(row, { revealSecrets })` emits `clientSecret` /
`nextActionUrl` **only** when `row.user_id === caller`. The seller (and any
admin polling) sees status/failure fields but never the provider secret —
verified by `payment-status never leaks client_secret to the seller`.

### Honest payment-status

`payment-status` reports `paid` only when the auction actually settled. A
`succeeded` intent whose settlement was skipped returns
`paymentStatus: 'pending'` + `settlementState: 'requires_reconciliation'` +
`settlementReason` — never a false `paid`.

## 3. Second-chance repricing (review P1)

- `auctionSweepHandler.advanceSecondChanceOffer` now sets
  `current_bid_gbp = offered bid amount` alongside `winner_bidder_id` /
  `winner_bid_id` when the offer is created.
- `POST /auctions/:auctionId/second-chance/accept` resolves `winner_bid_id`
  → the recipient's actual bid, rejects when the bid doesn't belong to the
  accepting user (`NO_BIDS`), and transitions to `awaiting_payment` with
  `winner_bidder_id`, `winner_bid_id`, **and** `current_bid_gbp` set to the
  accepting bid — the winner is charged their own bid, not the flaked
  winner's higher one.

## 4. Mint-quote metadata forgery closed (review P0)

- `lib/paymentIntentMetadata.ts` (new): reserved-key sanitizer +
  `computeMintQuoteMac`/`verifyMintQuoteMac` (HMAC-SHA256 under
  `config.paymentMetadataHmacSecret`, bound to intent id + user).
- `materializeMintOperationForPaymentIntent`
  (`lib/walletMoneyPath.ts:~1205-1292`) now fails closed (returns null, no
  units minted) unless:
  1. `mintQuoteMac` verifies against the stored quote,
  2. `quote.fiatAmountMinor === intent.amount_minor` (captured amount), and
  3. `netFiat/fee/izeAmountUnits` **recompute exactly** from the captured
     amount via the fee-split + locked-rate formula.
  Concurrent materialization still dedups on `payment_intent_id`
  (`ON CONFLICT`).
- Generic `/payments/intents` and `/wallet/1ze/mint/quote` sanitize caller
  metadata before persisting — a client cannot overwrite `mintQuote`,
  `quoteHash`, `canonicalMoney`, or the auction binding keys.

## 5. P2P transfer integrity (review P1)

- `assertP2pTransferContextAuthorized` (`walletMoneyPath.ts:623`) validates
  context participants, settlement state, amount (coOwn buyer leg =
  `ceil((notional+fee)*1000)` units), and admin authority for
  `platform_reward`, then checks prior consumption.
- Caller `metadata` is spread **before** the server-owned
  `contextType`/`contextId`/`amountUnits` keys in `recordIzeTransfer`
  (`index.ts:23090-23099`) — a client override can no longer launder a
  privileged context past the single-use index.
- `23505` from `wallet_ize_transfers_context_uidx` (migration 333) maps to
  `409 P2P_TRANSFER_CONTEXT_BLOCKED` (`index.ts:23267`) — concurrent
  same-context transfers dedup to exactly one committed transfer.
- Idempotency claims (`claimWalletIdempotencyKey`) run **inside** the
  mutation transaction for p2p_transfer / withdraw_quote / withdraw_accept;
  `in_progress` → 409, `replay` → stored response.
- Deadlock fix: both wallets resolved in user-id order, then
  `lockWalletRowsForUpdate` in wallet-id order before debiting
  **spendable** (reservation-aware) funds — `computeSpendableOnezeUnits` /
  `assertSpendableOnezeUnits` subtract enforceable coOwn reservations from
  the gross balance (FIN-03).

## 6. SSRF canonicalization (review P1)

`lib/safeRemoteMediaFetch.ts` — new `canonicalizeRemoteIpLiteral` +
`parseIpv6Groups` + `parseNumericIpv4` canonicalize every IP literal before
blocklist checks, DNS validation, and connect pinning:

- IPv4-mapped IPv6 in **all tail forms**: `::ffff:127.0.0.1`,
  `::ffff:7f00:1` (hex pair), `0:0:0:0:0:ffff:7f00:1` (expanded), uppercase.
- IPv4-compatible `::7f00:1`, 6to4 `2002:v4hi:v4lo::/48`, Teredo
  `2001:0000::/32` (XOR-embedded).
- inet_aton numeric IPv4: decimal integer `2130706433`, hex `0x7f000001`,
  octal `0177.0.0.1`, short forms `127.1`.
- `isLoopbackIp`/`isPrivateIp`/`isBlockedIp` all canonicalize first;
  `resolveValidatedAddresses` pins the connection to the *canonical* address
  so a mapped literal connects as the unwrapped IPv4, never through an
  unvalidated tunnel. Redirect hops revalidate through the same path.

Regression vectors tested: `http://[::ffff:7f00:1]/`, expanded/uppercase/
dotted mapped forms, compatible, 6to4, Teredo, decimal/hex/octal/short IPv4,
redirect-to-mapped-loopback on hop 2, and a *public* mapped literal
(`::ffff:5db8:d822` → 93.184.216.34) still allowed.

## 7. Rekognition fail-closed input handling (review P2)

`lib/moderation/rekognitionProvider.ts` rewritten around
`resolveImageReference`:

- The fictional `Image.Url` member is gone — requests carry only
  `Image.Bytes` or `Image.S3Object` (the real AWS contract).
- External URLs fetch through the shared SSRF-pinned transport (5 MB bound,
  deadline); the response `Content-Type` is **never** trusted — only the
  magic-byte sniff decides, and an indecisive sniff yields a classified
  `review` (`modelVersion: 'input-preflight'`), not a provider call.
- Own-store URLs use `Image.S3Object` after a HeadObject preflight;
  unavailable preflight, unknown `ContentLength`, or undeclared type falls
  back to a bounded byte read + sniff — an unverifiable object is never sent
  unchecked. Provider-side S3 access errors retry once through the same
  byte-fetch path.
- Oversized (>5 MB), empty, or unsupported payloads are refused before the
  API call as `review` (human triage), never retried as provider failures.

## 8. Test-harness fixes (this pass)

- **`auctionPaymentSettlement.test.ts` after-hook masked every result.** It
  called `process.exit(process.exitCode ?? 0)`, which fires before the
  runner reports — a deliberate failing probe exited 0 with zero output.
  The hook now only closes Redis, and `scripts/run-unit-tests.mjs` passes
  `--test-force-exit` (Node ≥22.14) to reap lingering ioredis handles
  *after* reporting. This is what surfaced the real 20/20 pass.
- **`routeRegistration.smoke.test.ts`** — added the seventh lifecycle route
  (`GET /auctions/:auctionId/payment-status`) to the expected set.
- **`sellerReachDistribution.test.ts`** — re-pointed the reach-gate
  assertion at `settleAuctionWinForVerifiedIntent` (the real order-bind
  point) and kept the mint-time gate assertion.
- **`moderationImportSafety.test.ts`** — the Q&A read-path regex now matches
  the stricter committed predicate (`visible OR (quarantined AND asker)`),
  which also hides `rejected` rows from authors.
- **Migration 326** now carries the same `::bigint` promotion as 330 so
  fresh DBs get the corrected BYTEA codec directly (test requirement).

## 9. Test results

```
cd backend/api && npx tsc --noEmit -p tsconfig.json   → clean (exit 0)
```

| Suite | Runner | Result |
|---|---|---|
| `auctionPaymentSettlement.test.ts` | node:test | **21/21 pass** |
| `mollieWebhookFailClosed.test.ts` | node:test | 6/6 pass |
| `walletMoneyPath.test.ts` | node:test | 18/18 pass |
| `sellerReachDistribution.test.ts` | node:test | pass |
| `routeRegistration.smoke.test.ts` | node:test | pass |
| `mediaEmbeddingPgvector.test.ts` | node:test | pass |
| `safeRemoteMediaFetch.test.ts` | vitest | 38/38 pass |
| `moderationImportSafety.test.ts` | vitest | 35/35 pass |
| Full `npm test` (node:test, 100 files) | node:test | 1466 tests — 3 failures + 1 environmental timeout, all pre-existing (below) |
| Full `npx vitest run` | vitest | 327/327 pass |

New regression tests fail on old behaviour by construction: the winner-
scoped Phase-A assertion inspects the emitted SQL; winner/payer/amount
binding, binding-required, secret gating, honest-reconciliation, concurrent-
mint 23505 replay, second-chance repricing, mapped-hex SSRF (fetch spy
asserts zero network calls), Content-Type-forged JPEG, unverifiable S3
envelope, and forged/transplanted/miscomputed mint quotes each assert the
new code path the old code lacked.

### Pre-existing failures (not introduced by this pass, left as-is)

- `countryCapabilities.test.ts` + `countryCapabilityPolicy.test.ts` — stale
  expectations vs **committed** `countryCapabilities.ts` (`oneze_internal`
  is a legitimate commerce gateway at HEAD; test+source both unmodified).
- `infraOps.test.ts` — asserts a synchronous `0` from
  `publishRealtimeEvent`, which is `async` at HEAD (both files unmodified).
- `backendWorkflowClosure.test.ts` upload-finalization test — hangs 180s on
  `enqueueMediaIngestJob` (awaited ioredis queue op; no Redis in this env;
  test/route/queue files all unmodified).

## 10. Residual limitations / follow-ups

- IP blocklist range coverage is the pre-existing set (loopback, RFC-1918,
  link-local/metadata, multicast, 0/8, IPv6 ULA/link-local). CGNAT
  100.64/10, benchmarking 198.18/15, documentation ranges and 240/4 are not
  blocked — unchanged scope; worth a follow-up if the review wants full
  IANA-reserved coverage.
- Orphaned captures (winner moved on, amount drift, seller suspension
  between mint and capture) surface as `requires_reconciliation` + logged
  skip; the refund path is a separate operations concern, not auto-refund.
- Migration 334's index is built non-concurrently inside the migration
  transaction (same convention as 333); on a very large `payment_intents`
  table an ops window is prudent.
- `initiatedByRole: 'admin'` permits admin-initiated captures to settle for
  the winner — the key is server-written only (client metadata is stripped),
  but an admin-driven pay is worth an audit-trail note downstream.

## 11. Files changed in this pass

- `backend/api/src/routes/auctions.ts` — seller-reach gate inside the settle
  helper (rest of the verified-payment/binding architecture verified as
  landed earlier in this thread).
- `backend/api/src/lib/sellerReach.ts` — `getSellerReach` accepts the
  structural `Pick<PoolClient,'query'>` (DbQueryable-compatible).
- `backend/api/src/lib/paymentIntentMetadata.ts` — reserved-key sanitizer +
  mint-quote MAC (new, landed earlier in thread, verified).
- `backend/api/src/lib/safeRemoteMediaFetch.ts` — full IP canonicalization
  (verified).
- `backend/api/src/lib/moderation/rekognitionProvider.ts` — fail-closed
  input resolution (verified).
- `backend/api/src/lib/walletMoneyPath.ts` — MAC-verified mint
  materialization, spendable-funds + context-auth primitives (verified).
- `backend/api/src/index.ts` — metadata sanitization at intent ingest, P2P
  context/lock/idempotency ordering (verified).
- `backend/api/src/db/migrations/326_media_embeddings_pgvector.sql` —
  bigint codec promotion for fresh DBs.
- `backend/api/src/db/migrations/334_payment_intents_auction_live_binding{,_down}.sql` — live-binding unique index.
- `backend/api/scripts/run-unit-tests.mjs` — `--test-force-exit`.
- Tests: `auctionPaymentSettlement.test.ts` (incl. new
  `seller_suspended` regression), `safeRemoteMediaFetch.test.ts`,
  `moderationImportSafety.test.ts`, `walletMoneyPath.test.ts`,
  `sellerReachDistribution.test.ts`, `routeRegistration.smoke.test.ts`.
