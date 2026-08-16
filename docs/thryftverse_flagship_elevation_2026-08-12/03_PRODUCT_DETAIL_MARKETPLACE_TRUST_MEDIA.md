# Product Detail, Marketplace Trust & Mixed-Media Elevation

> **Audit date:** 2026-08-12  
> **Repository:** `K17ze/thryftverse-upgrade`  
> **Audited branch:** `feat/product-detail-contract-media-device-closure`  
> **Audited HEAD:** `df5e9a71f3dfb60407666a9323c66c758aef1b0f`  
> **Purpose:** Next-stage visual/UI/UX production elevation. This document is implementation guidance, not a claim that reference apps should be copied 1:1.

## Current position

Product detail is one of the strongest departments on the audited branch.

`ItemDetailScreen.tsx` already includes:
- mixed product media;
- seller trust;
- recommendations;
- price alerts;
- Q&A;
- shipping/returns;
- size guide;
- related content;
- sustainability;
- offer flow;
- offline/loading/error handling.

`CommerceMediaStage.tsx` now supports typed `ProductMediaItem[]`, image + video pages, paging, image zoom, fullscreen continuity, poster metadata and pausing offscreen/background video.

The remaining work is **hierarchy and media art direction**, not “build a carousel.”

---

## Product-detail psychology

A marketplace PDP must progressively answer:

1. **Is this the item I want?**  
   Media, brand/title, price, condition.

2. **Can I trust what I am seeing?**  
   real photography, seller, condition evidence, authenticity.

3. **Can I get it?**  
   size, shipping, location/capability, availability.

4. **What happens if something goes wrong?**  
   buyer protection, returns/dispute rules.

5. **What should I do now?**  
   buy / bid / offer / co-own action.

Anything else is supporting content and should not outrank these five questions.

---

## Media stage

### Keep
- swipe between images/video;
- pinch/double tap image zoom;
- fullscreen;
- typed media;
- background/offscreen video pause;
- page indicator.

### Upgrade
- replace generic `useNativeControls` in the hero with a bespoke minimal control layer:
  - play/pause;
  - mute;
  - scrub only when meaningful;
  - duration;
  - full-screen;
- clear thumbnail/poster signaling for video;
- preload next image and video poster, not every full video;
- preserve page index across fullscreen return;
- avoid zoom affordance hints after the user has learned the gesture;
- treat video as one member of the same gallery, not a visually separate module.

### Product photography policy
- first image: clear item silhouette;
- follow-ups: front/back/side/details;
- flaw image if applicable;
- label/material/serial/authentication evidence for luxury;
- avoid synthetic background replacement that obscures condition.

---

## Above-the-fold composition

Recommended:
1. media;
2. compact identity block:
   - brand;
   - item title;
   - size/condition;
3. price/value;
4. one trust/urgency line if real;
5. sticky primary action.

Avoid:
- badge cluster above title;
- multiple bordered boxes between media and CTA;
- “premium” decorative dividers;
- sustainability before transaction basics.

---

## Listing-type variants

### Fixed-price
Primary action: `Buy` / `Buy now`.
Secondary: offer, message, save.

### Auction
Primary action: current required action (`Place bid` / `Buy now` if available).
Hero value is current bid + time/state.
Do not show fixed-price PDP assumptions.

### Co-Own
Primary: acquire units / trade state.
Hero must explain unit price and allocation.
Financial information is semantic, not decorative.

Use a common `CommerceDetailShell`, but allow each listing type to own the value/action region. Flagship consistency does not mean identical screens.

---

## Seller trust

Seller block should answer:
- who;
- verification;
- rating/track record if real;
- response/dispatch signal;
- location where relevant.

Do not show every trust metric by default. Collapse secondary details.

---

## Recommendation modules

Limit PDP tail to a deliberate sequence:
1. same/similar;
2. seller’s other items;
3. looks/posters containing the item if meaningful.

Do not append every available recommendation rail. The long tail should feel curated.

---

## Exact implementation backlog

### P0
- [ ] Audit `ItemDetailScreen.tsx` section order and define a view-model section registry.
- [ ] Make media → identity → price/state → CTA visually continuous.
- [ ] Remove duplicate media indicators/rails if the swipe stage already communicates pages.
- [ ] Define custom product-video chrome.
- [ ] Confirm every listing media object has stable `kind`, dimensions and poster when video.

### P1
- [ ] Move lower-value disclosures into progressive rows/sheets.
- [ ] Add condition-evidence gallery jump.
- [ ] Seller card becomes compact row with disclosure.
- [ ] Standardize recommendation tile metadata.
- [ ] Add skeletons that exactly match media/identity/CTA geometry.

### P2
- [ ] Session-aware recommendation order.
- [ ] Smart prefetch based on next likely PDP interaction.
- [ ] Optional media quality indicator during seller authoring, never on buyer PDP.

---

## Acceptance
- [ ] Mixed image/video listing can be understood without reading instructions.
- [ ] No audio bleeds from inactive video.
- [ ] Swipe and zoom gestures do not fight.
- [ ] First CTA is reachable without hunting.
- [ ] Sold/unavailable/paused/auction-ended states do not retain invalid CTAs.
- [ ] Buyer protection is visible before final transaction without dominating the hero.
- [ ] Media and primary transaction controls remain usable at 200% text.
