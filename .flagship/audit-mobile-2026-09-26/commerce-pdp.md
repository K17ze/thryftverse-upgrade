# Audit — Commerce (PDP + bag + checkout + orders + offers) (mobile) — 2026-09-26

## Verdict
The mobile commerce spine is strong: ItemDetailScreen is a disciplined orchestrator with honest capability-driven docks, full state coverage, progressive disclosure, and a real QA/size-guide/offer sheet stack; checkout and order surfaces exceed the web in correctness (capability projection, escrow, return-case state machine, unknown-outcome handling). The material gaps are structural: there is no bag at all (the PDP can't add-to-bag, and "bundle checkout" quietly degrades to a single item while quoting a multi-item total), no seller-reviews section on the PDP, no recently-viewed memory, and the eBay conversational-signal beat under the buy buttons is absent.

## Findings

### C-01 — Bundle checkout CTA quotes the multi-item total, then checks out only the first item [P0]
- Screens: `frontend/src/screens/BundleBagScreen.tsx`; `frontend/src/components/product/BundleUpsellRow.tsx`
- Evidence: `BundleBagScreen.tsx:181-182` renders `Checkout · {formattedTotal}` where `total` is the subtotal of ALL selected items (line 46-53); `handleCheckout` (lines 74-83) then navigates to `Checkout` with only `selectedItems[0].id` after an info toast. The commitment CTA misquotes the amount the buyer will actually pay — the checkout screen will show a different, lower total for a different basket.
- Web parity: web `/bag` and `/checkout` honour a real bag (`web/src/app/bag/page.tsx`, `web/src/app/checkout/page.tsx`) — though live mode there also collapses to the first item (`checkout/page.tsx:97-118`), web's CTA and ledger stay consistent about it.
- Competitor: Vinted bundle flow — the whole point of bundling is one parcel; a bundle UI that can't transact as a bundle is a dead end.
- Root cause: the backend orders one listing per order (`BundleBagScreen.tsx:79-81` comment); the screen was built as if multi-item orders existed.
- Fix: until multi-item orders exist, reframe the surface as "Buy together" — per-item pay rows, or remove the combined Total/CTA and keep it a selection rail that opens sequential checkouts with an honest "pay per item" caption. Never quote a price the next screen won't honour.
- Acceptance: the number on the primary CTA always equals the amount charged on the very next screen; no multi-item total appears alongside a single-item checkout.

### C-02 — No bag/cart surface on mobile: PDP has no add-to-bag, bag nav has no entry point [P1]
- Screens: `frontend/src/screens/ItemDetailScreen.tsx`, `frontend/src/components/commerce/detail/CommerceActionDock.tsx`, `frontend/src/navigation/types.ts`
- Evidence: nav registry contains only `BundleBag` (`types.ts:516,719`) — no Bag/Cart screen exists anywhere under `screens/`; `useStore` bag APIs are never called in screens (grep for `addToBag` finds only BundleBag navigation strings). The PDP dock offers Buy now / Make offer / Enquire only (`CommerceActionDock.tsx:232-328`) — there is no way to stage an item for later purchase.
- Web parity: web `BuyPanel` has an add-to-bag IconButton (`web/src/components/pdp/BuyPanel.tsx:291-296`) feeding `/bag` with per-seller groups, save-for-later, bundle hints and a totals ledger (`web/src/app/bag/page.tsx`).
- Competitor: eBay/Vinted both let buyers stage items (watchlist/cart/bundle); the web replication already carries the grammar.
- Root cause: mobile commerce was built single-item only; the bag slice of the store is unused.
- Fix: either (a) implement the bag slice (store `bag` entries, PDP bag affordance, a Bag screen grouped per seller) or (b) deliberately drop the concept and align web downward — but the current half-state (bundle surfaces referencing a bag that can't exist) is the worst of both.
- Acceptance: a buyer can add an item to a persistent bag from the PDP and reach it from a navigable surface, or bundle/bag affordances are removed consistently.

### C-03 — Bundle upsell rail is navigation-only: no selection, no facet filters, dishonest savings claim [P1]
- Screens: `frontend/src/components/product/BundleUpsellRow.tsx`, `frontend/src/screens/BundleBagScreen.tsx`
- Evidence: `BundleUpsellRow.tsx:79-111` thumbs call `onPressItem` → `handlePressRecommendation` → pushes another PDP (`ItemDetailScreen.tsx:594`), they do not stage a pick; subtitle claims "combined shipping saves you more" (line 75) even though no combined-shipping order can be created (BundleBagScreen line 51-53, 79-81). BundleBag renders a plain list with no size/category/condition filters (`BundleBagScreen.tsx:155-164`).
- Web parity: web `BundleUpsellRow` (`web/src/components/bundle/BundleUpsellRow.tsx:66-83, 203-251`) derives size/category facet chips with counts from the rail pool, thumbs toggle selection with ring/check chrome, and an honest in-bag progress caption ("2 already in your bag — add 1 more for X% off", lines 194-201) wired to the same totals as the bag.
- Competitor: brief's Vinted weakness — Vinted's bundle view has no filters; web exceeded it, mobile did not.
- Root cause: the mobile rail was ported before the web facet/selection upgrade; and the savings copy predates the honest "no bundle checkout" admission.
- Fix: mirror web — selectable thumbs (check/plus chip), facet chips from the rail pool, a progress caption read from staged picks, and drop "combined shipping saves you more" until the backend ships it (replace with the honest combined-shipping note used at `BundleBagScreen.tsx:50-53`).
- Acceptance: rail items toggle selection in place; chips filter with real counts; no copy promises a discount/shipping mechanism the order contract rejects.

### C-04 — No seller-reviews section on the PDP [P1]
- Screens: `frontend/src/screens/ItemDetailScreen.tsx`, `frontend/src/components/itemdetail/ItemDetailSellerSection.tsx`, `frontend/src/components/commerce/detail/SellerInfoCard.tsx`
- Evidence: the only review signal is the aggregate inline in SellerInfoCard's trust line (`SellerInfoCard.tsx:68-71` — "4.9 (214)"); no review rows, no rating filter, no "see all reviews" entry renders anywhere on the PDP.
- Web parity: `web/src/components/pdp/PdpReviews.tsx` renders aggregate + 3 newest review rows + rating filter chips (>4 reviews only) + "See all reviews" deep link, mounted in the evidence column (`web/src/app/item/[id]/page.tsx:95`).
- Competitor: eBay places trust/reviews adjacent to the buy decision; a second-hand buyer's biggest objection is seller credibility.
- Root cause: reviews never made the mobile PDP scope; `queryKeys.user.reviews` infrastructure already exists (used by WriteReviewScreen invalidation, `WriteReviewScreen.tsx:190`).
- Fix: add a "Reviews" disclosure under the seller section — aggregate line + newest 2-3 rows + link to the profile reviews tab; reuse `useReviews`-equivalent query.
- Acceptance: PDP shows real review excerpts (or omits silently when none) with a path to all reviews; no fabricated stars.

### C-05 — No recently-viewed recording on the PDP; no consumer recently-viewed surface [P1]
- Screens: `frontend/src/screens/ItemDetailScreen.tsx`, `frontend/src/hooks/itemDetail/useItemDetailData.ts`
- Evidence: the PDP fires server-side `trackListingView` (`useItemDetailData.ts:139`) but never writes to a client recently-viewed store. The only `@thryftverse_recently_viewed_listings` writers are creator-tool pickers (`creator/surfaces/pickers/ProductPicker.tsx:67-77,277`, `creator/tools/commerce/ProductBrowserSheet.tsx:117-125,389`) — browsing the PDP populates nothing, and no "Recently viewed" rail exists on any consumer surface.
- Web parity: `useRecordListingView(listing?.id)` runs on every web PDP view (`web/src/app/item/[id]/page.tsx:44`) and feeds the recently-viewed store referenced by the brief.
- Competitor: eBay/Depop/Vinted all surface "recently viewed" on home/search — it is a core re-entry loop for resale browsing.
- Root cause: recently-viewed was built for creator tooling, never for the shopper.
- Fix: write to a shared recently-viewed store on PDP resolve (cap ~24 entries, dedupe by id), and mount a RecentlyViewed rail on Explore/Home — or at minimum consume the same key so the creator "Recent" tab benefits from browsing.
- Acceptance: viewing a PDP then returning to a discovery surface shows the item in a recently-viewed rail.

### C-06 — Conversational signal missing under the buy buttons; no urgency signal over media [P2]
- Screens: `frontend/src/components/commerce/detail/CommerceActionDock.tsx`, `frontend/src/hooks/itemDetail/itemDetailDerived.ts:199-220`, `frontend/src/components/commerce/detail/CommerceIdentityBlock.tsx`
- Evidence: `socialProofLine` ("N offers active · M views", derived line 209-220) renders inside the identity attribute row (`CommerceIdentityBlock.tsx:128-132`), far above the fold; the sticky dock (`CommerceActionDock.tsx`) carries no signal line under Buy now/Make offer. No urgency treatment exists over the media panel (eBay's Urgency slot) — `interestSignal` is only "N likes" (derived:199-202).
- Web parity: `BuyPanel` renders the one-line conversational signal directly under the CTAs — "One only · 42 views · 3 people like this", including a sold-comps clause — self-omitting for sold/owner (`web/src/components/pdp/BuyPanel.tsx:76-94,305-307`).
- Competitor: eBay VI-signal grammar (brief §4): Urgency over the picture panel, Conversational below engagement buttons — real contract fields only.
- Root cause: mobile consolidated all signals into the identity row to fight label-everything disease, but never reproduced the under-CTA beat where it drives conversion.
- Fix: add one quiet `textSecondary` caption line inside `CommerceDetailStateDock` under the action row, sourced from the same truthful fields (views, likes, activeOfferCount, sold-comparable count); keep it out of the identity row to avoid duplication; optionally a single urgency chip on the media stage when activeOfferCount > 0.
- Acceptance: exactly one conversational signal line sits within ~8pt under the secondary CTA; composed only from real counters; absent for owner/sold/blocked states.

### C-07 — No ordered→paid→shipped→delivered milestone trail on order detail [P2]
- Screens: `frontend/src/screens/OrderDetailScreen.tsx`, `frontend/src/components/orders/OrderTrackingSection.tsx`, `frontend/src/hooks/orderdetail`
- Evidence: order detail shows a status header (`OrderDetailStatusHeader`) and a carrier-event timeline (`OrderTrackingSection` consumes `timelineEntries` — parcel events only, `OrderDetailScreen.tsx:104-108,404-425`). There is no milestone stepper anywhere in `components/orders/` (grep for milestone/stepper returns nothing); a buyer on a 'paid' order sees a status chip plus an empty carrier trail, not "where in the journey am I".
- Web parity: `web/src/components/orders/OrderTimeline.tsx` renders the 4-step milestone trail with quiet checks, a highlighted current node, honest pending captions ("Awaiting dispatch"), and banner fallbacks for cancelled/carrier-failure instead of a fake timeline.
- Competitor: eBay/Vinted order grammar — milestone trail with ball-in-court captions.
- Root cause: mobile modelled the trail around carrier events; the pre-carrier journey (ordered, paid) has no visual.
- Fix: render the milestone strip above the tracking section using existing stamps (`createdAt`, paid status, `shippedAt`, `deliveredAt` — all present on `CommerceOrder`), pending captions role-aware ("Seller hasn't shipped yet" vs "Awaiting dispatch").
- Acceptance: every non-terminal order shows a 4-node trail consistent with `resolveCapabilities`; cancelled/refunded orders show an honest banner, not a broken trail.

### C-08 — CuratedCollectionsRail is dead code — never mounted on the PDP [P2]
- Screens: `frontend/src/components/product/CuratedCollectionsRail.tsx`, `frontend/src/screens/ItemDetailScreen.tsx`
- Evidence: the component is exported (`components/product/index.ts:16`) and built, but no screen imports it — grep shows zero usages outside its own file and the barrel.
- Web parity: web mounts `CuratedCollectionsRail` under the PDP rails (`web/src/app/item/[id]/page.tsx:115`), self-omitting when the item is featured nowhere.
- Competitor: editorial-curation grammar (Depop/Pinterest) — collections featuring the item are a discovery bridge.
- Root cause: the rail was built but never wired to a data source or mounted; either unfinished work or dead scaffolding.
- Fix: wire it to the backend "collections featuring this item" data (or the recommendation sections pattern used for `seen_in_looks`) and mount it below `SeenInLooksRail`; if no data source exists, delete the component.
- Acceptance: rail renders with real data or the component is removed — no dead exports.

### C-09 — PDP item-specifics IIFE reads 40+ undeclared contract fields on every render [P3]
- Screens: `frontend/src/components/itemdetail/ItemDetailItemDetails.tsx:196-273`
- Evidence: `pickStr` is invoked ~45 times inside an IIFE per render for car/yacht/luxury keys the Listing model "does not yet declare" (comment lines 188-195) — forwards-compat scaffolding for fields that may never arrive, in a fashion-first PDP.
- Web parity: web `PdpAbout` (`web/src/components/pdp/PdpAbout.tsx:30-43`) reads ~10 dynamic keys relevant to the actual catalogue.
- Root cause: speculative generality — the evidence-group resolver was ported whole from a multi-vertical spec.
- Fix: trim to keys the real schema can emit (plus a small documented forward set), or memoise the derived groups.
- Acceptance: dynamic reads limited to declared/plausible fields; no per-render 60-line IIFE.

### C-10 — BundleBag polish: hardcoded 300pt list padding, "Size:" label-everything, checkbox radius off-grammar [P3]
- Screens: `frontend/src/screens/BundleBagScreen.tsx`
- Evidence: `list` paddingBottom fixed 300 (line 227) regardless of measured footer height — large-type will clip; row meta renders literal "Size: M" label (line 109) where the PDP grammar uses bare "Size M"/fact text; checkbox uses `Radius.lg` squircle (line 242) rather than the app's check grammar.
- Fix: measure the footer (CheckoutFooter pattern in CheckoutScreen.tsx:106-108), drop the "Size:" prefix, align checkbox radius.
- Acceptance: last row fully visible at 200% dynamic type; meta copy matches PDP attribute grammar.

## Non-findings (verified good)
- PDP orchestration and state coverage: loading skeleton (`ItemDetailStateCanvas`), 403-not-public terminal state, offline/stale-data inline notices, keepPreviousData dead-CTA guard (`listingIsCurrent`, lines 284, 637), and a11y-hidden content wrap behind sheets (lines 344-359, 679) are exemplary.
- Capability-driven dock: owner/sold/unavailable/suspended/blocked/holiday-mode each get honest state docks with real copy, no dead CTAs (`CommerceActionDock.tsx:90-230`); brokered/specialist/authenticated-luxury tiers are honest variants.
- Progressive disclosure done right: measured-line description collapse (not character-count guessing), condition evidence inline, technical evidence groups collapsed by default, shipping collapsed in `ItemDetailBuyingSection`.
- Media: fullscreen viewer is a real pager (horizontal `pagingEnabled` FlatList + synced thumbnail strip + double-tap/dismiss gestures — `FullscreenMediaViewer.tsx:421-500`), satisfying "lightbox with swipe paging".
- Item specifics ledger exists via `CategoryEvidence` label/value groups; condition omission avoids restated facts.
- Checkout: partial-data banner, capability-gated tender CTAs (fail-closed wallet check), stale-order cancellation on selection change, unknown-outcome payment state, seller-away guard with honest return date, order-bound price truth — no fabricated postage ("calculated at checkout"/estimated-flagged ETAs).
- MyOrders: needs-attention banner + needs_action filter classification (server count preferred over page count), month-grouped sections, search, cursor pagination with dedup, per-tab empty states, stale-data banner — comparable to the web needs-attention lane via a different but honest grammar.
- Offers: live `/users/me/offers` with realtime refetch, shared 30s expiry clock, lazy-expiry rendering, counterRound ladder in row meta, accept→order routing, offline action guard — expiry clock + counter ladder verified present.
- WriteReview: delivered/completed gate surfaced up-front (not post-hoc 409), unknown-outcome "checking your review" state, idempotency key, auto-feedback supersede path, photo privacy hint.
- OrderReceipt/OrderSupport: return-case state machine with step-in, evidence-guided topics, outcome previews — full state coverage.
- Prior-fix spot checks in scope: no re-reportable regressions found in commerce surfaces.
