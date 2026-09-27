# PKG-01 Report — Auction payment transition + Mollie webhook fail-closed

Repo root: `C:/Users/User/Desktop/thryftverse-upgrade` (HEAD `76c0733`, branch `feat/product-detail-contract-media-device-closure`)
Audit source: `ThryftVerse-Post-Upgrade-Audit-2026-09-20.md` (FIN-01, FIN-09, SEP20-FIN-10)

## Status: CLOSED — all three findings resolved; backend typecheck clean; 16/16 focused tests pass.

## Design

**Pending → verified-paid transition (FIN-01/FIN-09).** `POST /auctions/:id/payment` no longer writes any paid/settled state. It authenticates the winner, reads auction state under a `FOR UPDATE` lock (Phase A — no provider I/O while locked), then mints or reuses a `payment_intents` row through the **canonical** `POST /payments/intents` route via in-process `app.inject` (same compliance, gateway resolution, idempotency and provider phases as checkout — no duplicated provider code). The response is `paymentStatus: 'pending'` with the intent's `clientSecret`/`nextActionUrl`. Auction/order/ledger effects happen **only** inside `settleAuctionWinForVerifiedIntent`, which requires `payment_intents.status = 'succeeded'` — a state written exclusively by `settlePaymentIntent` from provider-verified webhooks or the admin maker-checker path. The helper is invoked from three places: (1) the provider webhook route inside the same transaction that marks the intent succeeded; (2) the winner-pay replay path when an authoritative capture already exists (self-heal for manual confirms / mock webhooks); (3) the `GET /auctions/:id/payment-status` poll endpoint. All settlement writes are idempotent — `paid_at IS NULL` guard on the auction UPDATE, existing-order reuse, deterministic order id, and ledger posting gated by `ledgerTablesAvailable`.

**FIN-09 replay.** An already-settled auction replays `{ paymentStatus: 'paid', orderId, auction: settled }` from stored rows instead of erroring on the settled guard. A non-terminal intent replays `pending` (one active attempt per winner — prevents double capture across sessions/keys). A succeeded-but-unsettled intent runs the verified settle and replays the result. Terminal failures fall through so a new idempotency key mints a fresh attempt. The winner binding uses `metadata.winnerBidderId`, so an intent minted for a previous winner never replays to a second-chance successor.

**Fail-closed Mollie verification (SEP20-FIN-10).** `normalizeMollieEvent` now has three distinct paths: unsigned requests with an API key must carry a syntactically valid `tr_*` payment id **and** survive `GET /payments/{id}` — status, money and intent linkage (`metadata.intentId` / `providerIntentRef`) derive exclusively from the retrieved payment; retrieval failure throws `MollieVerificationError(retryable=true)` with **no payload fallback**. Signature-authenticated payloads (valid `X-Mollie-Signature` when `mollieWebhookSecret` is configured, or DLQ-stored events marked `trustedStoredPayload`) keep the existing payload-derived path, still preferring provider retrieval when available. With neither secret nor API key the verifier fails closed. The webhook route answers retryable verification failures with **503 before `db.connect()`** — no transaction, no state transition, and Mollie redelivers after the outage clears. Amount/currency are validated against the canonical intent row (`PAYMENT_AMOUNT_MISMATCH`) from provider-derived `event.money`.

**Frontend.** `handlePayNow` handles `pending` by calling the existing `waitForPaymentIntentSettlement` poller (which opens hosted-checkout/3DS URLs when required), then refreshes from the server. `'paid'` toasts only on authoritative `succeeded`; poll exhaustion shows "Waiting for payment confirmation" and **retains** the idempotency key so the next tap replays the in-flight attempt rather than minting a second provider payment.

## Files changed

| File | Change |
|---|---|
| `backend/api/src/routes/auctions.ts` | Rewrote `POST /auctions/:id/payment` (≈:672-978) as pending-first intent mint/reuse via canonical `/payments/intents` inject; new module-level `settleAuctionWinForVerifiedIntent` (:120-311); `runVerifiedAuctionSettlement` tx wrapper (:420); `emitAuctionSettlementEffects` post-commit effects (:356-415); new `GET /auctions/:id/payment-status` self-healing poll (:986+); DI seam `createAuctionPaymentIntent`/`onAuctionSettled` for tests. |
| `backend/api/src/lib/paymentProviders.ts` | `MollieVerificationError` + `retryable` on `WebhookVerificationResult`; `MOLLIE_PAYMENT_ID_PATTERN`; `retrieveMolliePayment` + `__testables.setMolliePaymentRetriever` seam (:561-586); `normalizeMollieEvent` split into retrieved/authenticated/fail-closed paths (:588-694); `verifyAndNormalizeWebhook` maps retrieval errors to `{verified:false, retryable}` (:997-1011); `normalizeWebhookEvent` (DLQ replay) uses `trustedStoredPayload` (:1108-1115). |
| `backend/api/src/index.ts` (leased region only) | Webhook route: retryable → 503 pre-transaction (:30674-30692); `settledAuctionWin` state (:30887-30898); on verified `succeeded`, `settleAuctionWinForVerifiedIntent` joins the same tx (:30998-31015); post-commit realtime/notification fanout (:31352+, :31394+). Other hunks in this file belong to concurrent agents. |
| `frontend/src/hooks/useAuctionDetail.ts` | `handlePayNow` rewritten for pending → poll → authoritative refresh (:477-558); imports `waitForPaymentIntentSettlement` (:35). |
| `backend/api/src/__tests__/mollieWebhookFailClosed.test.ts` | NEW — 7 tests: forged paid + retrieval outage → unverified/retryable; invalid/missing id → non-retryable; provider-derived status/money/linkage only; non-paid maps to failed; deterministic `providerEventId` dedup. |
| `backend/api/src/__tests__/auctionPaymentSettlement.test.ts` | NEW — 9 tests exercising the real registrar + settle helper against a SQL-inspecting fake client (winner-pay pending, duplicate replay, in-flight replay, non-winner 403, exactly-once settle, non-succeeded no-op, winner/amount mismatch refusal, non-auction no-op). `test.after` closes Redis + `process.exit(process.exitCode)` because `lib/queues.ts` owns non-exported reconnecting ioredis clients that otherwise hang the runner. |

## Tests run

- `npx tsc --noEmit` (backend/api) — **clean, 0 errors**.
- `npx tsc --noEmit` (frontend) — **3 pre-existing errors**, all in `src/__tests__/pkg09CommerceSurfaces.test.tsx` (another package's `Listing` type mismatch); zero in `useAuctionDetail.ts` or related files.
- `node --import tsx --test --test-timeout=60000 src/__tests__/auctionPaymentSettlement.test.ts src/__tests__/mollieWebhookFailClosed.test.ts` — **16/16 pass**:
  - forged paid webhook + provider retrieval outage → `verified:false`, `retryable:true`, no event → route answers 503, no mutation;
  - syntactically invalid / missing payment id → non-retryable rejection;
  - verified retrieval → status, money, intent linkage come only from the provider; `expired` maps to `failed`;
  - deterministic `providerEventId` → duplicate deliveries dedup to one effect;
  - winner pay mints a provider intent and returns `pending` — no settle without verified capture;
  - verified capture settles exactly once; replay is idempotent; winner/amount mismatches refuse settlement;
  - duplicate winner-pay replays the stored result (FIN-09).
- Old-behavior check: under the previous code the forged-webhook test returned `verified:true` from payload data, and the winner-pay tests would have found a synchronous settled write and 409-on-retry.

## Residual risks

1. **Orphaned captures need reconciliation**: if the provider captures money but the auction can no longer settle (winner moved on via second-chance, amount drift, cancellation), the helper returns `skipped` and the webhook logs an error — funds are captured but the auction stays unsettled. There is no automated refund/compensation path; `AUCTION_SETTLEMENT_ORPHANED` (409) surfaces it to the caller.
2. **`payment_expired` auctions can still settle** if a capture lands before the second-chance flow reassigns the winner — the winner-binding check is the guard; a capture arriving after winner reassignment is skipped (intended), leaving risk #1.
3. **Concurrent non-webhook settlement paths** (admin maker-checker confirm, payment-status self-heal, winner-pay self-heal) serialize correctly on `paid_at IS NULL`, but post-commit effects (notification/commerce cards) can double-emit across *different* paths if two settle near-simultaneously — mitigated by deterministic message ids/idempotency keys, not eliminated.
4. **`paymentMethodId` on intent metadata is number-only** — the settle path copies it to `auctions.payment_method_id` only when `typeof === 'number'`; admin-initiated payments without an instrument leave it NULL (acceptable).
5. **Shared-tree noise**: `index.ts` and `paymentProviders.ts` carry hunks from concurrent agents outside the leased region; verified via diff that this package's hunks are confined to the webhook region and provider-verification code.
6. The `app.inject` dispatch forwards the bearer token so the canonical route re-authenticates — an admin paying on the winner's behalf creates an intent under the **admin's** user id; `settleAuctionWinForVerifiedIntent` uses `intent.user_id` for `payment_confirmed_by`, so the audit column records the admin, not the winner (deliberate; winner binding is via metadata).

## Test summary

Backend `tsc --noEmit` clean (0 errors); `auctionPaymentSettlement.test.ts` 9/9 + `mollieWebhookFailClosed.test.ts` 7/7 pass under `node --import tsx --test` (frontend typecheck has 3 pre-existing pkg-09 errors, none in scope).
