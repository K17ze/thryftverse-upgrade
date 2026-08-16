# Auctions & Live-Commerce Flagship Elevation

> **Audit date:** 2026-08-12  
> **Repository:** `K17ze/thryftverse-upgrade`  
> **Audited branch:** `feat/product-detail-contract-media-device-closure`  
> **Audited HEAD:** `df5e9a71f3dfb60407666a9323c66c758aef1b0f`  
> **Purpose:** Next-stage visual/UI/UX production elevation. This document is implementation guidance, not a claim that reference apps should be copied 1:1.

## Current position

Auction code is functionally sophisticated:
- server-clock-derived timing;
- lifecycle states;
- live/ending/upcoming/watching segments;
- viewer state;
- attention strip;
- seller center;
- current/minimum bid;
- buy-now/reserve handling.

This is already stronger than a basic marketplace auction UI.

The remaining flagship work is **semantic urgency**, not more drama.

---

## Auction psychology

Auctions combine:
- value;
- time pressure;
- uncertainty;
- trust.

The UI must increase comprehension as urgency rises, not visual noise.

### Live card priority
1. item media;
2. current price;
3. time remaining;
4. bid state for this user;
5. next action.

Do not show every metric in colored pills.

### Last minutes
Increase:
- numeric prominence;
- state clarity;
- haptic when a bid is accepted/outbid, where appropriate.

Do not:
- flash the whole screen;
- pulse continuously;
- use red unless it means danger/losing/ending risk consistently.

---

## Auction Home

Current componentization is strong. Refine:
- one hero/attention unit only when actionable;
- live grid;
- ending soon rail if meaningfully distinct;
- upcoming as program list;
- recently closed lower down.

Avoid a home page that contains every possible auction module in the first viewport.

### Search/filter
Search should be a mode, not a permanent input consuming hero space on every visit if usage does not justify it.

---

## Auction Detail

State map must visually drive the entire page:
- scheduled;
- live — no bid;
- live — winning;
- live — outbid;
- reserve not met;
- ended — won;
- ended — lost;
- ended — no sale;
- cancelled;
- settlement pending;
- settled.

Primary dock copy and color must be generated from state, not scattered conditionals.

### Bid sheet
- current bid;
- minimum next;
- input;
- total/fees if any;
- explicit confirmation;
- accepted/pending/rejected states.

Never rely on a toast alone for a financial action.

---

## Seller Auction Centre

Task-first:
- auctions needing action;
- scheduled;
- live;
- ended/results.

Avoid generic KPI dashboard before tasks.

---

## Exact backlog

### P0
- [ ] Inventory lifecycle states and screenshot each.
- [ ] Define one `AuctionPresentationState` view model.
- [ ] Remove duplicate countdown/bid/status labels.
- [ ] Verify server-clock behavior under resume / drift.
- [ ] Ensure last-minute motion is restrained.

### P1
- [ ] Bid confirmation has exact money semantics.
- [ ] outbid state transitions visibly without layout shock.
- [ ] watcher notifications deep-link to exact state.
- [ ] upcoming notification toggle.
- [ ] result continuation: pay/ship/view receipt as relevant.

### P2
- [ ] live-event prefetch;
- [ ] accessibility announcements rate-limited so countdown does not spam;
- [ ] auction analytics for bid funnel.

---

## Acceptance
- [ ] Every lifecycle state has exactly one valid primary CTA.
- [ ] User always knows whether they are winning/outbid.
- [ ] Financial amounts use tabular numerals.
- [ ] countdown is based on server time.
- [ ] app background/resume corrects countdown instantly.
- [ ] bid failure never looks successful.
