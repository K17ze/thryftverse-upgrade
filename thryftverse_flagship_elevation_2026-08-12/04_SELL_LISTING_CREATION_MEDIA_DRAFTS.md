# Sell, Listing Creation, Media & Draft UX

> **Audit date:** 2026-08-12  
> **Repository:** `K17ze/thryftverse-upgrade`  
> **Audited branch:** `feat/product-detail-contract-media-device-closure`  
> **Audited HEAD:** `df5e9a71f3dfb60407666a9323c66c758aef1b0f`  
> **Purpose:** Next-stage visual/UI/UX production elevation. This document is implementation guidance, not a claim that reference apps should be copied 1:1.

## Current position

`SellScreen.tsx` has strong engineering:
- media studio;
- upload queue;
- drafts;
- recoverable publication stages;
- validation;
- sold comparables;
- listing quality calculation;
- sell/auction/Co-Own modes;
- theme and connectivity handling.

Its risk is that **all capability is visible in one authoring mental model**.

The reference products reduce effort by revealing fields in task order and by using media as the source of truth.

---

## Seller psychology

A seller wants to answer:
1. What am I selling?
2. What does it look like?
3. What condition is it in?
4. What should it cost?
5. How will it get to the buyer?
6. What will I receive?
7. Publish.

Everything else should appear only if relevant.

---

## Canonical listing flow

### Step 0 — Media
Make the first action extremely obvious.

Media tray:
- add;
- reorder;
- set cover;
- photo/video markers;
- upload status;
- retry;
- remove;
- crop;
- optional non-destructive adjustment.

Photo guide should be contextual, not a permanent instructional card.

Examples:
- after first image: “Add the back”
- after category known: “Show the size label”
- for luxury: “Add serial / stitching / receipt evidence”
- if condition has flaws: “Add a close-up of the flaw”

### Step 1 — Item
- title;
- category;
- brand;
- size;
- condition;
- description.

Suggested fields appear inline and can be accepted/edited.

### Step 2 — Price
- asking price or auction starting bid;
- sold-comps range when available;
- estimated seller proceeds;
- fees.

Do not use an “AI price” badge.

### Step 3 — Delivery
- parcel;
- shipping option;
- payer;
- location/capability.

### Step 4 — Review
Compact listing preview + unresolved warnings + publish.

Advanced listing mode should remain reachable without burdening simple listings.

---

## Media authenticity

Depop/eBay/Vinted patterns converge on genuine item photos and clear condition.

Thryftverse should explicitly preserve:
- flaws;
- texture;
- labels;
- receipts/authentication evidence;
- exact color as far as camera permits.

Any automatic enhancement:
- never silently replaces original;
- shows before/after;
- never invents missing area;
- never smooths damage;
- can be reverted.

---

## AI removal without removing AI

Current code references listing autofill. Keep it, but change presentation.

Instead of:
- “AI Autofill”
- sparkle card
- “AI generated title”

Use:
- `Suggested details`
- `From your photos`
- `Review suggestions`
- inline suggested value with `Apply`.

If confidence is weak:
- “We couldn’t identify the brand” + picker.

This is more trustworthy than pretending certainty.

---

## Listing mode

Do not make fixed-price / auction / Co-Own look like three equal tabs if 90% of users use one mode.

Recommended:
- default `Sell`;
- compact “Selling format” row;
- sheet: Fixed price / Auction / Co-Own;
- after selection, only relevant fields render.

For users entering from Auction or Co-Own departments, deep-link directly into that mode.

---

## Publication states

The existing staged state machine is good. Visually expose only meaningful states:

- `Uploading photos…`
- `Publishing…`
- `Almost done…`
- recoverable failure with exact failed step.

If listing exists but media attach fails:
- do not let user unknowingly create a duplicate on retry;
- show “Listing created; 2 photos need retry.”

Draft recovery:
- save automatically;
- visible “Saved” only briefly;
- never spam toasts on every field.

---

## Exact backlog

### P0
- [ ] Replace AI-labeled autofill surface with neutral suggestion treatment.
- [ ] Make media acquisition canonical and shared with Poster where reasonable.
- [ ] Move listing format into progressive disclosure.
- [ ] Reduce permanent instructional cards.
- [ ] Add cover-photo semantics and explicit reorder affordance.
- [ ] Surface upload state on each media cell.

### P1
- [ ] Rebuild form sections into semantic components.
- [ ] Sticky publish footer shows readiness + primary CTA, not a second dashboard.
- [ ] Add seller-proceeds preview beside price.
- [ ] Contextual authenticity prompts by category/value.
- [ ] Compact review state before publish for high-value/auction/Co-Own.

### P2
- [ ] Bulk authoring for power sellers.
- [ ] reusable listing template;
- [ ] duplicate/relist with media validation;
- [ ] cross-device draft sync if backend supports it.

---

## Acceptance
- [ ] New fixed-price seller can publish without seeing auction/Co-Own complexity.
- [ ] User can reorder and select cover.
- [ ] Image/video upload failures are individually recoverable.
- [ ] Suggestions never overwrite a typed value without explicit action.
- [ ] Item flaws are never hidden by automatic enhancement.
- [ ] Price guidance explains source as market comparables, not artificial certainty.
- [ ] Draft survives app background/restart.
