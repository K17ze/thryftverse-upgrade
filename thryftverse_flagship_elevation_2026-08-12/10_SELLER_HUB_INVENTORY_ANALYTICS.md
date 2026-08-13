# Seller Hub, Inventory, Analytics & Operational UX

> **Audit date:** 2026-08-12  
> **Repository:** `K17ze/thryftverse-upgrade`  
> **Audited branch:** `feat/product-detail-contract-media-device-closure`  
> **Audited HEAD:** `df5e9a71f3dfb60407666a9323c66c758aef1b0f`  
> **Purpose:** Next-stage visual/UI/UX production elevation. This document is implementation guidance, not a claim that reference apps should be copied 1:1.

## Current problem: dashboard/card soup

`SellerHubScreen.tsx` currently presents:
- hero summary;
- seller standards;
- verification CTA;
- eight KPI cards;
- nine seller-tool rows;
- a final “Create new listing” CTA.

Everything is reasonable independently, but the full surface asks the seller to *interpret the dashboard* before doing the job.

Meta’s July 2026 Seller app uses a stronger principle: seller home surfaces **what needs attention** — ship, reply, reprice — and places performance alongside operational work.

---

## New Seller Home

### 1. Needs attention
Only render if non-empty.

Examples:
- 2 orders to ship;
- 3 buyer messages;
- 1 listing missing details;
- 4 listings eligible to reprice;
- auction result needs action.

This becomes the hero.

### 2. Quick create
One compact `List an item` action.

### 3. Performance snapshot
Three metrics max:
- sales;
- views;
- conversion/messages.

Tapping enters analytics.

### 4. Inventory status
- Active
- Draft
- Sold
- Paused

Compact row, not 4 cards.

### 5. Tools
Do not list every destination as a bordered action card. Use a flat settings-style list or secondary tab.

---

## Seller navigation model

Potential top-level:
- Home
- Listings
- Orders
- Inbox
- Insights

Auctions can be a listing format / specialized section. Verification and payouts belong in account/business settings unless they require action.

---

## Analytics

A flagship analytics screen does not need twelve charts.

Start with questions:
- Are people seeing my items?
- Are they clicking/opening?
- Are they messaging/offering?
- Are they buying?
- Which listings need action?

Use:
- one trend chart;
- top listings;
- funnel;
- recommendations/actions.

Do not output “AI insights” cards. Phrase as observed signals:
- “Views fell 24% this week”
- “3 listings have high saves but no messages”
- “Price is above recent sold items” if backed by actual comparables.

---

## Inventory

Power-seller requirements:
- sort/filter;
- status;
- batch select;
- edit price;
- pause;
- relist;
- duplicate;
- shipping status;
- search.

Use table/list density on tablet/web; compact cards/rows on phone.

---

## Exact backlog

### P0
- [ ] Replace KPI-first SellerHub with task-first model.
- [ ] Reduce eight stat cards to three summary values.
- [ ] Reduce nine tool cards to flat destinations/navigation.
- [ ] Make create listing persistent but not duplicated top + bottom.
- [ ] Unified seller inbox deep-link.

### P1
- [ ] inventory bulk actions;
- [ ] seller action badges from real backend state;
- [ ] performance funnel;
- [ ] listings needing improvement;
- [ ] drafts and cross-device resume.

### P2
- [ ] bulk listing;
- [ ] template;
- [ ] seller assistant as contextual action, not branded AI dashboard.

---

## Acceptance
- [ ] A seller with pending work sees the next task before analytics.
- [ ] A seller with no pending work sees performance + create action calmly.
- [ ] No metric card exists without a likely decision.
- [ ] Seller can reach listing/order/message within one or two actions.
