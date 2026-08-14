# Wallet & Money Movement V3

> Phase 3 audit date: 2026-08-14  
> Repository: `K17ze/thryftverse-upgrade`  
> Branch: `feat/product-detail-contract-media-device-closure`  
> Audited HEAD: `315a0760267354be46fec8a5f83ad8746badd392`

## Preserve financial truth

Keep:
- canonical balance buckets;
- reconciliation;
- Stripe PaymentSheet;
- idempotency;
- pending/available seller money;
- safeguarding evidence;
- transaction history.

## Problem

One screen currently serves as wallet home, 1ZE wallet, fiat balance, seller earnings, Add, Load/Buy conversion, Redeem, Withdraw, History, Activity and safeguarding disclosure.

The information architecture, not the color palette, is the age signal.

## Wallet Home

Viewport 1:
- spendable/total balance;
- local equivalent;
- privacy eye;
- Add money;
- Withdraw;
- Activity.

Viewport 2:
- pending/held amount;
- seller earnings summary when relevant;
- latest activity.

Safeguarding lower down.

## Dedicated flows

### Add money
source → amount → review → confirm → receipt.

### Convert
Use if converting wallet balance/fiat ↔ 1ZE is a distinct economic action.

Replace confusing nested “Load” vs “Buy” labels with human goals.

### Withdraw
amount → destination → fee/timing → review → biometric → receipt.

## Earnings

Wallet home:
`Seller earnings · £X available · £Y pending`

Tap → Earnings with per-order release schedule.

## Activity

One canonical Activity destination with filters. Remove duplicate History/Activity terminology unless two distinct ledgers truly exist.

## Refresh

Remove fixed `setTimeout(800)` refreshing behavior. Finish refresh when the request settles.

## Agent boundary

Agent may explain, calculate and prepare. It cannot submit a money action without canonical review and explicit confirmation.

## Biometric policy

Always protect high-risk transaction commit/new destination. Balance-view gating should be an explicit privacy/product policy, not incidental friction.
