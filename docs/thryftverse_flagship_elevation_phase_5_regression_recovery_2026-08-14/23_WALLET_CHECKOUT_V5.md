# Wallet, Convert, Checkout & Orders V5

> Audit date: 2026-08-14  
> Repository: `K17ze/thryftverse-upgrade`  
> Branch: `feat/product-detail-contract-media-device-closure`  
> Audited remote HEAD: `73be832f2522f828ba2adfe31756da7da2d6e1ca`

## Preserve dedicated Convert flow

No regression.

## Wallet role = transaction/ledger

Flatness is correct, but do not make financial state visually weak.

Balance:
strong typography.

Pending/holds:
only when nonzero.

Actions:
Add, Withdraw, Convert.

## Checkout

Hide infrastructure:
- PaymentIntent;
- polling;
- auth token stages.

Show:
- review;
- confirm bank;
- confirming;
- pending;
- done/failed.

## Receipt

Document-like:
- amount;
- fee;
- destination;
- reference;
- time.

## Orders

Object + status + next action.

## Small flows

- Add money fail;
- card auth;
- convert fail/retry;
- withdrawal destination;
- withdrawal receipt;
- pending order;
- refund;
- dispute;
- seller earnings release.

## Backend

All amounts minor-unit-safe.
No floating-point fee disagreement.
Server is canonical for totals/rates/fees.

## Acceptance

The user can always answer:
- how much;
- where it goes;
- whether it happened.
