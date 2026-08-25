# 03 — Product Detail, Checkout & Commerce: Flagship Research Report

**Department:** Product/asset detail, checkout, commerce components, buyout, make offer, order detail
**Date:** August 2026
**Scope:** `ItemDetailScreen.tsx`, `AssetDetailScreen.tsx`, `CheckoutScreen.tsx`, `BuyoutScreen.tsx`, `MakeOfferScreen.tsx`, `OrderDetailScreen.tsx`, `OrderReceiptScreen.tsx`, `BuyerProtectionScreen.tsx`, and all components under `components/product/`, `components/commerce/`, `components/checkout/`

---

## 1. 2026 Competitor Benchmark

### eBay — View Item Page (the 250M-views/day benchmark)

eBay's View Item page is the most-studied commerce PDP in the world, and their 2023–2026 modernisation effort is the clearest case study for what a mature marketplace product page must achieve. The key takeaways from eBay's redesign and subsequent search/PDP evolution:

- **Gallery first, taller images, thumbnail strip.** eBay made images taller and added a photo counter and gallery view, then in 2023 began showing thumbnail images under the main photo in the default mobile view — no extra tap required. The lesson: the gallery is the primary selling surface; pagination and thumbnail access must be zero-friction. eBay also consolidated delivery options into one place and added a "Shopping View" with larger, rounded-corner images.
- **Sticky buy bar.** eBay's mobile PDP keeps a persistent bottom bar with price + Buy It Now / Make Offer. The bar is the single dominant action surface; it never competes with in-page CTAs.
- **Trust signals layered, not stacked.** eBay shows seller rating, feedback count, and dispatch time as compact inline facts near the price — not as a separate "seller card" that pushes the buy action below the fold. Returns policy and shipping cost are visible in a collapsed summary that expands on tap.
- **Shipping clarity.** eBay's 2024–2026 redesign centralised all delivery and shipping options in one location with transparent pricing. This directly addresses the #1 checkout abandonment driver: surprise fees (55% of abandons per Baymard).
- **Progressive disclosure of specs.** eBay uses collapsible sections for item specifics, shipping, returns, and seller info. The first viewport shows image + title + price + one trust line + the buy bar. Everything else is one tap away.

### Instagram Shopping — Social Commerce PDP (2026 reality)

Instagram's commerce model underwent a major shift: Meta deprecated native in-app checkout for most US businesses by August 2025. In 2026, Instagram Shopping is a **discovery and product-detail channel**, not a checkout channel. The PDP that appears when a user taps a product tag is now a confirmation surface that routes to the merchant's own store. The key patterns:

- **Above-the-fold = purchase confirmation.** Instagram's in-app PDP shows product image, name, price, and a buy button in the first viewport. If the buyer has to scroll to see price or buy, a measurable portion leaves before scrolling. The mobile PDP is a "purchase confirmation screen, not a browsing screen."
- **Visual register matching.** Social-referred shoppers convert at 1.4× the rate of organic search visitors when the PDP matches the visual register of the content that sent them — and abandon at 2.3× the rate when it doesn't. The PDP must feel like a continuation of the discovery surface, not a jarring context switch.
- **Minimal chrome, media-dominant.** Instagram's PDP strips navigation chrome and lets the product image dominate. Trust signals (seller name, price, availability) are quiet text overlays or compact rows beneath the image.
- **One-tap to checkout intent.** The buy action is a single prominent button. There is no multi-step in-page form; the user taps once and is routed to checkout.

### Cross-platform synthesis for ThryftVerse

| Dimension | eBay 2026 | Instagram 2026 | ThryftVerse target |
|---|---|---|---|
| Gallery | Taller images, inline thumbnails, counter | Media-dominant, minimal chrome | Full-bleed media stage, inline pagination, thumbnail rail for >5 images |
| Sticky buy | Persistent bottom bar, price + primary action | Single prominent CTA | `CommerceDetailStateDock` with value + primary + secondary |
| Trust signals | Inline facts near price, expandable details | Quiet text, seller name | Trust facts zone (max 3), buyer protection strip, seller row below description |
| Shipping clarity | Centralised, transparent, collapsed summary | Price + availability visible | `ShippingReturnsInfo` with summary line + expandable breakdown |
| Specs disclosure | Collapsible sections, first viewport = image+price+buy | Minimal, confirmation-first | Progressive disclosure: identity → trust → description → seller → shipping → discovery |
| Seller info | Rating, feedback, dispatch time inline | Seller name, quiet | `SellerInfoCard` with concise trust line, verification badge, follow/message |

---

## 2. Psychology & Principles

### Trust building (the stranger-to-stranger problem)

ThryftVerse is a peer-to-peer marketplace — the buyer is sending money to a stranger and trusting that an item will arrive as described. This is the single highest-anxiety transaction in e-commerce. The 2026 research is unambiguous: trust signals must appear **at the moment of doubt**, not buried in a footer. The most load-bearing placements are:

1. **Directly under the product title, in the same viewport as the price** — seller rating + review count. This is the #1 trust signal per Baymard and Michael Dishmon's field research. A 4.6★ average with 3,400 reviews is stronger than 5★ with 12 reviews — volume signals real-world validation.
2. **Near the buy button** — buyer protection / escrow language. "Your money is held safely until you confirm receipt" directly addresses the commitment anxiety that peaks at the CTA.
3. **In the checkout flow, before the payment step** — the `BuyerProtectionStrip` must appear after selection rows and before the price breakdown, exactly where ThryftVerse currently places it (`CheckoutScreen.tsx` line 1434).

### Scarcity & social proof

Scarcity signals ("23 watching", "5 similar sold", "3 days on market") are powerful but must be **truthful**. ThryftVerse already implements this correctly in `ItemDetailScreen.tsx` (lines 680–732): `priceInsightRows` only render when real backend data exists (`soldComps.sampleSize >= 2`, `priceHistory[0]`, `daysListed >= 3`). The `interestSignal` (line 639) only shows likes when `item.likes > 0`. This is the correct pattern — never fabricate scarcity.

### Price anchoring

The strikethrough original price + discount badge pattern (eBay/Depop) is implemented in `CommerceDetailIdentity.tsx` (lines 168–185) and `CommerceDetailStateDock.tsx` (lines 226–233). The original price is shown with `textDecorationLine: 'line-through'` and the discount badge uses `colors.danger` fill. This is the correct visual language — the savings are communicated visually without requiring the user to read a text line.

### Progressive disclosure of specs

Baymard's research shows that 26% of mobile sites use subpages for product details, causing users to overlook important content entirely. The solution is **inline progressive disclosure**: collapsed summary visible, details expand on tap. ThryftVerse implements this via `CommerceDetailDisclosureRow` for shipping, price history, and Q&A sections. The `ShippingReturnsInfo` component (lines 88–176) shows a summary line always visible and expands the full breakdown on tap. This is the correct pattern.

### Friction tuning at checkout

The 2026 checkout research identifies 12 must-have mobile features. ThryftVerse's `CheckoutScreen.tsx` already implements most of them:

- **Guest checkout** — not forced (the screen checks `currentUser` but doesn't block; it shows a sign-in prompt).
- **One-tap payment** — Apple Pay / Google Pay integration via Stripe PaymentSheet (lines 752–763).
- **Address autofill** — address selection via `AddressForm` navigation.
- **Inline validation** — `checkoutEligible` useMemo (lines 361–374) computes real-time eligibility.
- **Transparent pricing** — compact summary in the sticky footer (lines 1527–1569) shows item, delivery, buyer protection, and total before the Pay button.
- **Sticky order summary** — the footer is always visible with the total.
- **Trust badges near payment** — `BuyerProtectionStrip` placed before the price breakdown.
- **Saved payment and shipping** — `savedAddress` and `savedPaymentMethod` from the store.
- **Single-page checkout** — all selection rows on one scrollable page, no multi-step wizard.

### Loss aversion

The inspection window in `OrderDetailScreen.tsx` (lines 405–477) is a textbook loss-aversion design: "X days left to report an issue" with a deadline derived from the server (`inspectionDeadlineAt`). The countdown creates urgency without fabricating a deadline — the client only formats the server-provided timestamp. This is the correct truthful-UI pattern per AGENTS.md §11.

---

## 3. Current ThryftVerse Audit

### What works well (preserve & elevate)

The codebase has already undergone significant flagship work. The following are production-grade and should be preserved:

1. **`CommerceMediaStage`** — full pinch-zoom, pan, double-tap, video support with bespoke controls, swipe-to-dismiss, shared element transitions. This is a strong gallery implementation (`CommerceMediaStage.tsx`, 639+ lines).
2. **`CommerceDetailStateDock`** — the sticky action dock with value cluster, primary/secondary actions, auto-stacking on compact widths, buyer protection strip flattened into the dock surface. This is the correct pattern per AGENTS.md §4 (no card-on-card) (`CommerceDetailStateDock.tsx`, 542 lines).
3. **`CommerceDetailIdentity`** — flat composition, family-aware price eligibility, media-tone support, compact/standard density. Correctly suppresses price for auction/co-own families (`CommerceDetailIdentity.tsx`, 372 lines).
4. **`SellerInfoCard`** — concise trust line (not a KPI card), verification badge, quiet text actions for follow/message. Correctly omits missing values per truthful UI (`SellerInfoCard.tsx`, 288 lines).
5. **`ShippingReturnsInfo`** — expandable, flat canvas, truthful values with "Confirmed at checkout" fallbacks. Carbon-neutral badge only renders when the backend flag is true (`ShippingReturnsInfo.tsx`, 247 lines).
6. **`CheckoutScreen`** — one-page checkout with real-time eligibility, Stripe PaymentSheet integration, 3DS/SCA polling, order idempotency, stale-order cancellation, partial-data prompts. This is a sophisticated, production-grade checkout (`CheckoutScreen.tsx`, 1577+ lines).
7. **`MakeOfferScreen`** — two-step flow (compose → review), quick-offer chips, counter-offer comparison, seller minimum floor, expiry selector, buyer protection trust signal, tip about acceptance probability. Well-designed (`MakeOfferScreen.tsx`, 1110+ lines).
8. **`OrderDetailScreen`** — status stepper, tracking timeline, parcel events, inspection banner with server-derived deadline, issue category selector, review prompt, completed order summary. Comprehensive (`OrderDetailScreen.tsx`, 1123+ lines).

### Concrete defects to address

#### Defect 1: BuyoutScreen uses legacy design tokens and card-on-card composition

`BuyoutScreen.tsx` (lines 312–417) uses the older `Radius`, `Type`, `Typography` tokens instead of the v2 `TypographyV2` / `RadiusRoleValue` system used by the commerce detail screens. The `positionCard` (line 329), `statusCard` (line 351), and `formCard` (line 392) are three separate bordered cards stacked vertically — a card-on-card composition that violates AGENTS.md §4 ("No card-on-card composition. A nested surface requires a distinct interaction or state boundary. Otherwise flatten it."). The `statusIconWrap` (line 358) is a 44pt+ rounded square containing an icon — decorative chrome that adds visual noise without communicating state. The `futureFeatures` and `futureFeatureRow` styles (lines 378–391) are defined but appear unused — dead code that should be removed.

#### Defect 2: BuyerProtectionScreen uses heavy card-on-card layout

`BuyerProtectionScreen.tsx` (lines 319–483) wraps every section in a separate bordered card: `coverageCard` (line 343), `sectionCard` (line 395), `claimForm` (line 452). The `coverageIcon` (line 355) is a 36pt circular badge inside the card — decorative chrome. The "What's covered" list (lines 206–223) uses 18pt checkmark icons in a card, when flat rows with hairline separators would be cleaner. This screen has not received the flagship treatment that the commerce detail screens have.

#### Defect 3: OrderReceiptScreen uses a single large receipt card

`OrderReceiptScreen.tsx` (lines 293–383) wraps the entire receipt in one large `receiptCard` (line 67) with `nextStepsCard` nested inside (line 367) — card-on-card. The success header (lines 282–291) uses a `successIconWrap` circular badge. The skeleton (lines 168–188) is a reasonable layout match but the final composition is card-heavy compared to the flat-canvas approach used in `ItemDetailScreen`.

#### Defect 4: Gallery pagination lacks thumbnail rail for long galleries

`ItemDetailScreen.tsx` (lines 854–872) implements pagination as dots (≤5 images) or a counter text (>5 images). eBay's 2023 update added inline thumbnail strips under the main photo for mobile shoppers — a pattern that lets users jump to any image without paging through. ThryftVerse's counter-only approach for >5 images is functional but not flagship. A thumbnail rail (or at minimum a scrubable strip) would match the eBay benchmark.

#### Defect 5: Trust facts zone is incomplete for items with no seller rating

`ItemDetailScreen.tsx` (lines 968–1018) builds `trustRows` from seller rating and dispatch time. When both are absent, the zone returns `null` (line 994) — the first viewport has no trust signal at all. For a stranger-to-stranger marketplace, this is a critical gap. Even when seller rating is unavailable, the buyer protection / escrow guarantee should appear as a trust fact in this zone, not only in the dock and checkout.

#### Defect 6: Checkout footer has duplicate trust signalling potential

`CheckoutScreen.tsx` places `BuyerProtectionStrip` at line 1434 (correct) but the footer (lines 1524–1577) does not include a trust badge. The dock on the PDP (`CommerceDetailStateDock`) has a `showProtectionStrip` prop that renders "Buyer Protection" in the dock. At checkout, the protection strip is in the scroll content but the sticky footer (which is always visible) has no trust signal. If the user scrolls past the strip, the only trust signal near the Pay button is the terms text (line 1519). A compact protection indicator in the footer would address the "trust badges near payment fields" best practice.

#### Defect 7: BuyoutScreen and BuyerProtectionScreen have not adopted FlagshipScreen/Header consistently

`BuyoutScreen.tsx` uses `FlagshipScreen` and `FlagshipHeader` (lines 19–23, 136–148) — good. `BuyerProtectionScreen.tsx` also uses them (lines 29–30, 135) — good. However, `OrderReceiptScreen.tsx` (lines 157–274) uses a manual header with `Pressable` back button and `Text` title — it has not adopted `FlagshipHeader`. `OrderDetailScreen.tsx` (lines 695–746) also uses a manual header. For consistency across the commerce flow, these should adopt the shared `FlagshipHeader` primitive.

#### Defect 8: MakeOfferScreen review overlay uses absolute positioning instead of BottomSheet

`MakeOfferScreen.tsx` (lines 535–680) implements the review step as a custom `reviewOverlay` with `reviewBackdrop` and `reviewSheet` using `...StyleSheet.absoluteFill` and `position: 'absolute'`. The codebase has a shared `BottomSheet` component (imported in `ItemDetailScreen.tsx` line 51). The custom overlay duplicates bottom-sheet behaviour and may not handle safe areas, keyboard, or gesture dismissal as robustly as the shared primitive.

#### Defect 9: AssetDetailScreen single-image gallery has no pagination or thumbnail

`AssetDetailScreen.tsx` (line 414) constructs `images` as a single-element array when `asset.imageUrl` exists. The `CommerceMediaStage` is rendered with this single image (lines 587–603). For Co-Own assets with only one image, there is no visual indication that the gallery is non-paginated (no dots, no counter). This is correct behaviour but the media stage should gracefully handle the single-image case without rendering pagination controls.

#### Defect 10: No "in-scale" reference image support

Baymard research shows 42% of users try to determine size from images, yet 28% of sites lack proper scale reference images. ThryftVerse's `CommerceMediaStage` and `CategoryEvidence` system support detailed specs but there is no explicit "in-scale" image type or on-model photo support. For fashion (the primary category), at least one image showing the item on a person or next to a familiar object would address this gap.

---

## 4. Micro Improvements

### M1: Add buyer protection to the PDP trust facts zone

In `ItemDetailScreen.tsx`, when `trustRows` would be empty (no seller rating, no dispatch time), inject a buyer protection fact row so the first viewport always has at least one trust signal:

```typescript
// After line 994 (if (trustRows.length === 0) return null)
if (trustRows.length === 0 && commerce.protectionPolicy?.available) {
  trustRows.push({
    icon: 'shield-checkmark-outline',
    label: commerce.protectionPolicy.label ?? 'Buyer Protection',
  });
}
```

### M2: Remove dead code in BuyoutScreen

`BuyoutScreen.tsx` lines 378–391 define `futureFeatures`, `futureFeatureRow`, and `futureFeatureText` styles that are not referenced in the render tree. Remove them to reduce confusion.

### M3: Flatten BuyoutScreen card-on-card composition

Replace the three stacked cards (`positionCard`, `statusCard`, `formCard`) with flat sections separated by hairlines, matching the `CommerceDetailSection` pattern used in `ItemDetailScreen`. The position summary becomes flat rows; the status message becomes an inline banner; the form fields sit on the canvas with a single hairline divider above the label.

### M4: Add compact trust indicator to checkout footer

In `CheckoutScreen.tsx`, add a compact buyer-protection icon+text line in the footer between the compact summary and the Pay button row, so a trust signal is always visible near the payment action even when the user has scrolled past the `BuyerProtectionStrip`.

### M5: Adopt FlagshipHeader in OrderReceiptScreen and OrderDetailScreen

Replace the manual header JSX in `OrderReceiptScreen.tsx` (lines 161–167, 197–203, 219–225, 253–274) and `OrderDetailScreen.tsx` (lines 695–746) with `FlagshipHeader` for visual consistency across the commerce flow.

### M6: Add thumbnail rail for galleries >5 images

In `ItemDetailScreen.tsx`, when `item.images.length > 5`, render a horizontal thumbnail strip below the media stage instead of (or in addition to) the counter text. Each thumbnail is a small `CachedImage` with the active one highlighted by a hairline border. Tapping a thumbnail jumps the carousel to that index.

### M7: Use shared BottomSheet for MakeOfferScreen review step

Replace the custom `reviewOverlay`/`reviewSheet` in `MakeOfferScreen.tsx` (lines 535–680) with the shared `BottomSheet` component, preserving the review content but gaining consistent safe-area, gesture, and backdrop handling.

### M8: Flatten BuyerProtectionScreen card-on-card

Replace `coverageCard`, `sectionCard`, and `claimForm` with flat sections separated by hairlines. The coverage summary becomes a flat row with an inline icon; the "What's covered" list becomes flat rows with 16pt checkmark glyphs and hairline separators; the claim form sits on the canvas with labelled inputs.

---

## 5. Macro Improvements

### Macro A: PDP architecture — zone system formalisation

The `ItemDetailScreen` already follows a zone architecture (A: media, B: identity, C: trust facts, D: description, E: seller, F: shipping, G: discovery, I: dock). This should be formalised as a shared composition contract so `AssetDetailScreen` and future commerce detail screens follow the same zone order with family-specific content:

```
Zone A — Media stage (full-bleed, no identity overlay)
Zone B — Identity seam (title, price, one secondary line)
Zone C — Trust facts (max 3 inline rows, always at least 1)
Zone D — Description / story (progressive disclosure)
Zone E — Seller / issuer (compact, links to profile)
Zone F — Shipping & returns / commerce details (collapsed)
Zone G — Discovery / recommendations (below fold)
Zone I — Sticky action dock (value + primary + secondary)
```

The `AssetDetailScreen` already follows a viewer-aware variant (holder vs non-holder ordering). The formalisation ensures any new commerce family (auction, brokered) inherits the same zone rhythm without ad-hoc composition.

### Macro B: Sticky footer system unification

Currently there are three sticky-footer implementations:
1. `CommerceDetailStateDock` — used by `ItemDetailScreen` and `AssetDetailScreen`
2. `CommerceStickyDock` — a generic wrapper used by Co-Own screens
3. Manual footer `View` — used by `CheckoutScreen` (lines 1524–1577) and `MakeOfferScreen` (lines 687–711)

These should be unified into a single `CommerceStickyDock` system that accepts:
- A value cluster (price, label, thumbnail, shipping hint)
- A protection strip (tier-adaptive, flattened into the dock surface)
- A compact summary (for checkout: item/delivery/protection/total)
- Primary and secondary actions (with auto-stacking on compact widths)

This eliminates three parallel implementations and ensures the dock geometry, safe-area handling, and elevation are consistent across all commerce surfaces.

### Macro C: Trust layer — category-adaptive and always-present

The trust layer should be elevated to a first-class system with three tiers:

1. **Inline trust facts** (Zone C on PDP) — seller rating, dispatch time, buyer protection. Always at least one fact, even for new sellers with no rating.
2. **Dock protection strip** — the `CommerceDetailStateDock` already supports `commerceTier`-adaptive copy (`authenticated_luxury`, `brokered`, `specialist`, `standard`). This should be extended to all commerce surfaces.
3. **Checkout protection strip** — `BuyerProtectionStrip` in the scroll content + a compact indicator in the sticky footer.

The trust layer must be **truthful** — only render signals when the backend provides the data. The `SellerInfoCard` already follows this pattern (lines 66–88: stats only push when values are non-null). The same discipline must apply to the trust facts zone.

### Macro D: Gallery art direction

The `CommerceMediaStage` is technically strong (pinch-zoom, video, shared transitions) but lacks art-direction intelligence:

1. **Category-sensitive focal points** — `CachedImage` supports `focalPoint` (line 211 of `CommerceMediaStage.tsx`) but this is only used when `item.focalPoint` is set. The system should default to category-appropriate focal positioning (e.g. centre-top for shoes, centre for bags, top for portraits).
2. **In-scale reference** — add support for an "on-model" or "in-scale" image type in the `ProductMediaItem` contract. When present, the gallery should badge it as "On model" or "Size reference" so users know it shows scale.
3. **Thumbnail rail** — for galleries >5 images, a horizontal thumbnail strip with active-state highlighting, matching eBay's 2023 mobile update.
4. **Video prominence** — when a video is present in the gallery, it should be indicated on the first thumbnail (a small play glyph overlay) so users know to swipe to it.

---

## 6. Flagship Acceptance Criteria

A flagship product detail + commerce flow must pass all of the following:

### PDP (ItemDetailScreen / AssetDetailScreen)

- [ ] First viewport shows: media stage, title, price (direct family), at least one trust fact, and the sticky dock with the primary action.
- [ ] Gallery supports pinch-zoom, double-tap zoom, pan, fullscreen, swipe-to-dismiss, and video with bespoke controls.
- [ ] Galleries >5 images show a thumbnail rail (not just a counter).
- [ ] Trust facts zone (Zone C) always renders at least one fact — buyer protection when seller rating is unavailable.
- [ ] Description uses progressive disclosure (collapsed 3-line with gradient fade, expands on tap).
- [ ] Seller row is compact, links to profile, shows verification badge and concise trust line (not a KPI card).
- [ ] Shipping & returns is collapsed by default with a summary line, expands to full breakdown.
- [ ] Sticky dock shows value + primary action + at most one secondary action, auto-stacks on compact widths.
- [ ] Dock protection strip is tier-adaptive and flattened into the dock surface (no card-on-card).
- [ ] All states covered: loading (`ProductDetailSkeleton`), error (`CommerceStateCanvas`), unavailable, offline (`CommerceDetailOfflineBanner`), sold, owner.
- [ ] No fabricated data — price insights, sold comparables, and interest signals only render when backend data exists.
- [ ] No "Coming soon" or dead buttons (verified: grep finds zero matches in product/commerce/checkout components).

### Checkout (CheckoutScreen)

- [ ] One-page layout — all selection rows (address, delivery, payment) on a single scrollable page.
- [ ] Real-time eligibility computation — Pay button disabled until all requirements met, with truthful disabled state.
- [ ] Compact order summary in sticky footer — item, delivery, buyer protection, wallet, total visible at all times.
- [ ] Buyer protection strip placed after selection rows, before price breakdown.
- [ ] Compact trust indicator in the footer near the Pay button.
- [ ] Apple Pay / Google Pay integration via Stripe PaymentSheet with 3DS/SCA polling.
- [ ] Order idempotency with signature-based reuse and stale-order cancellation.
- [ ] Partial-data prompts (address missing, payment missing, shipping quote unavailable) with retry actions.
- [ ] All payment states visible: creating_order, opening_payment, authenticating, awaiting_payment, succeeded, pending, failed.
- [ ] Loading skeleton matches final layout geometry.
- [ ] Self-purchase and signed-out guard states.

### Make Offer (MakeOfferScreen)

- [ ] Two-step flow: compose → review → send.
- [ ] Quick-offer chips (80%, 90%, 95%) with dynamic discount percentage indicator.
- [ ] Counter-offer comparison (previous vs new, side by side).
- [ ] Seller minimum offer floor validation.
- [ ] Expiry selector (24h, 48h, 72h) with hint text.
- [ ] Buyer protection trust signal and acceptance-probability tip.
- [ ] Review step uses shared `BottomSheet` (not custom overlay).
- [ ] Loading, error, and retry states for listing fetch and offer submission.

### Buyout (BuyoutScreen)

- [ ] Flat canvas composition (no card-on-card) — position summary, status, and form as flat sections with hairline separators.
- [ ] Uses v2 design tokens (`TypographyV2`, `RadiusRoleValue`) consistent with commerce detail screens.
- [ ] Sticky action dock with Back + Submit offer (or Back to item when owns 100%).
- [ ] Loading, error, and 100%-ownership states.
- [ ] No dead code (`futureFeatures` styles removed).

### Order Detail (OrderDetailScreen)

- [ ] Status stepper with semantic stage mapping and failure state.
- [ ] Tracking timeline with parcel events, carrier links, and stale-tracking indicator.
- [ ] Inspection banner with server-derived deadline (no client-invented windows).
- [ ] Issue category selector with object-specific categories.
- [ ] Completed order summary with receipt, review, buy-again, and support history actions.
- [ ] Buyer/seller-aware composition (counterparty resolution, role-specific actions).
- [ ] Polling interval adapts to order status (30s for active, 5min for terminal).
- [ ] Uses `FlagshipHeader` for header consistency.

### Order Receipt (OrderReceiptScreen)

- [ ] Flat composition (no card-on-card) — receipt content as flat rows with hairline separators.
- [ ] Uses `FlagshipHeader` for header consistency.
- [ ] Success header for completed orders, pending notice for in-progress orders.
- [ ] Copy order ID, share receipt, print (web only) actions.
- [ ] Immutable record notice and pending update notice.
- [ ] "What happens next" contextual steps for pending buyer orders.
- [ ] Loading skeleton matches final layout.
- [ ] Access guard (buyer/seller only).

### Buyer Protection (BuyerProtectionScreen)

- [ ] Flat canvas composition (no card-on-card) — coverage, what's covered, claims, and form as flat sections.
- [ ] Coverage summary with fee, coverage amount, and eligible-until date.
- [ ] Claims history with status indicators.
- [ ] Claim form with reason, description, and submit confirmation.
- [ ] Loading, error, and retry states.

---

## 7. Priority & Sequencing

### Phase 1 — Trust & truth fixes (highest impact, lowest effort)

| Priority | Task | Files | Impact |
|---|---|---|---|
| P0 | Add buyer protection to PDP trust facts zone when seller rating is absent | `ItemDetailScreen.tsx` | First-viewport trust signal for new sellers |
| P0 | Add compact trust indicator to checkout footer | `CheckoutScreen.tsx` | Trust signal always visible near Pay button |
| P1 | Remove dead code in BuyoutScreen | `BuyoutScreen.tsx` | Code cleanliness |

### Phase 2 — Card-on-card flattening (medium effort, high visual impact)

| Priority | Task | Files | Impact |
|---|---|---|---|
| P1 | Flatten BuyoutScreen to flat sections with hairlines | `BuyoutScreen.tsx` | Eliminates card-on-card, matches PDP pattern |
| P1 | Flatten BuyerProtectionScreen to flat sections | `BuyerProtectionScreen.tsx` | Eliminates card-on-card, matches PDP pattern |
| P1 | Flatten OrderReceiptScreen receipt card | `OrderReceiptScreen.tsx` | Eliminates card-on-card, matches PDP pattern |
| P2 | Migrate BuyoutScreen to v2 design tokens | `BuyoutScreen.tsx` | Token consistency across commerce flow |

### Phase 3 — Header & sheet consistency (medium effort, medium impact)

| Priority | Task | Files | Impact |
|---|---|---|---|
| P2 | Adopt FlagshipHeader in OrderReceiptScreen | `OrderReceiptScreen.tsx` | Header consistency |
| P2 | Adopt FlagshipHeader in OrderDetailScreen | `OrderDetailScreen.tsx` | Header consistency |
| P2 | Replace MakeOfferScreen review overlay with shared BottomSheet | `MakeOfferScreen.tsx` | Sheet behaviour consistency |

### Phase 4 — Gallery & dock system (higher effort, flagship differentiation)

| Priority | Task | Files | Impact |
|---|---|---|---|
| P2 | Add thumbnail rail for galleries >5 images | `ItemDetailScreen.tsx`, `CommerceMediaStage.tsx` | Matches eBay 2026 benchmark |
| P3 | Unify sticky footer into single CommerceStickyDock system | `CommerceStickyDock.tsx`, `CommerceDetailStateDock.tsx`, `CheckoutScreen.tsx`, `MakeOfferScreen.tsx` | Eliminates 3 parallel implementations |
| P3 | Formalise PDP zone system as shared composition contract | New shared module | Ensures future commerce families inherit zone rhythm |
| P3 | Add category-sensitive default focal points to gallery | `CommerceMediaStage.tsx` | Art-direction intelligence |
| P4 | Add "in-scale" / "on-model" image type support | `ProductMediaItem` contract, `CommerceMediaStage.tsx` | Addresses Baymard 28% gap |

### Phase 5 — Polish & edge states (lowest priority, completeness)

| Priority | Task | Files | Impact |
|---|---|---|---|
| P4 | Video presence indicator on first thumbnail | `CommerceMediaStage.tsx` | Discoverability of video content |
| P4 | Single-image gallery graceful handling (no pagination controls) | `CommerceMediaStage.tsx` | Clean single-image state |
| P4 | Buyer protection screen claim form keyboard handling audit | `BuyerProtectionScreen.tsx` | Keyboard-aware scroll behaviour |

---

## Appendix: Key File References

| File | Lines | Role |
|---|---|---|
| `ItemDetailScreen.tsx` | 1481+ | Direct listing PDP — zone architecture, swipe-to-dismiss, pagination |
| `AssetDetailScreen.tsx` | 929+ | Co-Own asset PDP — viewer-aware composition, market details, order book |
| `CheckoutScreen.tsx` | 1577+ | One-page checkout — Stripe, 3DS, idempotency, partial-data |
| `BuyoutScreen.tsx` | 417 | Co-Own buyout offer — **needs flattening + token migration** |
| `MakeOfferScreen.tsx` | 1110+ | Offer/counter-offer — two-step flow, quick-offer chips |
| `OrderDetailScreen.tsx` | 1123+ | Order tracking — timeline, inspection, issue selector |
| `OrderReceiptScreen.tsx` | 476+ | Receipt — **needs flattening + FlagshipHeader** |
| `BuyerProtectionScreen.tsx` | 483 | Protection claims — **needs flattening** |
| `CommerceMediaStage.tsx` | 639+ | Gallery engine — pinch-zoom, video, shared transitions |
| `CommerceDetailStateDock.tsx` | 542 | Sticky dock — value cluster, actions, protection strip |
| `CommerceDetailIdentity.tsx` | 372 | Identity seam — family-aware, media-tone support |
| `SellerInfoCard.tsx` | 288 | Seller module — concise trust line, verification, actions |
| `ShippingReturnsInfo.tsx` | 247 | Shipping section — expandable, truthful fallbacks |
| `BuyerProtectionStrip.tsx` | 126 | Trust strip — compact and full variants |
| `CheckoutItemSummary.tsx` | 113 | Checkout item row — image, title, seller, price |
