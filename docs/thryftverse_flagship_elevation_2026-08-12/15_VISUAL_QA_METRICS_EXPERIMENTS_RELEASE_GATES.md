# Visual QA, Metrics, Experiments & Release Gates

> **Audit date:** 2026-08-12  
> **Repository:** `K17ze/thryftverse-upgrade`  
> **Audited branch:** `feat/product-detail-contract-media-device-closure`  
> **Audited HEAD:** `df5e9a71f3dfb60407666a9323c66c758aef1b0f`  
> **Purpose:** Next-stage visual/UI/UX production elevation. This document is implementation guidance, not a claim that reference apps should be copied 1:1.

## Why visual QA must become a release gate

The current project has extensive tests, yet the user still correctly perceives large visual quality gaps. Automated logic tests cannot judge:
- optical alignment;
- hierarchy;
- card density;
- whether media dominates;
- whether copy looks generated;
- whether an empty state feels authored;
- whether a transition looks cheap.

Create a repeatable visual-quality system.

---

# Device matrix

## Native
- compact iPhone width;
- regular iPhone;
- large iPhone;
- older supported iPhone;
- mid-range Android;
- lower-memory Android.

## Web
- 390-ish mobile viewport;
- tablet;
- 1280 desktop;
- 1440+ desktop.

## Settings
Each:
- light;
- dark;
- 100% text;
- 200% text where practical;
- reduced motion;
- poor network/offline states.

---

# Golden routes

Capture at minimum:

### Core
- Home loaded / loading / error
- Search idle / results / no results
- PDP fixed / auction / co-own / sold
- Sell empty / media / validation / publishing / failure
- Poster camera / media picker / editor / publish / viewer
- Profile self / other / empty
- Settings root
- Inbox / requests / chat
- Checkout / pending / failure / receipt
- Auction Home / live detail / ended
- Seller Hub work pending / empty
- Co-Own Hub / asset / ticket / portfolio

---

# Screenshot rubric — 100 points

| Dimension | Weight |
|---|---:|
| Hierarchy | 20 |
| Content-to-chrome balance | 15 |
| Typography | 10 |
| Spacing/rhythm | 10 |
| Media presentation | 15 |
| Control consistency | 10 |
| State truthfulness | 10 |
| Platform fidelity | 5 |
| Accessibility resilience | 5 |

Do not average away a P0 blocker. Placeholder/demo content is automatic fail.

---

# Human review questions

1. What is the first thing my eye sees?
2. Is that what the user needs?
3. How many bordered containers are visible?
4. How many actions compete for emphasis?
5. Does any control look like a web component dropped into native?
6. Does anything look like a generic AI template?
7. Can I remove an element without harming comprehension?
8. Does the dark-mode version feel separately authored?
9. Does content look real?
10. What happens if media/network/data is missing?

---

# Interaction QA

Record 60fps screen capture:
- open route;
- scroll;
- open/close sheet;
- keyboard;
- swipe media;
- zoom;
- publish/bid/payment transitions.

Look for:
- dropped frames;
- animation overshoot;
- layout jump;
- delayed pressed state;
- stacked toasts;
- overlapping sheets;
- header flicker.

---

# Production metrics

## Discovery
- time-to-first-content;
- result open rate;
- save rate;
- search refinement;
- no-result rate.

## Sell
- start → publish;
- time to publish;
- field abandonment;
- media upload failure;
- draft recovery.

## Poster
- camera open → capture;
- capture → share;
- picker → canvas;
- publish failure/retry;
- first frame time.

## PDP
- media swipe depth;
- video play;
- buy/offer/bid;
- seller detail open;
- checkout start.

## Seller
- pending task completion;
- time to ship/reply;
- reprice action.

## Performance
- crash-free sessions;
- p95 route interactive;
- dropped frames;
- memory;
- image/video failure.

---

# Release gates

## P0 hard gates
- [ ] no mock/demo competitor-branded content;
- [ ] 0 type errors;
- [ ] critical tests pass;
- [ ] no known duplicate transaction;
- [ ] screenshot set approved;
- [ ] media error states approved;
- [ ] keyboard/safe area approved;
- [ ] release-mode performance captured.

## P1 quality gates
- [ ] no unexplained >2px optical alignment variance in shared primitives;
- [ ] all primary actions use canonical button/dock;
- [ ] typography token migration complete on flagship routes;
- [ ] dark/light parity;
- [ ] reduced motion parity.

## Department sign-off
Require one short `VISUAL_SIGNOFF.md` containing:
- screenshots;
- before/after;
- known deviations;
- performance capture;
- accessibility notes.
