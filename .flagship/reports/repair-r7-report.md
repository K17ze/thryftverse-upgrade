# Repair R7 — Leaf Repair Report

Scope owned: `backend/api/src/index.ts`, `backend/api/src/lib/walletMoneyPath.ts`,
`backend/api/src/lib/searchSync.ts`. Findings sourced from
`.flagship/reports/review-security.md` and `.flagship/reports/review-backend.md`.

Status: **complete** — typecheck clean, all focused tests green. Not committed.

A prior pass in this tree had already landed the metadata-provenance layer
(`lib/paymentIntentMetadata.ts` — sanitize + `mintQuoteMac` HMAC, ingest
sanitization at both `/payments/intents` metadata writes and all three
`/wallet/1ze/mint/quote` metadata writes, the P2P context-ordering fix, and
migrations 333/334). This pass verified that layer, added the **required
recompute-and-reject minimum** on top of the MAC, and landed the remaining
index/search/visibility items.

---

## P0 — Forged mint quote via client-controlled metadata — CLOSED

Three independent layers now stand between `payment_intents.metadata` and
`mint_operations`:

1. **Ingest strip (verified landed).** `sanitizePaymentIntentClientMetadata`
   removes every server-owned key (`mintQuote`, `mintQuoteMac`,
   `mintOperationId`, `quoteHash`, `auctionId`, `winnerBidderId`,
   `canonicalMoney`, `targetAssetAmount`, `quoteRateSource`, …) from caller
   metadata at `index.ts:21111`, `21231`, `21298` (mint/quote route) and
   `29340`, `29454` (generic `/payments/intents` — both the insert and the
   provider-boundary metadata). Server fields are written after the spread,
   so even a missed reserved key cannot win.
2. **MAC authentication (verified landed).** `computeMintQuoteMac` HMAC-SHA256s
   the canonical quote bound to `paymentIntentId` + `userId` with
   `config.paymentMetadataHmacSecret`; the materializer verifies it in
   constant time before trusting any field (`walletMoneyPath.ts:1227-1246`).
3. **Recompute-and-reject (this pass — the required minimum).**
   `materializeMintOperationForPaymentIntent` (`walletMoneyPath.ts:1257-1292`)
   now recomputes the minted quantity **from `intent.amount_minor`**: the
   captured amount is fed through `moneyFromMinor` →
   `allocateMoneyByBasisPoints(MINT_QUOTE_TOPUP_FEE_BASIS_POINTS)` →
   `net / ratePerGram` → `onezeAmountToUnits` — the identical pipeline the
   quote route uses — and the stored `netFiatAmountMinor`,
   `platformFeeMinor`, and `izeAmountUnits` must all match or the intent is
   refused (`return null`, null-op behaviour preserved). A quote with a
   *valid* MAC but an internally inconsistent amount can no longer mint.
   `MINT_QUOTE_TOPUP_FEE_BASIS_POINTS = 100` is exported from
   `walletMoneyPath.ts` and the quote route (`index.ts:20911`) consumes it,
   so the fee split cannot drift between writer and verifier.

**Regression tests** (`__tests__/walletMoneyPath.test.ts`, node:test dialect —
31/31 pass):
- `a valid-MAC quote whose izeAmountUnits does not recompute is rejected` —
  valid MAC, £10 captured, `izeAmountUnits: 1e9` → `null`, no row. Fails on
  the MAC-only intermediate code (which would have materialized the row).
- `a valid-MAC quote with inconsistent fee/net fields is rejected` — zero-fee/
  full-net quote with valid MAC → `null`.
- Pre-existing coverage verified still green: no-MAC forgery rejected, MAC
  transplant across intents rejected, `fiatAmountMinor ≠ amount_minor`
  rejected, happy-path materialization + `ON CONFLICT` replay.

## P1 — `wallet_ize_transfers` context metadata clobber — VERIFIED LANDED

`index.ts:23092-23103` spreads caller metadata **first**, then writes the
authorized block (`note`, `contextType`, `contextId`, `amountUnits`) — client
values cannot clobber stored context fields. `assertP2pTransferContextAuthorized`
(`walletMoneyPath.ts:739-757`) re-verifies `coOwn_trade` against the settled
trade (participants + exact buyer-leg units) and `platform_reward` against
admin role. The residual single-use race is closed by migration
`333_wallet_ize_transfers_context_single_use.sql` (partial UNIQUE on
`(metadata->>'contextType', metadata->>'contextId') WHERE status='committed'`)
plus the 23505 → `P2P_TRANSFER_CONTEXT_BLOCKED` 409 mapping at
`index.ts:23274-23285`. No further change needed in scope.

## P1 — `GET /listings/:listingId` serves `risk_pending` publicly — FIXED

`index.ts:17447-17458`: `'risk_pending'` added to `NON_PUBLIC_STATUSES`. The
privileged path is preserved and extended: the seller still views their own
held listing, and `admin`/`moderator` roles now pass the gate (moderation
reviewers need the detail surface for held listings; the comment already
anticipated an admin role). Anonymous and non-owner non-privileged viewers
get 403 `LISTING_NOT_PUBLIC`. `sold` stays public (unchanged — terminal
sales history is intentionally viewable).

## P2 — Dead `oneze_internal → 'succeeded'` branch — REMOVED

`index.ts:6782-6791` deleted. The earlier branch (`index.ts:6549-6560`) already
returns `requires_confirmation` for `oneze_internal`, making this branch
unreachable; had ordering ever shifted it would have minted intents as
`succeeded` without `settlePaymentIntent`. A NOTE comment records why no
second branch may exist.

## P2 — Silent catch on hold-eviction paths — FIXED (all five sites)

Every fire-and-forget index eviction/sync on a moderation-relevant path now
logs `request.log.error` with `{ err, listingId, status }` and a specific
message, matching neighbouring conventions:

- `index.ts:17351-17362` (upsert): `removeListingFromIndex` on
  `effectiveStatus === 'risk_pending'` and `syncSingleListing` otherwise.
- `index.ts:19163-19174` (PATCH): same pair on `patchPublishHeld`.
- `index.ts:19245-19250` (DELETE): `removeListingFromIndex` on soft-delete.

(GDPR erasure eviction at `index.ts:16513` already logged — verified.)

## P2 — `syncSingleListing` corpus divergence — FIXED

`searchSync.ts:318-333`: the single-listing sync now removes the document for
**any** non-`active` status (draft, paused, risk_pending, sold, deleted,
missing row) instead of only `deleted`/`sold`. The indexed corpus is now
exactly `status = 'active'` — identical to `syncListingsToSearchIndex`
(`searchSync.ts:253`) and `syncListingsToLocalFallback` (`searchSync.ts:379`),
so transition writers (pause/hold/sold) evict rather than accumulate
non-public documents in Meilisearch and the mirrored fallback.

## P2 — Reindex lock-probe error mapping — VERIFIED, no change needed

`searchSync.ts:792-824` distinguishes the three outcomes: contention
(`pg_try_advisory_lock` → false) returns `reindex_in_progress`, which
`routes/search.ts:779` maps to **409**; `dbPool.connect()` failure and lock
query errors return `reindex_lock_unavailable` → **500**. Genuine contention
vs real DB errors are distinguishable to operators. Unlock runs in `finally`
with `release(err)` client-destruction on unlock failure (`searchSync.ts:835-851`).

## P2 — Webhook dedup keyed on payload-derived `providerEventId` — VERIFIED, no change needed

Verification already precedes dedup-key trust on the live ingest path:
`verifyAndNormalizeWebhook` runs at `index.ts:31020` — before `db.connect()`
(31050) and before both dedup inserts (`webhook_events` at 31065,
`payment_webhook_events` at 31184). `event` is only populated when verified.
For unsigned Mollie events the dedup key `${eventType}:${paymentRef}` derives
from the **provider-retrieved** payment (`paymentProviders.ts:611-636`), not
the caller payload — the payload is only the trigger; a retrieval outage is
retryable → 503 before any DB work. The residual noted in the review (distinct
keys per event type) is contained by `settlePaymentIntent`'s `FOR UPDATE` +
terminal-state `alreadyFinal` guard (`index.ts:7261-7277`): a later `failed`
event cannot flip a `succeeded` intent. The mock dedup paths (30699, 30878)
are dev-only behind `apiEnableMockWebhooks` + production 404.

## Files edited (this pass)

| File | Change |
|---|---|
| `backend/api/src/lib/walletMoneyPath.ts` | `money.js` imports; `MINT_QUOTE_TOPUP_FEE_BASIS_POINTS`; recompute-and-reject block in `materializeMintOperationForPaymentIntent` |
| `backend/api/src/index.ts` | import + use shared fee-bps constant; `risk_pending` in `NON_PUBLIC_STATUSES` + admin/moderator privileged view; removed dead `oneze_internal→succeeded` branch; logging on 5 silent eviction catches |
| `backend/api/src/lib/searchSync.ts` | `syncSingleListing` evicts every non-`active` status |
| `backend/api/src/__tests__/walletMoneyPath.test.ts` | +2 regression tests (valid-MAC inflated units; inconsistent fee/net) |

## Verification

- `cd backend/api && npx tsc --noEmit -p tsconfig.json` — **clean**.
- `node --import tsx --test` walletMoneyPath + walletMoneyPathReservations — **31/31**.
- `node --import tsx --test` searchReindexLease, searchPublicVisibility,
  searchScoped, searchAdapterDegradation, retrievalSourceContract — **37/37**.
- `node --import tsx --test` webhookIdempotency — **7/7**; paymentP0Gates — **35/35**;
  checkoutMoneyPathGuards — **22/22**; listingRiskEnforcement — all pass.
- `npx vitest run moderationImportSafety` — **35/35** (vitest-dialect file).
- `node --import tsx --test` mollieWebhookFailClosed — **6/6**.
- auctionPaymentSettlement — **21/21 pass** (file marker shows timeout-kill,
  not a test failure: the suite holds open ioredis handles and the process
  does not self-exit — pre-existing harness behaviour, unrelated to changes).

Nothing committed. `.flagship` canonical files untouched.
