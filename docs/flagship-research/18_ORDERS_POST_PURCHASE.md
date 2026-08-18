# 18 — Orders & Post-Purchase: Flagship Research Report

**Department:** Orders, order detail, order receipt, order support, resolution centre, write review, postage, returns.
**Scope:** `MyOrdersScreen.tsx`, `OrderDetailScreen.tsx`, `OrderReceiptScreen.tsx`, `OrderSupportScreen.tsx`, `ResolutionCentreScreen.tsx`, `WriteReviewScreen.tsx`, `PostageScreen.tsx`, and the 12 components in `frontend/src/components/orders/`.
**Date:** August 2026.

---

## 1. 2026 Competitor Benchmark

The post-purchase surface is where a marketplace either earns repeat business or loses it. In 2026 the dominant pattern across eBay, Vinted, Depop, and the broader DTC ecosystem is a **unified, visual, certainty-first post-purchase journey** that collapses order tracking, returns, disputes, and reviews into one coherent timeline rather than four disconnected silos.

### eBay — unified tracking redesign (July 2025 Seller Update, live through 2026)

eBay's most recent post-purchase overhaul is instructive because it targets the exact problem ThryftVerse faces. eBay redesigned tracking across Seller Hub and the buyer shipment flow to be "more visual, unified, and easy to navigate" ([EcommerceBytes, July 2025](https://www.ecommercebytes.com/2025/07/03/ebay-promises-reduce-claims-with-redesigned-tracking/)). The stated goals map directly onto WISMO reduction:

- **Unified delivery overview** — buyers see all deliveries for an order in one comprehensive view, including separate tracking for outbound *and return* items. Returns are not a separate app section; they live inside the order.
- **Updated order delivery status** — when a delivery is delayed, buyers see a clearer status update that "reduces uncertainty and sets better expectations."
- **Enhanced seller visualisation** — Seller Hub's 'View Order' page offers a consistent tracking-status visualisation.

eBay explicitly frames this as a claims-reduction play: "Clearer, unified tracking helps buyers see exactly where their order is at every step, reducing misunderstandings and the need to file." The lesson for ThryftVerse: the tracking timeline is not a feature, it is the *primary trust instrument* of the order. Where tracking is ambiguous, "item not received" claims and support tickets follow.

### Post-purchase best practices 2026 — progress timeline, real tracking, clear returns, review prompts

Across the industry the converging standard is:

1. **A single progress timeline** that combines order lifecycle events (placed, paid, dispatched) with real carrier scan events (picked up, in transit, out for delivery, delivered). eBay's earlier post-purchase work unified "cancellations, order tracking, returns, refunds, and disputes" into one UI after recognising they had been "built in silos by different teams" ([eBay Post-Purchase UX case study, Joe Chehock](https://joechehock.com/portfolio_page/ebay-post-purchase-experience/); [Post Transaction, Jenny Ihrie](http://jenny-ihrie.squarespace.com/post-transaction)). The same silo problem exists in ThryftVerse today: Order Detail, Order Support, Resolution Centre, and Write Review are four separate screens with no shared timeline.
2. **Real carrier tracking, not a tracking number** — the 2026 expectation is that the app *shows* the carrier scan timeline inline, not merely a "Track on carrier site" link. WISMO research is blunt: customers "want not a conversation but certainty" and the answer "exists in your systems" ([getzowie.com WISMO guide](https://getzowie.com/blog/wismo-automation)). A tracking number that delegates to a carrier website is a 2018 pattern.
3. **Clear, self-serve returns with reason codes and a refund estimate** — the leading pattern is a "reason-code form with photo upload" plus a refund-estimate panel, increasingly paired with QR-code drop-off for label-free returns ([ecommerceguide.com returns flow patterns](https://ecommerceguide.com/patterns/returns-flow/)). Baymard's 2026 research finds 54% of sites have "substantial UX issues" in their returns interface — a clear opportunity to differentiate ([Baymard Ecommerce UX Trends 2026](https://baymard.com/blog/ecommerce-quantitative-ux-insights-2026)).
4. **Delivery-triggered review prompts** — the single biggest lever on review submission rate is *timing*. Moving from an order-confirmation trigger to a delivery-confirmation trigger lifts submission rates ~2.2× ([US Tech Automations, 2026](https://ustechautomations.com/resources/blog/ecommerce-review-request-comparison-2026)). The ideal window for physical goods is 3–5 days after delivery, with a one-tap star rating and an optional comment ([AcquireX QUIET Method](https://acquirex.io/blog/ask-for-reviews-after-purchase/); [82dash](https://blog.82dash.com/how-to-get-more-product-reviews-shopify/)).
5. **Resolution centre as an operations console, not a contact form** — dispute UX should be "easy to find from the order page, structured (clear reason selection, evidence upload), time-bound (response windows), transparent (status updates), and fast" ([BoostRoom marketplace UX](https://boostroom.com/blog/designing-a-marketplace-ux-that-converts)). The case detail screen should answer three questions within seconds: what happened, what is needed now, what happens next ([Koder.ai dispute management](https://koder.ai/blog/build-web-app-manage-marketplace-disputes)).

---

## 2. Psychology & Principles

### Post-purchase anxiety and the "where is my stuff" feeling

The period between payment and delivery is where loyalty is built or destroyed. WISMO research frames it precisely: "the post-purchase stage, which is the time between order confirmation and doorstep delivery, is where customer loyalty is actually built or destroyed. This is the period when buyers experience 'purchase anxiety,' wondering if they made the right decision and whether their order will arrive as promised" ([elogy.io WISMO strategies](https://elogy.io/en/strategies-to-reduce-wismo/)). Every WISMO ticket is "a customer who felt anxious enough to stop what they were doing and contact you. That anxiety is a signal that your post-purchase experience left a gap" ([Bookbag WISMO playbook](https://bookbag.ai/blog/wismo-reduction-playbook)).

The design implication: **certainty is the product**. The order detail screen's primary job is not to display data but to close the gap between expectation and available information before the customer feels the need to ask. Anxiety clusters in predictable "anxiety windows" — the buy-to-pack gap, the first-scan gap, the silent-transit gap — and each window has a message that could have been sent to close it ([WISMOlabs](https://wismolabs.com/solutions/reduce-wismo-calls/)).

### Loss aversion in returns

Returns are where loss aversion is sharpest. The buyer has already lost possession of money; a return reintroduces the possibility of losing the item *and* the money if the process feels unsafe. The 2026 returns UX principle is to **present fair options and guide decisions with clear tradeoffs** — "the goal isn't to trap people. It's to remove uncertainty, present fair options, and guide decisions with clear tradeoffs" ([Ecom Design Pro returns UX](https://ecomdesignpro.com/returns-page-ux-reduce-refunds/)). A refund estimate shown upfront sets expectations and reduces the perception of risk. Reason codes that feel comprehensive (not a trap into "Other") prevent the data loss that occurs when shoppers pick the wrong escape hatch.

### Reciprocity in reviews

Reviews are a reciprocity act. The buyer received an item; the ask is to give back a small public signal. The reciprocity is fragile — it breaks when the ask is timed wrong (before the product is experienced), when the effort is high (a long form with no quick path), or when the tone is extractive ("How was your order?" with no human warmth). The QUIET method captures the principle: qualify the right customer, use the value moment, invite don't pressure, make it easy, throttle the asks ([AcquireX](https://acquirex.io/blog/ask-for-reviews-after-purchase/)). A one-tap star rating with an *optional* comment and *optional* photos is the 2026 standard; requiring text suppresses volume by 40–60%.

### Certainty-seeking and the timeline as the anchor

Across all four post-purchase acts (track, return, dispute, review) the underlying psychological drive is the same: **certainty-seeking**. The user wants to know what is happening, what happens next, and what they need to do. A timeline that shows past events, the current state, and the expected next milestone satisfies this drive in a way that a status badge alone cannot. This is why eBay's redesign led with "unified delivery overview" — the timeline is the certainty instrument.

---

## 3. Current ThryftVerse Audit

The ThryftVerse orders department is, relative to the rest of the app, the most mature surface. It already has a canonical capability resolver, an immutable fulfilment snapshot, server-derived deadlines, and a real carrier-event timeline. The defects below are therefore about **depth and coherence**, not fabrication. This is important: unlike other departments, the orders screens do *not* contain "Coming soon" toasts, fabricated order statuses, or fake tracking numbers. The grep for `Coming soon|Backend required|TODO|FIXME|mock|fake|dummy|hardcod` across all seven screens returned only legitimate `placeholder` text on inputs. This is a truthful surface. The flagship work is to elevate it, not to repair dishonesty.

### 3.1 Strengths to preserve

- **Canonical capability resolver** (`orderCapabilities.ts:228` `resolveCapabilities`, `:469` `resolveOrderExperience`) — a single source of truth for what actions are available given status, role, open resolution, review state, and tracking. The screen consumes this; it does not recompute `canShip`/`canDeliver` independently. This is exactly the architecture AGENTS.md §2 demands.
- **Immutable fulfilment snapshot** (`orderCapabilities.ts:135` `FulfilmentSnapshot`) — the buyer's selected service survives purchase, preventing a seller's later settings change from altering what was paid for.
- **Server-derived deadlines** — `OrderDetailScreen.tsx:1064` reads `estimatedDeliveryAt` from the server and explicitly refuses to invent one ("The client may format time. It must not invent a deadline"). `InspectionBanner` (`:405`) uses `inspectionDeadlineAt` from the server. Escrow release timing (`:1768`) is server-derived or absent — no 14-day fallback is fabricated.
- **Real carrier-event timeline** — `buildTimelineEntries` (`:289`) merges order lifecycle events with `OrderParcelEvent` carrier scans, deduplicating semantic keys, and a stale-tracking warning fires when the last event is >48h old (`:1079`).
- **Role-aware primary actions** — buyer in-transit gets `track_order` (calm), not `confirm_delivery` (which releases escrow). Seller paid gets `dispatch` (guided fulfilment), never a generic mark-shipped. This mirrors Vinted's 2-day buyer protection window.
- **Truthful review state** — `WriteReviewScreen.tsx:64` loads the existing review and shows an honest "Review already submitted" state rather than allowing duplicate submission.

### 3.2 Concrete defects

**D1 — Four-surface fragmentation.** Order Detail, Order Support, Resolution Centre, and Write Review are four separate pushed screens with no shared timeline. The buyer who reports "not as described" must context-switch from Order Detail → IssueCategorySelector → OrderSupport → (later) ResolutionCentre, with no single view showing the order's lifecycle *and* the open dispute *and* the review state. This is the exact silo problem eBay identified and fixed. `OrderDetailScreen.tsx:1191` `handleIssueCategorySelect` navigates away without passing the selected category — the category is picked and then discarded (`navigation.navigate('OrderSupport', { orderId })` with no `category` param), so the `ISSUE_CATEGORIES` selector at `:549` is a dead interaction that produces no downstream effect. This violates AGENTS.md §11 (truthful UI): the selector implies the choice matters, but it is dropped on the floor.

**D2 — No native returns flow.** Returns exist only as a support topic (`OrderSupportScreen.tsx:47` `{ id: 'return', ... 'Request a return' }`) and as an overflow "Request refund" alert (`OrderDetailScreen.tsx:1454`). There is no returns screen, no reason-code form, no refund estimate, no return-label generation, no QR drop-off. The buyer's path is "describe your issue in detail" in a free-text box. This is the 2018 pattern. The 2026 standard is a structured returns flow with reason codes, photo evidence, refund estimate, and carrier-integrated label/QR — all living *inside* the order, not in a generic support form. Baymard finds 54% of sites have substantial returns UX issues; ThryftVerse currently has no dedicated returns UX at all.

**D3 — Tracking timeline is present but under-exposed on the list.** `OrderLedgerRow.tsx:172` shows a 3-dot progress indicator (`paid → shipped → delivered`) which is good, but the *carrier scan detail* is only visible after navigating into Order Detail. The 2026 expectation, per eBay's redesign, is that the list row itself surfaces the latest tracking milestone ("Out for delivery today") without a tap. The current `trackingLine` (`:73`) shows only `CARRIER · trackingNumber` — a raw number, not a status. This is the "tracking number that delegates" pattern the industry has moved past.

**D4 — Review prompt timing is delivery-aware but not delay-aware.** `OrderDetailScreen.tsx:879` auto-surfaces the review prompt 1.2s after the screen mounts when status is `delivered`/`completed`. This is good (delivery-triggered, not order-triggered). But the prompt fires *immediately* on delivery, before the buyer has had time to inspect the item. The research consensus is 3–5 days after delivery for physical goods. There is no delay, no "Maybe later" that defers to a better moment, and no re-prompt. The `ReviewPromptSheet` "Maybe later" (`:143`) simply closes the sheet with no scheduling. Additionally the prompt's `selectedRating` is passed to `onWriteReview` but `WriteReviewScreen` does not receive it — `OrderDetailScreen.tsx:2022` calls `navigation.navigate('WriteReview', { orderId })` with no `rating` param, so the quick star rating the user just tapped is discarded. Another dead interaction.

**D5 — Resolution Centre is a flat ticket list, not a case console.** `ResolutionCentreScreen.tsx` shows a hero card ("N open requests"), a filter rail (all/open/resolved/closed), and a FlashList of ticket cards. There is no case-detail timeline, no evidence gallery, no "what is needed now" next-step indicator, no SLA/age indicator. The ticket row (`:92`) shows topic, details preview, status pill, and "Updated X ago". This is a contact-inbox pattern, not a resolution-centre pattern. The 2026 standard (per Koder.ai and BoostRoom) is a case detail that answers "what happened, what is needed now, what happens next" within seconds, with a timeline of events, evidence thumbnails, and explicit response windows.

**D6 — Card-on-card and surface over-accumulation on Order Detail.** Order Detail stacks: status header → divider → item summary → divider → counterparty → divider → stepper → escrow banner → inspection banner → completed summary → divider → timeline (package contents + ETA banner + stale banner + timeline) → divider → shipment details → divider → transaction → divider → support. This is 8+ sections separated by hairline dividers, with multiple coloured banners (escrow `success`-tinted, ETA `brand`-tinted, stale `warning`-tinted, inspection `brand`-tinted). The first viewport is dominated by chrome, not by the item or the status. The `OrderStatusStepper` (`OrderStatusStepper.tsx`) and the `OrderTrackingTimeline` (`OrderTrackingTimeline.tsx`) render *redundant* progress information — the stepper shows 5 stages (placed/paid/shipped/in-transit/delivered) and the timeline shows the same milestones with subtitles. AGENTS.md §4 (surface budget: "at most one dominant non-media panel above the fold") and the "no card-on-card" rule are strained.

**D7 — Postage screen is seller-settings-only, disconnected from the order.** `PostageScreen.tsx` is a seller shipping-preferences screen (default carrier, free shipping toggle, bundle discount). It has no relationship to a specific order's postage. The `CARRIERS` constant (`:27`) is a hardcoded fallback list (Evri/Royal Mail/DPD/InPost) with static `priceFromGBP` values that are presented as real prices. When the capabilities API fails, the screen falls back to these hardcoded prices (`:76`) without any visual indication that they are stale. This is a mild truthfulness concern — the prices are presented as current but may not be.

**D8 — OrderReceiptScreen is a static document, not a live surface.** `OrderReceiptScreen.tsx` renders a receipt card with transaction breakdown, shipping info, and an immutable notice. It is well-built but isolated: it does not link to the tracking timeline, the return flow, or the review prompt. The "What happens next" card (`:366`) is a static 3-step list that does not reflect the actual current status — it shows the same three dots whether the order is at "paid" or "out for delivery". The receipt and the order detail duplicate the transaction breakdown in two different layouts.

**D9 — DispatchCountdown uses a hardcoded 24h window.** `DispatchCountdown.tsx:38` defaults `windowHours = 24` and `OrderDetailScreen.tsx:1649` calls it with only `createdAt` and `shipped`, never passing a server-derived ship-by deadline. The `orderCapabilities` resolver exposes `shipByDate` from the snapshot, and `OrderLedgerRow` uses it for the deadline badge, but the Order Detail countdown ignores it in favour of the hardcoded 24h. This is inconsistent: the list row shows the real ship-by date; the detail screen shows a fabricated 24h countdown. AGENTS.md §11: "Never fabricate… order or tracking state."

**D10 — OrderSupportScreen topic gating is fragile.** `OrderSupportScreen.tsx:92` filters topics by `requiresStatus.includes(orderStatus)`, but `orderStatus` is the raw `order.status` string (e.g. `'in_transit'`) while `requiresStatus` uses space-normalised strings (`'shipped'`, `'delivered'`). The status coming from the API is likely snake_case (`in_transit`) which will not match `'in transit'` in the `requiresStatus` arrays. This means the topic list is likely mis-filtered in production — "Item not received" (`requiresStatus: ['shipped', 'delivered']`) would never appear for an `in_transit` order. The screen does not use `normaliseOrderStatus` from the canonical resolver.

---

## 4. Micro Improvements

1. **Pass the selected issue category through.** `OrderDetailScreen.tsx:1194` should navigate with `{ orderId, categoryId: category.id, categoryLabel: category.label }` and `OrderSupportScreen` should consume it to pre-select the topic and pre-fill context. This repairs the dead selector (D1).
2. **Pass the quick rating through to WriteReview.** `OrderDetailScreen.tsx:2022` should navigate with `{ orderId, initialRating: _rating }` and `WriteReviewScreen` should seed `setRating(initialRating)` when provided. This repairs the discarded star tap (D4).
3. **Use `normaliseOrderStatus` in OrderSupportScreen.** Replace `orderStatus` at `OrderSupportScreen.tsx:91` with `normaliseOrderStatus(order?.status ?? 'unknown')` and align `requiresStatus` arrays to normalised keys. This repairs D10.
4. **Use the real `shipByDate` in DispatchCountdown.** Pass `shipByDate` from the capability resolver to `DispatchCountdown` and compute the deadline from it, falling back to `createdAt + 24h` only when no server deadline exists. This repairs D9.
5. **Surface the latest tracking milestone on the ledger row.** Replace the raw `CARRIER · trackingNumber` line in `OrderLedgerRow.tsx:73` with the latest parcel event label (e.g. "Out for delivery today") when parcel events are available, falling back to the tracking number. This addresses D3 at the list level.
6. **Defer the review prompt.** Instead of firing 1.2s after mount, schedule the first prompt 72h after `deliveredAt` (via a server-driven "review eligible at" timestamp), and make "Maybe later" defer by 48h with a re-prompt. This aligns with the 3–5 day research consensus (D4).
7. **Add a stale-price indicator on PostageScreen.** When falling back to the hardcoded `CARRIERS` list, show a muted "Live pricing unavailable — showing typical rates" notice so the prices are not presented as current when they are not (D7).
8. **Collapse the stepper/timeline redundancy.** On Order Detail, when both `OrderStatusStepper` and `OrderTrackingTimeline` would render, show *only* the timeline (which is a superset of the stepper's information) and drop the stepper. The stepper is useful on the list row where space is constrained; on the detail screen the timeline is the richer anchor (D6).
9. **Make the receipt's "What happens next" status-aware.** `OrderReceiptScreen.tsx:366` should mark the current step active based on `normalisedStatus` rather than always showing step 1 as active (D8).

---

## 5. Macro Improvements

### 5.1 Order architecture — a unified order experience projection

The existing `resolveOrderExperience` (`orderCapabilities.ts:469`) is the right primitive but is not yet consumed everywhere. The macro move is to make it the *single* projection every order surface consumes — Order Detail, Order Receipt, Order Support, Resolution Centre, Write Review, Chat transaction strip, Seller Hub, and notifications. Each surface maps the projection to its own layout but never re-derives status, labels, tones, terminal sets, or capability flags. This eliminates the remaining duplication (OrderDetailScreen's local `normaliseOrderStatus`/`humaniseStatus`/`getStatusTone` at `:58`–`:165` duplicate the canonical ones) and ensures a status change propagates to every surface through one function.

### 5.2 Tracking timeline as the order's spine

Reframe Order Detail around the timeline as the primary anchor, not the status badge. The 2026 pattern is a single vertical timeline that combines: order placed → paid → seller preparing → dispatched → carrier picked up → in transit → out for delivery → delivered → inspected → reviewed, with the *current* milestone visually dominant and future milestones shown as pending. Dispute and return events should appear on the *same* timeline as timeline entries with a `dispute`/`return` semantic key, so the buyer sees "you reported an issue on Aug 12" in line with "out for delivery on Aug 10". This is the eBay "unified delivery overview" applied to the full lifecycle, not just shipping. The existing `buildTimelineEntries` already merges order + parcel events; extend it to merge dispute, return, and review events.

### 5.3 A real returns flow

Introduce a `ReturnFlowScreen` (or a returns section within Order Detail) that implements the 2026 pattern:
- **Eligibility check** — server-derived return window; show "Return window open until {date}" or "Return window closed" honestly.
- **Reason-code picker** — structured codes (doesn't fit, not as described, changed mind, damaged, wrong item) with an "Other" escape that still captures free text.
- **Photo evidence** — reuse the existing `uploadMedia` evidence pattern from OrderSupportScreen.
- **Refund estimate** — show "Refund: £X (item) + £Y (return postage) = £Z" upfront, sourced from the server.
- **Return label / QR** — carrier-integrated label generation or QR drop-off, reusing the `shippingProviderRegistry`.
- **Return tracking** — the return parcel gets its own tracking timeline on the same order, mirroring eBay's "separate tracking for outbound and return items."

This replaces the current "describe your issue in a free-text box" support topic with a structured, certainty-first flow that lives inside the order.

### 5.4 Review system elevation

Rebuild the review prompt around the research consensus:
- **Server-driven eligibility** — a `reviewEligibleAt` timestamp 72h after `deliveredAt`; the prompt only fires after this timestamp.
- **One-tap star rating carried through** — the `ReviewPromptSheet` quick rating seeds `WriteReviewScreen` so the user does not re-tap.
- **Negative-feedback escape valve** — for ratings ≤3 stars, route to a "Tell the seller first" interstitial before the public review, reducing public negative reviews from buyers who just wanted to be heard (the #4 failure mode in the US Tech Automations audit).
- **Seller response surface** — the seller should be able to respond to a review, and the buyer should see the response, closing the reciprocity loop.
- **Review prominence on the item** — reviews should surface on the listing page with verified-buyer badges, photo thumbnails, and the rating distribution (5★/4★/3★/2★/1★ bars), not just an average.

### 5.5 Resolution Centre as a case console

Elevate `ResolutionCentreScreen` from a ticket inbox to a case console:
- **Case detail with a timeline** — events (opened, evidence added, seller responded, decision, payout) on a vertical timeline.
- **"What is needed now" next-step card** — "Waiting for seller response (2 days left)" or "Your response needed by Aug 15."
- **Evidence gallery** — thumbnails of uploaded photos, expandable.
- **SLA/age indicators** — days open, response deadline, with urgency colouring.
- **Structured outcomes** — refund amount, return required, who pays return postage, decided by (auto/seller/ThryftVerse).

---

## 6. Flagship Acceptance Criteria

1. **Single projection.** Every order surface (Detail, Receipt, Support, Resolution Centre, Write Review, Chat strip, Seller Hub, notifications) consumes `resolveOrderExperience` and never independently normalises status strings. Zero local `normaliseOrderStatus`/`humaniseStatus`/`getStatusTone` duplicates outside `orderCapabilities.ts`.
2. **Unified timeline.** Order Detail renders one vertical timeline that combines order lifecycle, carrier scans, dispute events, return events, and review events. The `OrderStatusStepper` is removed from Order Detail (retained on the ledger row where space is constrained).
3. **No dead interactions.** The issue category selector passes its selection through to OrderSupport. The review prompt's quick rating passes through to WriteReview. No visible control produces no downstream effect.
4. **Real returns flow.** A structured returns flow with eligibility check, reason codes, photo evidence, refund estimate, and carrier-integrated label/QR exists *inside* the order, not as a support free-text topic.
5. **Server-derived deadlines everywhere.** Dispatch countdown uses `shipByDate` from the snapshot, not a hardcoded 24h. ETA uses `estimatedDeliveryAt`. Inspection window uses `inspectionDeadlineAt`. Escrow release uses `estimatedReleaseAt`. No client-invented deadlines.
6. **List-row tracking status.** `OrderLedgerRow` shows the latest carrier milestone label ("Out for delivery today"), not just a tracking number.
7. **Review prompt timing.** The prompt fires no earlier than 72h after `deliveredAt` (or a server-derived `reviewEligibleAt`), "Maybe later" defers by 48h, and the quick rating seeds the WriteReview screen.
8. **Resolution Centre case console.** Case detail shows a timeline, evidence gallery, next-step card with response deadline, and structured outcome — not just a ticket row.
9. **Truthful postage pricing.** When carrier pricing falls back to hardcoded rates, a visible stale-price notice is shown.
10. **Thumbnail and squint tests pass.** At 25% scale, the order's primary object (the item image + current status) dominates the silhouette; repeated rounded containers and coloured banners do not dominate the first viewport.

---

## 7. Priority & Sequencing

| Phase | Work | Rationale |
|-------|------|-----------|
| **P1 — Truthfulness repairs** | Fix the dead issue-category selector (D1), pass the quick rating through (D4), use `normaliseOrderStatus` in OrderSupport (D10), use real `shipByDate` in DispatchCountdown (D9), add stale-price notice on Postage (D7). | These are low-effort, high-truthfulness fixes that eliminate dead interactions and fabricated deadlines. They align with AGENTS.md §11 and §12. |
| **P2 — Timeline unification** | Extend `buildTimelineEntries` to accept dispute/return/review events; collapse the stepper on Order Detail; reframe the screen around the timeline as the spine. | This is the single highest-impact structural change. It addresses D6 and D1's root cause (fragmentation) and matches the eBay benchmark. |
| **P3 — Returns flow** | Build the structured `ReturnFlowScreen` with eligibility, reason codes, photo evidence, refund estimate, and carrier label/QR. | D2 is the largest *missing* capability. Returns are the #1 retention lever and currently do not exist as a first-class flow. |
| **P4 — Review system** | Server-driven `reviewEligibleAt`, deferred "Maybe later", negative-feedback escape valve, seller response surface, review prominence on listings. | D4's macro fix. The review prompt is delivery-aware but not delay-aware or carry-through. |
| **P5 — Resolution Centre console** | Elevate the ticket list to a case console with timeline, evidence gallery, next-step card, SLA indicators. | D5. Lower urgency because the current list is functional, but it is not flagship-quality. |
| **P6 — Single projection rollout** | Migrate Order Receipt, Chat transaction strip, Seller Hub, and notifications to consume `resolveOrderExperience`. | The projection exists; this is the long-tail consistency pass. |

---

### Source URLs

- eBay Redesigned Tracking — https://www.ecommercebytes.com/2025/07/03/ebay-promises-reduce-claims-with-redesigned-tracking/
- eBay Seller Center tracking update — https://www.ebay.com/sellercenter/news/2025-july/tracking-updates
- eBay Post-Purchase UX case study (Joe Chehock) — https://joechehock.com/portfolio_page/ebay-post-purchase-experience/
- eBay Post Transaction (Jenny Ihrie) — http://jenny-ihrie.squarespace.com/post-transaction
- eBay order tracking guide — https://www.packagetracking.app/track-ebay-package/
- WISMO Automation guide (getzowie) — https://getzowie.com/blog/wismo-automation
- WISMOlabs reduce WISMO calls — https://wismolabs.com/solutions/reduce-wismo-calls/
- elogy.io WISMO strategies — https://elogy.io/en/strategies-to-reduce-wismo/
- Bookbag WISMO playbook — https://bookbag.ai/blog/wismo-reduction-playbook
- ecommerceguide.com returns flow patterns — https://ecommerceguide.com/patterns/returns-flow/
- Baymard Ecommerce UX Trends 2026 — https://baymard.com/blog/ecommerce-quantitative-ux-insights-2026
- Ecom Design Pro returns page UX — https://ecomdesignpro.com/returns-page-ux-reduce-refunds/
- AcquireX QUIET method for reviews — https://acquirex.io/blog/ask-for-reviews-after-purchase/
- US Tech Automations review request comparison 2026 — https://ustechautomations.com/resources/blog/ecommerce-review-request-comparison-2026
- 82dash product reviews on Shopify — https://blog.82dash.com/how-to-get-more-product-reviews-shopify/
- Velsof ecommerce product reviews 2026 — https://www.velsof.com/blog/ecommerce-product-reviews-guide/
- BoostRoom marketplace UX that converts — https://boostroom.com/blog/designing-a-marketplace-ux-that-converts
- Koder.ai marketplace dispute management — https://koder.ai/blog/build-web-app-manage-marketplace-disputes
- Gruv.ai dispute resolution workflow — https://gruv.ai/blog/dispute-resolution-workflow-marketplace-payments-claim-to-resolution
- LowCode marketplace app UI/UX best practices — https://www.lowcode.agency/blog/marketplace-app-ui-ux-design-best-practices
