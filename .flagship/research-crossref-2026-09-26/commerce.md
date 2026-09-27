# Commerce cross-reference audit — PDP · bag · checkout · offers · orders · returns

**Date:** 2026-09-26 · **Scope:** `web/src/app/{item,bag,checkout,offers,orders,review}/**`, `web/src/components/{pdp,checkout,orders,bag,bundle}/**`, `web/src/lib/commerce/**` · **Mobile parity reference:** `frontend/src` (screens `ItemDetailScreen`, `BundleBagScreen`, `CheckoutScreen`, `OffersScreen`, `MyOrdersScreen`, `OrderDetailScreen`, `WriteReviewScreen`; components `commerce/detail`, `orders`, `offers`, `checkout`)

---

## 1. Reference grammar — what builds purchase confidence in 2026

Distilled from live research on the six benchmark marketplaces:

**Vinted** — the closest structural model. Buyer Protection fee is a named, itemized charge (5% + $0.70 fixed shape), shown *inside the listing price* ("£X incl. Buyer Protection") and again at checkout. Protection framing = escrow: payment held until confirmed delivery, full refund on non-arrival/not-as-described. Bundle flow is a first-class loop: create bundle from the PDP or seller page → live bundle price → Review → Buy now / Ask seller / **Make an offer on the bundle**. Offers capped at ~40% off ask, non-binding until the buyer pays (item stays buyable by others), ~25 offers/day cap. Sources: vinted.com help 25/258/260/342, pricelist.

**eBay View Item page** — the buy-box: condition, price, shipping cost *and* delivery estimate, returns line, and seller feedback all clustered with the CTAs. Two signal placements: **urgency** over the photo panel (watchers, "X sold", low stock, ending-soon) and **conversational** under the buttons ("N watchers", "sold in last 24h" — statistically A/B-ranked, per the arXiv signals paper). Best Offer = standing negotiation with payment authorized up-front, expiry, counter rounds. Purchase history = month-grouped chronological list with search + filters.

**Depop** — Make Offer is near-equal weight to Buy. Hard rules: **one active offer per item**, **24h seller expiry**, buyer has **24h to purchase** after acceptance; declined/expired → can re-offer. Seller side: Send Offer to likers (suggested discount prices, one-hour delay after like/bag) and **Auto-respond** (set lowest acceptable price → auto-accept at/above, auto-counter at floor, ~60s response). Depop Protection = automatic, all payment rails (Apple/Google Pay, card, Klarna).

**StockX / GOAT** — the *verification promise* is the product: "every order is inspected before it ships or shipped by a Verified Seller" + a named Buyer Promise (not-as-described → return → refund). Optional paid verification on the newer direct-listings marketplace, disclosed as adding delivery time — i.e., trust priced honestly. Bid/Ask grammar matters for market-priced goods; for one-of-one resale the transferable beat is the *authentication line at the decision point* and the tamper-evident tag narrative.

**Etsy** — returns transparency as conversion: every listing carries an explicit per-listing returns state ("14-day returns" / "Returns accepted" / "No returns"), window in days, who pays return shipping, exclusions. Sellers with complete policies measurably convert better; shops are required to declare. Estimated delivery is a dated range (processing + transit), not an adjective.

**Amazon** — delivery-date certainty as the primary confidence lever: a concrete date ("FREE delivery Tomorrow") gated by an **"order within" countdown**, with the honest caveat that the date can move until order placement. One-click Buy Now bypasses the cart entirely using saved defaults. Post-purchase: "Arriving" states with real carrier events.

**The 2026 confidence formula, distilled:**
1. **Delivery honesty** — dates or day-windows with a real backing field; "calculated at checkout" is the floor, a guaranteed dated promise is the ceiling. Stale ETAs must self-suppress.
2. **Protection framing** — escrow semantics ("held until you confirm"), full-refund scope, and the fee itemized everywhere money is shown — including inside offer totals.
3. **Price anchoring** — strike-through on real prior price, sold comparables, price-history ledger; never a fabricated RRP.
4. **Seller trust** — rating + count + verified + location at the decision point, not buried.
5. **Offer grammar** — named expiry, counter rounds, binding-total disclosure, accept→order, one-active-offer-per-item discipline.
6. **Post-purchase timeline quality** — real timestamps only, carrier-scan trail, stale-tracking honesty, inspection window, an escalation path that names who decides.

---

## 2. Our implementation

**PDP — `app/item/[id]/page.tsx`.** eBay-style two-zone grid: media + evidence left, buy panel pinned right for the whole scroll (`page.tsx:94-110`). Evidence order mirrors mobile ItemDetailScreen: About (specifics + description) → seller reviews → sustainability → price/market → Q&A → discovery rails → recently-viewed. Full state coverage: skeleton, error-retry (not misreported as removed), honest "no longer available".

**BuyPanel — `components/pdp/BuyPanel.tsx`.** Brand eyebrow → title → price hero with real strike-through only when `originalPrice` exists (`:196-208`) → **protection-inclusive price line** `£X incl. Buyer Protection` (`:210-220`, the Vinted beat) → facts grid (Condition/Size/Category, `:223-232`) → seller card with rating + count + verified + Follow (`:249-295`) → CTA grammar: primary Buy now, secondary Make-an-offer + bag icon, quiet Message seller (`:345-380`) → one conversational signal line built from real fields — views, likes, sold comps, "One only" (`:94-112`, the eBay conversational placement) → save/favourite/share + listed-ago meta (`:389-439`) → shipping block (method + origin + payer honesty, `:449-463`) → threshold-gated authentication line ≥£150 (`:469-483`, the StockX beat) → expandable Buyer Protection disclosure with escrow copy (`:488-524`) → bundle upsell (`:530`). Capability gate `listingCapabilities` (`lib/commerce/capabilities.ts:63-115`) suppresses every buy/offer affordance the backend would 409 — sold/reserved/paused/draft/removed/unknown status, away or suspended seller, missing price/seller — with factual state copy, never dead buttons.

**Gallery — `components/pdp/PdpGallery.tsx` + `PdpLightbox.tsx`.** Reserved-ratio stage (no CLS), focal-point-aware crops, thumbnail column on desktop / rail on mobile with active-thumb scroll-into-view (`:58-65`), sold scrim, badge cascade (price-drop wins over sustainability), on-media auction deadline chip only when a real deadline exists (`:208-241`, the eBay urgency placement). Lightbox: portal, Esc/backdrop close, arrow keys + buttons, pointer-drag swipe with rubber-band (`PdpLightbox.tsx:84-103`), synced thumb rail, `n / N` counter, aria-modal + focus restore. **Caveat: no actual magnification** — the stage cursor says `zoom-in` but the viewer fits to viewport; there is no zoom/pan level.

**OfferSheet — `components/pdp/OfferSheet.tsx`.** Item summary, £ input with live −% chip, quick-suggestion chips (−10/−20/−30%), **fee-inclusive "You pay if accepted" total computed on the offer not the ask** (`:46-49,156-171`), "seller has 48 hours to respond… charged only if they accept" binding disclosure (`:173-175`), Buy-now-is-better guard at ≥ ask (`:68-70`). Reused for counters from /offers.

**Bag — `app/bag/page.tsx` + `components/bag/BagSellerGroup.tsx` + `components/bundle/BundleUpsellRow.tsx`.** Vinted model: items grouped per seller (the parcel unit), per-group bundle-discount ledger line or "add 1 more" nudge that only renders when the seller has real stock (`BagSellerGroup.tsx:131-140,182-200`), flat totals ledger — items / postage-per-parcel / protection fee / bundle discount / total — with protection + authentication trust lines (`page.tsx:239-283`), bundle-hint rails of other stock from bagged sellers (`:191-234`), sold-out exclusions stated not silent (`:95-101,162-167`), save-for-later → /saved. `postage.ts` prices one flat parcel per seller, free only when every item is seller-covered — the same math checkout and recorded orders use, so the ledger never lies between surfaces. PDP bundle rail (`BundleUpsellRow`) has selectable thumbs, size/category facet chips derived from the rail pool, staged bundle ledger, "Add all to bag".

**Checkout — `app/checkout/page.tsx` + `components/checkout/{SelectionList,OrderSummary,CheckoutStates}.tsx`.** Address + payment radio pickers with ARIA roving-tabindex keyboard grammar, expired cards excluded from seeding (`SelectionList.tsx:23-44`; seeding `page.tsx:81-101`). OrderSummary is a **box manifest**: one numbered parcel per seller with its own postage + bundle lines, then the fee ledger (`OrderSummary.tsx:65-127`). Pay button carries the live total; the same capability gate as PDP re-checks `?item=` buys (`page.tsx:64-70`). Live mode: one order per listing → payment intent → settlement poll; only `succeeded` shows success, `pending` lands on the order's truthful unpaid state, partial failures name which items didn't order (`:117-227`). Trust lines sit at the Pay button (`:315-330`). Success screen: order id + dispatch SLA + three-step "what happens next" (`CheckoutStates.tsx:90-140`).

**Offers — `app/offers/page.tsx` + `components/orders/OfferRow.tsx` + `lib/commerce/offerAcceptance.ts`.** Received/Sent segmented tabs with counts; rows sorted actionable-first by soonest expiry (`page.tsx:125-136`); shared 30s clock so lazy-expired rows flip without refresh (`:99-105`). OfferRow: standing amount vs struck asking price, status word, counter ladder (asking → standing, never invents intermediate rounds, `OfferRow.tsx:124-152`), **ball-in-court made explicit** ("Your move" / "Waiting on @name", `:220-226`), live expiry countdown with urgency tones (`:96-113`), server-mirrored action grammar — non-author accepts/counters/declines, author withdraws (`:49-64`). Accept is a money move: it must return a recorded order id before any success surface, then deep-links to it (`offerAcceptance.ts`, `page.tsx:148-164`, `OfferRow.tsx:275-289`).

**Orders list — `app/orders/page.tsx`.** One canonical classifier (`components/orders/orderCapabilities.ts`) drives a collapsible **Needs attention lane** (pay > extension response > dispatch > resolution > report > inspect/confirm > review, ranked `:454-463`), month-grouped chronological history ("This month" / "September 2026" / year — the eBay purchase-history grammar, `page.tsx:49-71`), search over title/order-id/counterparty (`:149-170`), filter sheet (role/status/year), stale-refresh banner. Full state coverage.

**Order detail — `app/orders/[id]/page.tsx` + `components/orders/*`.** Capability projection `resolveOrderExperience` is the single interpreter — list row, lane and detail never disagree. eBay purchase-summary box: item line, postage with carrier/service, itemized protection fee, total, copyable order number, payment method, delivery address (`:467-577`). Conditional evidence sections: seller **DispatchCountdown** with ticking server deadline and honest "unavailable" fallback; **EscrowBanner** "Money held safely" + real `estimatedReleaseAt` auto-release line; **DispatchExtensionBanner** with inline buyer respond; **InspectionBanner** post-delivery check window; **OrderTrackingSection** — copyable tracking number, ETA banner that self-suppresses when stale (`OrderTrackingSection.tsx:62-67`), stale-tracking warning at >48h (`:69-72`), carrier-scan trail with real timestamps and locations; **OrderTimeline** — 4 milestones, and the honesty rule (`OrderTimeline.tsx:82-99`) that suppresses echoed `createdAt` stamps on shipped/delivered ("Confirmed", not a fake date); **OrderAuthenticationSection** on qualifying orders; **ReturnCaseCard** — a full bilateral state machine (request → approve/decline → reverse shipment + tracking → receipt → inspection → remedy proposal (full/partial/replacement/repair/none) → accept / appeal → platform step-in with eligibility window, `ReturnCaseCard.tsx`) — deeper than eBay's return flow. Actions are capability-driven primary + "More actions" sheet; live `created` orders honestly suppress Pay on web and say the app owns card confirmation (`page.tsx:741-746`).

**Review — `app/review/[orderId]/page.tsx`.** Full state machine: auth → loading → invalid → non-buyer → not-yet-reviewable → already-published read-only → composer → receipt; cache fan-out updates the seller's aggregate.

---

## 3. Gap table

| # | Reference pattern | Verdict | Evidence |
|---|---|---|---|
| 1 | Protection-inclusive price on listing (Vinted "incl. BP") | **MATCHED** | `BuyPanel.tsx:210-220`, `PdpBuyDock.tsx:76-80`, fee formula `fixtures-commerce.ts:198-203` (5% + £0.70, same shape as Vinted) |
| 2 | Escrow framing at decision point | **MATCHED** | `BuyPanel.tsx:485-524`; echoed at bag (`bag/page.tsx:270-273`) and checkout (`checkout/page.tsx:315-319`) |
| 3 | Bundle create → review → buy (Vinted) | **MATCHED** | `BundleUpsellRow`, `BagSellerGroup`, `postage.ts` per-parcel math |
| 4 | **Make offer on the bundle** (Vinted review-bundle grammar) | **MISSING** | Offers are per-listing only; bag has no offer action — `fixtures-commerce.ts:146-163`, `OfferSheet.tsx` |
| 5 | Offer sheet w/ suggestions + binding total + expiry | **MATCHED** | `OfferSheet.tsx:51-61,156-175` — 48h expiry (eBay-aligned; Depop is 24h) |
| 6 | One active offer per item / offer caps (Depop, Vinted ~40% floor) | **MISSING** | No client guard in `OfferSheet`/`recordSentOffer`; no max-discount bound (Vinted caps at −40%); relies on live backend |
| 7 | Seller auto-respond / floor price (Depop Auto-respond) | **MISSING** | `OfferToLikers` covers send-offer-to-likers; no auto-accept/auto-counter anywhere in `web/src` |
| 8 | eBay signal stack (urgency over media + conversational under CTAs) | **MATCHED** | Conversational line `BuyPanel.tsx:94-112` (views/likes/sold-comps, real fields only); on-media urgency `PdpGallery.tsx:208-241` (auction chip only when real). No "watchers" counter — likes stand in |
| 9 | Condition prominence w/ plain-English definition | **MATCHED** | `PdpAbout.tsx:117-140` (grade + definition + photos jump), facts grid `BuyPanel.tsx:223-232` |
| 10 | Shipping cost + delivery estimate on PDP | **DIVERGENT / MISSING on web** | Web contract has only `shippingMethod`/`shippingPayer` (`contracts/domain.ts:74-75`) → "calculated at checkout" floor. **Mobile contract already carries `shippingPrice`, `estimatedDeliveryStart/End`, `returnPolicy`** (`frontend/src/platform/product/listingDetailContract.ts:140-162`, rendered by `ShippingReturnsInfo.tsx`) — the web PDP is behind its own mobile app here |
| 11 | Returns transparency on listing (Etsy "N-day returns / No returns") | **MISSING on web** | No return-policy line on web PDP; mobile renders window/conditions/restocking fee (`ShippingReturnsInfo.tsx:64-74,148-169`) |
| 12 | Price anchoring — strike-through + sold comps + price history | **MATCHED** | `BuyPanel.tsx:196-208`; `PdpMarket.tsx` (listed-at, reduced, similar-sold range, time on market). No RRP field — honest absence, acceptable for resale |
| 13 | Verification promise (StockX/GOAT) | **MATCHED (threshold-gated)** | `BuyPanel.tsx:469-483` ≥£150 → `OrderAuthenticationSection`. StockX verifies *every* order; ours is premium-tier — deliberate scope, not a defect |
| 14 | Amazon "order within" countdown + guaranteed delivery date | **MISSING** | No cut-off countdown, no guaranteed-date grammar anywhere — ETA only exists post-purchase on in-transit orders |
| 15 | One-click buy (Amazon) | **PARTIAL** | Buy now → checkout with saved defaults; still a two-tap pay flow, no express path |
| 16 | Express payment rails (Apple/Google Pay, Klarna, PayPal — Depop/eBay/Amazon) | **MISSING** | `PaymentMethod.type: 'card' | 'bank_account'` only (`contracts/domain.ts:437`) |
| 17 | Order timeline fidelity — real timestamps | **MATCHED w/ honest suppression** | `OrderTimeline.tsx:82-99` — reached milestones without real stamps say "Confirmed", never echo `createdAt` |
| 18 | Carrier-scan trail + stale honesty | **MATCHED** | `OrderTrackingSection.tsx:51-178` — real events, >48h stale warning, ETA self-suppression |
| 19 | Dispatch SLA countdown (seller) | **MATCHED** | `DispatchCountdown.tsx` + `DISPATCH_SLA_DAYS = 2` (`lib/commerce/dispatch.ts`) echoed on the success screen |
| 20 | Escrow release estimate | **MATCHED** | `EscrowBanner.tsx:24-44` — server `estimatedReleaseAt` only, never invented |
| 21 | Return case depth (request→label→inspect→remedy→appeal→step-in) | **MATCHED — exceeds eBay grammar** | `ReturnCaseCard.tsx`, `ReturnRequestSheet.tsx` (full/partial refund, reason taxonomy, step-in eligibility window `getStepInState`) |
| 22 | eBay purchase-summary box (order #, payment, address) | **MATCHED** | `orders/[id]/page.tsx:467-577` — copyable order number, real payment method + address |
| 23 | Purchase-history grammar (search, filters, month groups, needs-action lane) | **MATCHED — exceeds** | `orders/page.tsx` — the needs-attention lane is ahead of eBay's flat history |
| 24 | Public Q&A on listing | **PARTIAL** | `ListingQA.tsx` renders ask/answer threads but writes are **session-local only** (`:51-63` — "design-mode counterpart"; no live POST) |
| 25 | Gallery zoom | **PARTIAL** | Fullscreen lightbox + swipe/keys/counter, but no magnification — stage `cursor-zoom-in` over-promises (`PdpGallery.tsx:103`) |
| 26 | Pay on web for unpaid live orders | **DIVERGENT (honest)** | Live `created` orders hide Pay and defer to the app (`orders/[id]/page.tsx:740-746`) — truthful but a real capability gap |
| 27 | Seller response expectation on offers (Depop "24h") | **MATCHED** | `OfferSheet.tsx:173-175` states 48h; `OfferRow` renders live expiry countdown |
| 28 | "Buy again" / reorder | **MATCHED** | `orders/[id]/page.tsx:758-767` when no primary action and listing still live |

---

## 4. Top caveats (ranked by purchase-confidence impact)

1. **PDP delivery + returns block is the thinnest part of the funnel — and thinner than our own mobile app.** Web renders "Delivery calculated at checkout" with no cost, no ETA, no returns line (`BuyPanel.tsx:449-463`). The mobile contract already carries `shippingPrice`, `estimatedDeliveryStart/End`, and `returnPolicy` (`frontend/src/platform/product/listingDetailContract.ts:140-162`) and renders them in `ShippingReturnsInfo.tsx` — including Etsy-grammar "N-day returns / No returns". The web `Listing` contract/mapper is the gap, not the design. This is the single highest-leverage fix: Vinted shows the shipping price on the listing, Etsy shows the return window, Amazon shows a dated promise — we show none of the three.

2. **Offer grammar is structurally complete but missing three reference rules.** No one-active-offer-per-item guard (Depop), no max-discount bound (Vinted ~40%), no seller auto-respond/floor (Depop Auto-respond replies within ~60s → 100% response rate). Also no bundle-level offer (Vinted's review-bundle → "Make an offer"). Composer itself is strong: suggestion chips, fee-on-offer total, binding disclosure, 48h expiry.

3. **Gallery zoom affordance over-promises.** `cursor-zoom-in` + "View full size photo" opens a fit-to-viewport lightbox with no magnification or pan — swipe/keyboard/counter are excellent, the zoom cue is not true.

4. **Q&A writes don't persist.** `ListingQA.tsx:51-63` appends to component state even in live mode — a posted question evaporates on remount while the toast says "Question posted". Either wire `POST /listings/:id/questions` or mark the composer honestly.

5. **No delivery-certainty grammar at purchase time.** No "order within" countdown, no guaranteed or estimated date shown before the order exists; ETA only appears post-purchase on in-transit orders. Given resale's inherent ship-by-SLA uncertainty this is defensible, but a dispatch-window statement ("seller dispatches within 2 working days" — the constant already exists in `dispatch.ts`) belongs on the PDP/checkout, not only on the success screen.

6. **Payment rails are narrow.** Card + bank account only (`contracts/domain.ts:437`) — no Apple/Google Pay, PayPal, or Klarna/BNPL that Depop, eBay and Amazon all treat as table stakes. Checkout is otherwise disciplined (expired methods excluded, idempotent order creation, honest pending states).

7. **Live 'created' orders can't be paid on web** (`orders/[id]/page.tsx:740-746`). Honestly disclosed ("complete it in the app"), but it's a real capability hole a buyer could hit after an interrupted checkout.

8. **Minor:** offer expiry is 48h vs Depop's 24h urgency (defensible, eBay-aligned); "watchers" doesn't exist as a public counter (likes carry the demand signal); no RRP anchor (acceptable — resale has no RRP; own-price-drop strike-through + sold comps carry anchoring well).

---

## 5. Where we already exceed the references

- **Return case flow** is deeper than eBay's: bilateral state machine with remedy negotiation (full/partial/replacement/repair), appeal, and a timed platform step-in.
- **Orders needs-attention lane** outperforms eBay's flat purchase history — one classifier shared by lane, tab, row and detail means surfaces can never disagree about whose move it is.
- **Fee honesty discipline** — protection fee is computed on the agreed offer amount, parcels price per-seller, and stale ETAs/echoed timestamps are actively suppressed rather than displayed. This "never fabricate" posture is stronger than Vinted/eBay's actual shipped surfaces.
- **Capability gating** — unavailable listings show factual state copy and a browse fallback, never a purchase button the backend would 409.
