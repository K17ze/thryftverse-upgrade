# Checkout, Wallet, Orders & Transaction Trust

> **Audit date:** 2026-08-12  
> **Repository:** `K17ze/thryftverse-upgrade`  
> **Audited branch:** `feat/product-detail-contract-media-device-closure`  
> **Audited HEAD:** `df5e9a71f3dfb60407666a9323c66c758aef1b0f`  
> **Purpose:** Next-stage visual/UI/UX production elevation. This document is implementation guidance, not a claim that reference apps should be copied 1:1.

## Current position

`CheckoutScreen.tsx` has a strong transactional base:
- Stripe PaymentSheet;
- order creation;
- shipping quote;
- saved address/payment method;
- buyer protection;
- wallet position;
- SCA/pending states;
- offline/capability checks.

The visual task is to make this sophistication disappear behind confidence.

---

## Checkout psychology

The user needs to see:
1. what they are buying;
2. where it is going;
3. when/how it ships;
4. how they pay;
5. exact total;
6. what protection applies;
7. one final action.

Everything else increases abandonment risk.

---

## Screen structure

### Product summary
Compact image + title + variant/size + price.

### Delivery
One row:
- selected address;
- selected shipping method;
- ETA;
- edit.

### Payment
One row:
- selected method;
- wallet contribution if enabled;
- edit.

### Protection
One concise trust strip with disclosure.

### Price breakdown
Items:
- item;
- shipping;
- protection/platform fee if applicable;
- discount;
- wallet applied;
- **Total**.

Never hide mandatory fees behind an ambiguous summary.

### Sticky footer
- total;
- `Pay …` / `Place order`;
- loading/pending state.

---

## Payment state behavior

Existing settlement polling is robust. UI needs canonical state:

`idle → preparing → authenticating → confirming → succeeded | pending | failed`

If 3DS opens externally:
- returning to app restores a visible “Confirming payment…” state;
- no duplicate button until state resolved;
- pending has a receipt/status continuation.

Do not use generic ActivityIndicator as the only feedback for long-running transaction.

---

## Wallet

Wallet balance should not look like “free credit.”

Show:
- amount used;
- remaining charge;
- clear toggle;
- inability to use if capability/rules prevent it;
- no hidden conversion.

Withdraw/load flows need separate transaction-receipt states and idempotency.

---

## Orders

Order detail hierarchy:
- status;
- item;
- fulfillment timeline;
- tracking;
- payment;
- support/problem.

Order list:
- image;
- item;
- status;
- next action;
- date.

Avoid exposing backend identifiers.

---

## Exact backlog

### P0
- [ ] Flatten checkout card stack.
- [ ] One summary card at most; other sections use rows.
- [ ] Total and pay CTA visually dominant.
- [ ] Canonical payment state component.
- [ ] SCA return/resume visual QA.
- [ ] failure/pending never produce duplicate order.

### P1
- [ ] address/shipping/payment edit via consistent sheet/navigation.
- [ ] receipt screen with stable order reference.
- [ ] buyer protection disclosure.
- [ ] wallet contribution preview.
- [ ] accessibility announcements for final state only.

### P2
- [ ] saved checkout preference;
- [ ] express checkout where capability permits;
- [ ] seller/buyer order chat linkage.

---

## Acceptance
- [ ] No mandatory cost appears only after payment action.
- [ ] User can understand total in one glance.
- [ ] duplicate tap cannot create duplicate order/payment.
- [ ] pending payment has a recoverable route.
- [ ] offline checkout is blocked before destructive action.
- [ ] support route is present on receipt/order.
