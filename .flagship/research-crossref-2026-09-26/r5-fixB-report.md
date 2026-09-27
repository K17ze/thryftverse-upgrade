# r5-fixB — Web withdraw/payout rail rewire (P0)

**Workstream:** wallet payouts (web)
**Scope owned:** `web/src/components/wallet/withdraw/**`, `web/src/components/wallet/WalletBalanceHero.tsx`, `web/src/components/wallet/WalletView.tsx` (gating only — unchanged, see notes), `web/src/lib/api/services/payouts.ts` (new), `web/src/lib/hooks/payout-queries.ts` (new), `web/src/app/wallet/{withdraw,payouts}/page.tsx` (unchanged — they just render the views)
**Status:** FIXED — `npx tsc --noEmit` shows zero errors in owned files (3 pre-existing errors in `src/components/auctions/BidPanel.tsx`, a file owned by another workstream — untouched); `npx eslint` clean on all touched files.

## Root cause (confirmed)

- `WithdrawView.commit()` fabricated money state: minted a `PO-…` reference, wrote only to the `thryftverse.web.payouts` localStorage store + optimistically decremented the wallet query cache, and rendered a "pending review" receipt that could never resolve — in live mode no request ever reached the server.
- `usePayoutAccounts.ts` unconditionally merged `PAYOUT_ACCOUNTS`/`PAYOUT_REQUESTS` fixture seeds into the live user's rail — a real user saw the demo persona's "Barclays •••• 4521" / "Monzo •••• 8813" accounts and fabricated history.
- `AddBankAccountSheet` collected sort code + account number and wrote them to localStorage while implying a server-side privacy contract; no live endpoint accepts raw bank details.
- The submitting screen ran a fixed 3-stage timer theatre unrelated to any real work.

## Real endpoints verified (backend/api/src/index.ts)

- `GET/POST /users/:userId/payout-accounts` (25699/25760) — wire shape `{id:number, gatewayId, providerAccountRef, countryCode, currency, status:'pending'|'active'|'disabled', metadata, …}`. The POST schema takes a **provider reference**, not bank details: `stripe_americas` resolves the ref from the user's Connect account (`PAYOUT_ONBOARDING_REQUIRED` without one); other gateways require `providerAccountRef` + verified `settlement` capability.
- `POST /users/:userId/stripe-connect/account` (26411), `POST …/onboarding-link` (26481), `GET …/status` (26537 — also auto-upserts the `payout_accounts` row when the country policy allows).
- `GET /users/:userId/payout-requests` (26764), `GET …/:requestId` (26815), `GET …/lookup-by-key/:idempotencyKey` (26884 — returns `acknowledged` / `safe_to_retry` 404), `POST …/payout-requests` (26939 — schema `{payoutAccountId:int, amountGbp|amount (exactly one), amountCurrency, idempotencyKey:8..140, metadata}`; dedupes on `(user_id, idempotency_key)` + `request_hash`, debits `seller_payable` under a row lock, returns `balance.sellerPayableAfterRequestGbp`).
- **No payout-account DELETE/PATCH endpoint exists** — remove/set-default controls are gated to the fixture build rather than faked.

## Changes

### `web/src/lib/api/services/payouts.ts` (new)

Web port of `frontend/src/services/walletApi.ts` payout surface:
- `listPayoutAccounts`, `listPayoutRequests`, `createPayoutAccount`, `getStripeConnectStatus`, `createStripeConnectAccount` (409-tolerant per the mobile pattern — caller re-reads status), `createStripeConnectOnboardingLink`.
- `connectStripePayout(userId)` — the web port of mobile's `connectOrSyncPayoutAccount`: status → create Connect account if missing → `payoutPolicySupported === false` throws the honest capability error → `payoutsEnabled` resolves/creates the active `stripe_americas` payout account → otherwise mints an onboarding link and returns `{kind:'onboarding_required', onboardingUrl}`.
- `submitPayoutRequest(userId, {payoutAccountId, amountGbp, idempotencyKey, metadata, onReconciling})` — GBP wallet withdrawals send `amountGbp` (schema's exactly-one-of rule). Ambiguous failures (network drop / 5xx, minus `OFFLINE_WRITE_NOT_SUBMITTED` — same `isAmbiguousFailure` rule as `services/auctions.ts`) poll `lookup-by-key` (8 attempts, 1.5s→10s backoff, `skipDedup`) before surfacing: `acknowledged` replays the recorded row as success, `safe_to_retry` throws `PayoutRequestError{safeToRetry}`, exhausted budget throws `outcomeUnknown` with the check-before-retrying message.
- `newPayoutAttemptKey()` — `web-po-<uuid>`, matching the schema's 8–140 bounds.

### `web/src/lib/hooks/payout-queries.ts` (new)

`payoutKeys` + `usePayoutAccountsQuery` / `usePayoutRequestsQuery` — `enabled` only when `DATA_MODE==='live'` and a real session user exists (guests and the fixture build never fire them). `useConnectStripePayout` mutation drives the setup sequence and invalidates the accounts query on `ready`.

### `withdraw/usePayoutAccounts.ts` (rewritten)

One hook, two truths. **Live:** destinations/requests come from the queries above — fixture seeds are never merged, and a signed-out/unresolved session gets an empty rail, not the demo identity's accounts. Local writes become honest no-ops (`addAccount` throws "set up through Stripe", `removeAccount` returns `{ok:false, reason:'unsupported'}`). **Fixture:** the overlay store is unchanged. Returns `{mode, destinations, selectableDestinations (status==='active'), defaultDestination, requests, isLoading, isError, requestsError, refetch, fixtureAccounts, …}`.

### `withdraw/withdrawViewModel.ts`

New unified `PayoutDestination` view model (`{id, accountId:number|null, title, subtitle, currency, status, isDefault}`) + mappers `fixtureDestination` / `liveDestination` (label = `Stripe •••• <ref tail>`, never invented bank names) / `requestFromApi` (reference = `providerPayoutRef ?? server id` — no fabricated `PO-…`; currency pinned to `'GBP'` since `amountGbp` is the canonical GBP valuation). `DESTINATION_STATUS_CONFIG` labels pending/disabled rows. `maskedAccountLabel` superseded by `destinationLabel`.

### `withdraw/PayoutSetupSheet.tsx` (new)

Live "set up payouts" sheet. Idle → "Continue to Stripe" runs `connectStripePayout`; `onboarding_required` renders the onboarding URL as a real user-clicked link (a programmatic `window.open` after awaited calls would hit popup blockers) plus an "I've finished — check status" re-check that re-runs the sequence; errors surface the server's own message (`PAYOUT_*` / 503 "Stripe is not configured" verbatim via `parseApiError`).

### `withdraw/WithdrawView.tsx` (rewritten)

- **Live commit:** `execute → commitLive` — one idempotency key per (amount, destination) attempt (`idempotencyKeyRef`, reset on edit so `request_hash` mismatches can't wedge the session — mirrors `useWithdrawSubmission`). Success only on a real 2xx or a reconciled `acknowledged`: wallet cache gets the **server-computed** `sellerPayableAfterRequestGbp` (fallback: `available − debited`), `walletKeys.root` + payout queries re-read, receipt shows the real reference and "Pending review" (server status `requested`). Deterministic failure → server message + back to form, key cleared. `safe_to_retry` → "No withdrawal was recorded. Please try again." `outcomeUnknown` → key retained, "check payout activity before trying again" info toast.
- **Submitting screen:** live drives two honest stages (`Submitting` → `Confirming it was recorded` when the reconcile poll starts via `onReconciling`); fixture keeps the timer but stages now describe what actually happens locally.
- **Fixture disclosure:** toast "Withdrawal recorded — demo only, stored on this device"; receipt Status "Recorded locally (demo)"; footer "Demo — requests are recorded on this device and stay pending locally."
- **Rail:** pending/disabled live accounts render disabled with a status badge (server 409s non-active accounts — the UI never offers them); empty live state is "Set up payouts — verify with Stripe" → PayoutSetupSheet; query failures render inline honest error + retry instead of an empty list.

### `withdraw/PayoutsView.tsx` (rewritten)

Live mode: real destinations with status badges, real request history, remove/make-default controls omitted (no endpoints), "Set up payouts" → PayoutSetupSheet, honest footer ("Payouts go to your connected Stripe account…"). Fixture mode unchanged except the footer discloses device-local demo storage and the "last 4 digits" claim is scoped to what's actually kept.

### `withdraw/AddBankAccountSheet.tsx`

Header comment marks it fixture-only; the privacy footnote now reads precisely: "Demo — saved on this device only, and just the last 4 digits of the account number are kept."

### `WalletBalanceHero.tsx`

Reads `defaultDestination`/`isLoading`/`isError` from the hook. The caption renders nothing while the live rail is loading or failed (no guessed "no account" flash); resolved account → `title · GBP account` (or "verification pending"); resolved empty → "No payout method yet". Withdraw + Payout-methods links are kept in live — the real rail and the Stripe Connect setup flow exist.

### `WalletView.tsx` — unchanged

Withdraw gating needed no edit: the guest guard already exists, live withdraw is now a real flow, and the withdraw page itself renders "Nothing to withdraw yet" on a zero balance.

## Verified

- `npx tsc --noEmit` — 0 errors in owned/touched files. The only errors repo-wide are 3 pre-existing ones in `src/components/auctions/BidPanel.tsx` (`buyingNow`/`buyNow`/`loading` — a file with 756 pre-existing insertions from another workstream; untouched here).
- `npx eslint` on `src/components/wallet`, `services/payouts.ts`, `hooks/payout-queries.ts` — clean.
- No remaining references to the old hook shape (`defaultAccount`, `accounts`, `maskedAccountLabel`) — all three consumers updated.

## Notes for the parent agent

- **Live withdraw is end-to-end real but gated by server prerequisites:** the POST requires an `active` payout account, which requires completed Stripe Connect onboarding (`payouts_enabled`) — matching the mobile app exactly. Where Stripe isn't configured (503), the setup sheet shows the server's message rather than a dead end.
- `fetchJson`'s retry layer retries POSTs on transient failure — safe here because every attempt carries the same idempotency key and the backend dedupes on `(user_id, idempotency_key)` + `request_hash`.
- `PayoutRequestError.outcomeUnknown` intentionally keeps the idempotency key alive so a manual retry replays rather than double-pays; `safeToRetry` clears it.
- Live payout history pairs `amountGbp` with `'GBP'` — `amountCurrency` is the *requested* currency and would mislabel the canonical GBP valuation.
- The fixture localStorage store key `thryftverse.web.payouts` is untouched — existing demo sessions keep their local overlay.
