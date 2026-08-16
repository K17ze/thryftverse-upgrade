# Co-Own, Portfolio, Syndicates & Financial UX

> **Audit date:** 2026-08-12  
> **Repository:** `K17ze/thryftverse-upgrade`  
> **Audited branch:** `feat/product-detail-contract-media-device-closure`  
> **Audited HEAD:** `df5e9a71f3dfb60407666a9323c66c758aef1b0f`  
> **Purpose:** Next-stage visual/UI/UX production elevation. This document is implementation guidance, not a claim that reference apps should be copied 1:1.

## Product character

Co-Own is financially sensitive. It should visually borrow more from excellent brokerage/asset interfaces than from social-card UI, while still belonging to Thryftverse.

The audited hub already has:
- active/new/watchlist segments;
- holdings;
- search/sort;
- portfolio entry;
- instrument cards;
- reconciliation/offline states.

The goal is **calm financial comprehension**.

---

## Core psychology

Users must understand:
- what asset;
- unit price;
- what one unit represents;
- availability;
- what they own;
- how value can change;
- settlement/liquidity limitations;
- what action is available.

Do not hide material risk behind fashion imagery.

---

## Hub

Recommended order:
1. compact market header;
2. own positions rail only if positions exist;
3. segmented market list;
4. instruments.

Positions should be horizontally scrollable and visually compact. Do not require a separate top icon just to understand that holdings exist; portfolio icon can remain as destination, but immediate owned positions deserve on-page context.

### Instrument card
- image;
- title;
- unit price;
- availability/allocation;
- one status;
- optional user-owned units.

Avoid:
- multiple pseudo-market metrics if backend cannot substantiate them;
- synthetic 24h changes;
- decorative candlestick graphics with no real series.

---

## Asset detail

Hero:
- asset identity/media;
- unit price;
- availability;
- user holding;
- action.

Then:
- allocation;
- issuer/ownership structure;
- market/order information;
- disclosures;
- transaction history.

Financial disclosures should be reachable before order confirmation.

---

## Trade ticket

One-dimensional decision surface:
- buy/sell;
- units;
- price/quote;
- estimated total;
- fees;
- resulting position;
- confirm.

Do not combine a mini-dashboard with the ticket.

### Confirmation
Must show:
- side;
- units;
- unit price;
- total;
- fees;
- settlement;
- risk/cancellation rules.

No ambiguous “Continue.”

---

## Portfolio

Top:
- total value;
- cost basis;
- P&L only when backed by trustworthy data.

Then positions list:
- item image/title;
- units;
- average entry;
- current/reference value;
- unrealized P&L.

Do not make image cards so large that numeric comparison becomes difficult.

---

## Exact backlog

### P0
- [ ] Audit every displayed market metric for backend truth.
- [ ] Keep positions rail visible and horizontally scrollable when holdings exist.
- [ ] Standardize tabular numeric typography.
- [ ] Standardize market-state color and shape semantics.
- [ ] Remove decorative finance graphics without data.

### P1
- [ ] transaction confirmation receipt;
- [ ] order status lifecycle;
- [ ] partial fill / cancelled / rejected states;
- [ ] clear settlement explanation;
- [ ] portfolio skeleton preserving numeric columns.

### P2
- [ ] richer charts only when historical data is real;
- [ ] alerts;
- [ ] tax/reporting entry;
- [ ] accessible financial explanations.

---

## Acceptance
- [ ] No speculative metric appears as fact.
- [ ] Monetary and unit quantities never change width erratically.
- [ ] Buy/sell action is impossible to confuse.
- [ ] user sees all material numbers before confirmation.
- [ ] financial error never resolves via toast alone.
