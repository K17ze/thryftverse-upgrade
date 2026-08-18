# 14 — Sell, Listing Creation & Seller Operations — Flagship Research Report

**Department:** Sell, create camera, listing, bulk listing, edit/manage listing, listing preview/success, seller hub, inventory, seller analytics, seller verification, fulfilment
**Date:** August 2026
**Scope:** `SellScreen.tsx`, `CreateCameraScreen.tsx`, `BulkListingScreen.tsx`, `EditListingScreen.tsx`, `ManageListingScreen.tsx`, `ListingPreviewScreen.tsx`, `ListingSuccessScreen.tsx`, `MyListingsScreen.tsx`, `SellerHubScreen.tsx`, `InventoryManagementScreen.tsx`, `SellerAnalyticsScreen.tsx`, `SellerVerificationScreen.tsx`, `SellerFulfilmentScreen.tsx`, `components/listing/*` (9 files), `components/sell/*` (4 files), `components/seller/*` (2 files), `hooks/useListingAutofill.ts`, `utils/listingQuality.ts`, `services/listingsApi.ts`, `services/bulkListingApi.ts`, `services/commerceApi.ts`, `services/smartSellApi.ts`, `services/listingQualityApi.ts`, `contracts/listingCategoryPolicy.ts`

---

## 1. 2026 Competitor Benchmark — eBay, Instagram, Poshmark, Vinted, Depop

The 2026 sell-side bar has been rewritten by a single product shift: **the camera is the listing form**. eBay's "next-generation Magical Listing" — rolled out as the default listing experience for all new and reactivated listers on iOS and Android in the US in Q4 2025 — moved from AI-assisted to AI-native. Per CEO Jamie Iannone's Q4 2025 earnings call, the new flow "leverages AI agents from the start to autonomously build listings from images alone… any smartphone camera can act as an AI agent that guides you on which photos to take for your specific product to increase the likelihood of a sale. In the background, AI agents create the title, category, and item specifics by leveraging advanced models and our product knowledge graph." The results eBay disclosed: a 25%+ decrease in average listing time, a 50%+ increase in the rate at which users create new listings, and double-digit percentage increases in sold items and GMV per lister.

### eBay — capture-first, AI-native, review-gated

The architecture that produced those numbers is the 2026 reference standard for listing creation:

1. **Photo-first, not title-first.** The previous flow started with a text-based catalog search. The 2026 flow starts with the camera. The seller takes or uploads a product image; AI does image match and inference against a product knowledge graph; the title, category, and item specifics are pre-filled. The seller reviews and approves. eBay's own framing: "prioritised simplification and mobile-friendliness."
2. **Smart photo guidance.** The camera agent tells the seller *which* photos to take for *this* category — a handbag gets a different shot list than a sneaker. This is category-aware capture coaching, not a generic "add 4 photos" banner.
3. **Intelligent pricing from real transaction data.** AI provides pricing recommendations "based on real-time transaction data, helping sellers balance velocity and price realization to optimize their cash flow." This is not a heuristic — it is grounded in actual sold comparables.
4. **Review-and-approve, not auto-publish.** Every AI suggestion is a draft the seller can edit. Nothing ships without explicit approval. This is the truthfulness contract: AI assists, the seller remains the author.
5. **Background enhancement, not replacement.** eBay's background removal and studio enhancement clean up the photo; they do not fabricate the product. The item remains the seller's real item.
6. **Magical Bulk Listing.** The same AI pipeline runs in bulk inside Seller Hub for the US/UK/DE, letting high-volume sellers process many items at once.

### Instagram Shopping — capture-as-content, catalog-as-infrastructure

Instagram's 2026 seller pattern is different in shape but identical in spirit: **the listing is a byproduct of content creation**. Meta wound down native checkout in most regions in 2023–2024; what remains is product tagging that drives buyers to the merchant's own store. The 2026 setup sequence (per Meta Commerce Manager documentation and the Shopify/Aerochat guides) is: business account → Facebook Business Manager → Commerce Manager → product catalog → product tags in Posts, Reels, and Stories. The catalog is the source of truth; the content is the discovery surface.

The lesson for ThryftVerse: **a listing is not a form, it is a media object**. The seller's pride of presentation — the photo, the styling, the angle — is the listing's primary asset. Instagram's Reels-first commerce pattern (30–60 second video with explicit product mention in the first 1–2 seconds, product tag, CTA) confirms that the 2026 buyer evaluates the *media* before the *metadata*. A sell flow that puts metadata fields above the photo has the hierarchy inverted.

### Poshmark, Vinted, Depop — the resale-native bar

The resale platforms ThryftVerse directly competes with have converged on a set of patterns:

- **Vinted** — the fastest-growing UK resale platform in 2026, zero seller fees, integrated shipping labels, buyer protection that makes new sellers viable without a review base. The listing flow is deliberately simple: clear photos, fair price, favourites, offers. Titles follow the search format buyers actually use: `Brand + Item type + Size + Key detail` (e.g. "Vintage Ralph Lauren Polo Shirt Size M Blue"). Measurements in every listing (pit-to-pit, length, sleeve) because buyers purchase without trying on.
- **Depop** — the 2026 algorithm weights three signals: relevance (keywords/hashtags), freshness (recency of listing or update), and engagement (likes/saves/comments in the first hour). Items with 3+ likes in the first hour are ~2.2× more likely to sell. This makes the *first hour after publish* a critical product surface — the listing must be complete and compelling at t=0, not "good enough, I'll edit later."
- **Poshmark** — the share economy remains time-intensive, but Posh Shows (live shopping) now accounts for 18–22% of platform GMV. The lesson: the listing is not the end of the sell flow; distribution (sharing, shows, social) is part of the same journey.

### The 2026 seller dashboard bar — task-first, answer-three-questions

The 2026 seller dashboard consensus (eBay Seller Hub Overview, Amazon Seller Central 2026 workspaces, TikTok Shop's 5-agent AI Homepage beta, the LOW/CODE and Netguru seller UX playbooks) is built on a single insight: **sellers open the dashboard to answer three questions — Do I have new orders? Have I been paid? Are my listings performing?** — and all three must be answerable above the fold.

- **eBay Seller Hub Overview** — "a concise summary of any actions you need to take so you can fulfill orders promptly and respond quickly to buyer questions." Recent sales, orders awaiting shipment, traffic in the last 30 days, account funds. Task-first.
- **Amazon Seller Central 2026** — replaced 200+ tools scattered across disconnected pages with six purpose-built workspaces (My business, Products, Supply chain, Orders, Finance, Marketing) plus a persistent Action Center that surfaces "what actually needs your attention — listing issues, policy notifications, performance alerts." The stated goal: "bring the right information to you instead of making you search for it."
- **TikTok Shop AI Homepage (beta, April 2026)** — five AI agent cards (Shop Insight, Listing, Buyer Experience, Fulfillment, Growth) that surface shop data, flag issues, and suggest actions in real time. The shift is from module-based to agent-based, but the principle is the same: the dashboard tells you what to do next.
- **The LOW/CODE seller UX principles** — "Treat seller registration and first listing creation as a conversion funnel. Measure drop-off at each step and fix the highest drop-off point." Progressive onboarding: "Require minimum fields for activation, then prompt for completions over time. Full-form upfront onboarding reduces seller activation significantly." Listing form scope: "Forms with 8–12 required fields produce higher-quality listings than 20-field forms."

### The 2026 benchmark synthesis

The production-grade sell-side bar coalesces around:

- **Capture-first.** The camera is the entry point, not a field mid-form. The first photo triggers AI assistance.
- **AI-assisted but truthful.** AI pre-fills title, category, item specifics, and price from real data (image match, knowledge graph, sold comparables). Every suggestion is reviewable and editable. No fabricated descriptions, no invented stats, no "demo mode" in production.
- **Progressive listing.** Minimum fields to activate, then prompt for completions. The listing is publishable as soon as it is *viable*, not only when it is *complete*.
- **Seller dashboard answers three questions above the fold.** Orders, payouts, listing performance. Everything else is a drill-down.
- **Task-first.** The dashboard surfaces what needs attention (orders to ship, questions to answer, listings missing details) before it surfaces metrics.
- **The first hour matters.** Depop's 2.2× multiplier means the listing must be complete and compelling at publish, not patched later.
- **Distribution is part of the flow.** Share, poster, social — the listing success screen is a launchpad, not a dead end.

---

## 2. Psychology & Principles

### The "I can do this" feeling — seller confidence is the conversion metric

The single most important psychological state in a sell flow is **seller confidence** — the felt sense that "I can do this, this is going to work, my item is going to sell." Every friction point in the listing form is a confidence tax. Every field the seller doesn't know how to answer is a confidence tax. Every AI suggestion that fills in a blank the seller would have struggled with is a confidence subsidy. eBay's 50%+ increase in listing creation rate is not because AI writes better descriptions — it is because AI removes the blank-page moment that makes casual sellers abandon.

The LOW/CODE research is explicit: "A confusing listing flow produces lower-quality listings and inflates seller CAC before launch… Full-form upfront onboarding reduces seller activation significantly." The 2026 evidence is that the listing form is a **conversion funnel**, and the drop-off points are the fields where the seller thinks "I don't know what to put here."

### Progressive commitment — viable before complete

The progressive listing principle is a direct application of the foot-in-the-door technique. Ask the seller for the minimum viable commitment (one photo, a title, a price), let them publish, then prompt for completions over time. This is psychologically easier than asking for the complete listing upfront because the commitment feels reversible — "I can always add more later." The listing is *live* and earning engagement (Depop's first-hour multiplier) while the seller iterates.

ThryftVerse's `evaluateListingCompleteness` (in `contracts/listingCategoryPolicy.ts`) already implements the category-aware "canActivate" floor — the listing is publishable when the required fields for *this* category are present, not when every field is filled. This is the right contract. The UI above it must communicate the same principle: "Ready to publish" vs "Suggested: brand, original price" (SellScreen.tsx:408–414) is the correct two-tier language.

### AI assistance without slop — the truthfulness contract

The 2026 consensus on AI in listing creation is unambiguous: **AI assists, the seller remains the author, and every AI output is reviewable.** eBay's "review and approve" framing, the eCommerceInsights "capsule" model (each AI rewrite is an independent approval unit with priority, effort, and rationale), and the Mirakl "approval-ready diffs" pattern all encode the same contract: nothing ships without a human yes.

This is where ThryftVerse's current AI assistance is weakest. `useListingAutofill.ts` extracts brand and category from the **photo filename** (`IMG_Nike_sneaker.jpg` → Nike, Sportswear). This is not AI assistance — it is a filename regex. It produces suggestions like `${brand} ${category.toLowerCase()} item` ("Nike sportswear item") which is the definition of AI slop: a generic, untruthful, unhelpful string that the seller must overwrite. The 2026 bar is image recognition against a product knowledge graph, not filename matching against a 28-brand hardcoded list. Until real image recognition exists, the autofill must either (a) be honest about what it is ("Suggested from filename") or (b) be removed in favor of a cleaner blank state that doesn't prime the seller with slop.

The `SmartSellCard` ("60% more likely to sell in 7 days", "expect ~3–5 offers/week") and `ListingQualityMeter` ("Demo mode — quality scores are heuristic estimates") are truthfully labelled as demo — but the *claims themselves* ("60% more likely") are fabricated statistics presented as if real. Per AGENTS.md §11: "Never fabricate… data… activity." A "60% more likely" claim with no source is fabricated data. The demo badge mitigates but does not resolve: the number is still presented as a number the seller will read and act on.

### The seller's pride of presentation

A listing is a creative act. The seller chose this item, photographed it, wrote about it, priced it. The sell flow must honor that — the preview must show the listing *as buyers will see it*, the success screen must celebrate the publish, the manage screen must treat the listing as a living object the seller tends. This is the Instagram lesson: the listing is a media object, and the seller's pride in the media is the engine of listing quality.

`ListingPreviewCard.tsx` already captures this with "This is how buyers will see your listing" and a ProductCardV2-mirrored composition. `ListingSuccessScreen.tsx` has the Confetti celebration and the "Published" hero. The architecture is right; the execution needs to be pushed to flagship quality (see §3, §5).

### The seller dashboard as a relief surface

A seller opens Seller Hub to feel *in control*: "is everything okay, do I need to do anything, am I making money." The dashboard's job is to relieve anxiety, not manufacture it. This is why task-first ("Needs you: 2 listings missing details") beats metric-first ("Listed value: £1,247.50") — the task tells the seller what to do, the metric just sits there. The 2026 eBay/Amazon/TikTok dashboards all lead with action, not with numbers. The "You're all caught up" empty-state in SellerHubScreen.tsx:375–379 is the correct psychological endpoint: the dashboard that says "nothing to do" is the dashboard that builds trust.

---

## 3. Current ThryftVerse Audit — Concrete Defects

### 3.1 The sell flow is form-first, not capture-first

`SellScreen.tsx` is a 737+ line monolithic screen that renders a long vertical form: media studio, autofill card, title, description, price, original price, brand, size, condition, category, shipping method, shipping payer, tags, listing mode, and (conditionally) auction/co-own fields. The `ListingMediaStudio` is at the top (good), but the flow is still a single scrolling form, not a guided progressive flow. There is no "capture → AI suggests → review → publish" pipeline. The seller must fill every field manually.

The `CreateCameraScreen.tsx` is a 44-line redirect shim that replaces itself with `CreatorStudio` (look/poster) or `VisualSearch`. The "Create" tab does not open a camera-first listing flow — it opens the creator studio. The sell camera and the creator camera are different surfaces, which is defensible, but it means there is **no capture-first listing creation path** in the product. The seller who wants to list an item never gets the eBay 2026 experience of "open the camera, take a photo, AI builds the listing."

### 3.2 AI autofill is filename regex, not AI — and produces slop

`useListingAutofill.ts:97–141` extracts brand and category by matching the photo **filename** against a hardcoded list of 28 brands and ~25 category keywords. The suggested title is built as `${brand} ${category.toLowerCase()} item` (line 138) — e.g. "Nike sportswear item", "Zara women item", "Gucci luxury item". These are AI-slop titles: generic, untruthful (the item is not a "sportswear item", it is a specific hoodie), and certain to be overwritten by any seller who reads them. The hook's own JSDoc is honest ("This is a client-side heuristic — it extracts hints from the photo filename… It does NOT perform image recognition") but the UI presents the output as "AI autofill" suggestions the seller is nudged to apply (`handleApplyAutofill` at SellScreen.tsx:219–225 sets the title, brand, and category in one tap).

This is the most consequential defect in the sell flow. The 2026 benchmark is image recognition against a product knowledge graph; ThryftVerse ships a filename regex that produces slop titles. The gap is not a polish gap — it is a category-defining gap.

### 3.3 Fabricated statistics in Smart Sell and Listing Quality

- `SmartSellCard.tsx:174` — "Auto-accept offers above your threshold. 60% more likely to sell in 7 days." The "60%" is a fabricated statistic. There is no source, no study, no backend data. The demo badge ("Demo mode — Smart Sell settings are illustrative") labels the *feature* as demo but does not retract the *claim*.
- `SmartSellCard.tsx:244` — "Based on similar listings, expect ~3–5 offers/week." Fabricated range with no data source.
- `ListingQualityMeter.tsx` (sell variant) — presents a 0–100 quality score with sub-scores (photo, title, description, pricing, completeness) and a "Demo mode — quality scores are heuristic estimates" badge. The score is computed by `calculateListingQuality` in `utils/listingQuality.ts`, which is a deterministic weighted-sum heuristic (photos 25%, identity 20%, description 20%, pricing 15%, shipping 10%, tags 10%). The heuristic is reasonable but the *presentation* as a precise "/100" score overstates the precision. A seller seeing "67/100" believes the score is meaningful at that resolution; it is not.

Per AGENTS.md §11: "Never fabricate… data… activity." These statistics are fabricated data presented as real. The demo badges are partial mitigation but do not satisfy the truthfulness contract — the numbers are still consumed as numbers.

### 3.4 Seller Hub is good but card-on-card in places

`SellerHubScreen.tsx` is one of the stronger screens in the department. It has: a flat seller identity row (no card), a "Listed value" metric line (honestly labelled, not "Revenue"), a "Needs you" task section with real derivable tasks (drafts, missing details, unanswered questions, paused listings, unverified), a "Create listing" primary CTA, and flat inventory/performance/store/account sections. The empty state ("Start your shop") is welcoming with a clear CTA and verification nudge. This is close to the 2026 task-first benchmark.

The defects:
- The "Needs you" tasks all navigate to `InventoryManagement` or `MyListings` — there is no deep-link to the *specific* listing that needs attention. A task that says "3 listings missing details" should land the seller on a filtered view of those 3 listings, not the full inventory.
- The `FlagshipFormSection variant="state" tone="brand"` "Get verified" block appears *twice* on the populated screen — once in the Account section (line 475–483) and once as a standalone state block at the bottom (line 489–505). This is duplicate prompting.
- The "Store" section lists "Orders", "Analytics", "Auctions" — but "Analytics" is also in the "Performance" section (line 426–433). Duplicate navigation rows to the same destination.

### 3.5 MyListingsScreen is card-on-card with a 2×2 stat grid

`MyListingsScreen.tsx:165–263` renders a header with a 2×2 `statsGrid` of `StatCard` components (Active, Sold, Avg price, Active value), each a bordered rounded surface, followed by a `quickActionsRow` of 4–5 bordered rounded buttons (New listing, Analytics, Auctions, Payouts, Verification), followed by a listings count header, followed by the list rows themselves (each a bordered rounded card). This is the card-on-card anti-pattern from AGENTS.md §4: every row, icon, and section wrapped in separate grey surfaces. The thumbnail test fails — at 25% scale the silhouette is a grid of rounded rectangles, not media/content.

The `StatCard` component (line 63–74) is a redundant primitive — `FlagshipMetricLine` already exists and is used in `SellerHubScreen` and `ManageListingScreen` for the same purpose. Two primitives for the same job is the "shared component forced to serve too many masters" problem in reverse: a screen-local component duplicating a flagship primitive.

### 3.6 InventoryManagementScreen is strong but the summary row is dense

`InventoryManagementScreen.tsx` is well-built: search, 5-cell summary row (Items/Active/Sold/Paused/Value), filter tabs with underline indicator, sort dropdown, bulk selection with optimistic pause/delete, full state coverage (loading, error, offline, empty, filtered-empty). This is the most production-grade screen in the department.

The defect is the summary row (line 433–440): 5 cells in a horizontal row is dense on a 390pt-wide phone. The "Value" cell shows `£${summary.totalValue.toFixed(0)}` which truncates the pence — acceptable for a summary but inconsistent with SellerHub's `£${metrics.totalActiveValue.toFixed(2)}`. Minor, but the inconsistency reads as carelessness.

### 3.7 SellerAnalyticsScreen has a fabricated trend percentage

`SellerAnalyticsScreen.tsx:124–132` — `trendPercentage` is computed as `Math.min(999, Math.round(conversionRate * 10) / 10)`. The comment says "Use conversion rate as a proxy for trend direction." This is not a trend — it is the conversion rate relabelled as a trend percentage and displayed in the hero as `${trendPercentage}% conv · ${itemsSold} items sold` (line 300–302). A seller reading "12.5% conv" in the trend row believes it is a trend; it is the conversion rate wearing a trend costume. This violates AGENTS.md §11 (no fabricated data) and §4 (the hero trend row is a decorative subtitle that misleads).

The `conversionRate` itself (line 109–113) is `sold / views * 100` — a real computation, but "conversion rate" in marketplace analytics is normally `sold / (views or sessions)` with attribution windows and deduplication. Computing it client-side from raw listing engagement is an approximation presented as a precise metric.

### 3.8 ListingPreviewScreen has a duplicate back control and a dead "Edit" button

`ListingPreviewScreen.tsx:106–124` — the floating header has a back button (left) and an "Edit" text button (right), but **both call `handleBack`** (line 116 calls `handleBack`, same as the back button). The "Edit" button is labelled "Edit" with `accessibilityLabel="Edit"` but it goes back, not to edit. This is a dead/misleading control per AGENTS.md §11 and §12. The `ListingPreviewFooter` below also has "Back to edit" and "Return to publish"/"Return to save" — so there are **three** controls that all do the same thing (go back), two of which are labelled differently.

### 3.9 ListingSuccessScreen is celebration-heavy with card-on-card

`ListingSuccessScreen.tsx` has the right emotional intent (Confetti, "Published" hero, status pill, product preview, actions, tips, support link) but the composition is card-on-card: `ElevatedSurface variant="elevated"` for the summary card, `ElevatedSurface variant="surface"` for the actions list and the Smart Sell banner, a `tipsCard` with brand-tinted background, and a `supportLink`. Four separate surfaced containers in one scroll. The action rows inside the actions ElevatedSurface each have an `actionIconBox` (a circular surface inside a surface) — card-on-card.

The "Smart Sell enabled (demo)" banner (line 196–209) appears only when `smartSellEnabled` is true — but the banner text says "Auto-negotiation settings are illustrative — no offers will be auto-accepted until a real backend is connected." This is a truthful disabled state, but it is shown *after* the seller already enabled the feature. The feature should be honestly disabled *at the point of toggle*, not celebrated post-publish with a caveat.

### 3.10 ManageListingScreen is strong but the overflow menu is a native Alert

`ManageListingScreen.tsx:282–300` — `handleOverflowMenu` renders the pause/reactivate/mark-sold/delete actions as a native `Alert.alert` with a list of text buttons. This is a 2018 pattern. The 2026 pattern is a bottom sheet action menu with icons, descriptions, and destructive-action separation. The rest of the screen is well-composed: flat identity block, status pill, primary Edit CTA, transparent icon action cluster (Poster/Share/Preview), flat "Buyer activity" section with real engagement metrics (likes, saves, questions, offers — views intentionally omitted per the comment at line 311 because the backend doesn't return them).

### 3.11 BulkListingScreen is functional but has no AI assistance and no capture

`BulkListingScreen.tsx` is a well-built batch tool: FlashList of draft rows with inline-editable title/price, expand/collapse, a bottom-sheet draft form, validate-all/publish-all/clear-all, progress overlay, publish results. The defect is that each draft is a **manual form** — there is no capture-first path, no AI autofill, no photo-to-listing pipeline. eBay's Magical Bulk Listing (2024) is the 2026 bar for bulk; ThryftVerse's bulk is a spreadsheet-like form per item. For a high-volume seller, this is the difference between listing 10 items in 5 minutes (eBay) and 30 minutes (ThryftVerse).

### 3.12 SellerFulfilmentScreen is the strongest screen in the department

`SellerFulfilmentScreen.tsx` is production-grade: ship-by deadline headline with overdue/urgent color states, item summary, buyer-selected service snapshot, escrow narrative (server-derived release date, no invented 14-day fallback), integrated vs manual shipping modes, label generation with QR, drop-off finder, manual dispatch with tracking, handoff recovery for integrated shipping. The capability resolver (`resolveCapabilities` from `orderCapabilities`) is the canonical source of dispatch eligibility — no local `status === 'paid'` check. This screen is the model for the rest of the department.

### 3.13 SellerVerificationScreen is solid but isolated

`SellerVerificationScreen.tsx` handles co-own verification demands (authenticity, possession, condition, inspection) with real status states (pending/responded/compliant/failed/expired/withdrawn), deadline tracking, overdue detection, and a clear action prompt. The defect is that it is reachable only from `MyListingsScreen` when `filterType === 'coown'` (line 242–253) — a co-own seller who is not on the co-own-filtered listings view has no path to their verification demands. The Seller Hub "Account → Verification" row navigates to `Verification` (a different screen), not `SellerVerification`. This is a navigation dead-end for a critical seller obligation.

### 3.14 Dead "Coming soon" / demo features in scope

The grep across the sell/listing/seller surfaces found demo-mode banners in `ListingSuccessScreen.tsx:196–209` (Smart Sell demo), `SmartSellCard.tsx:251–263` (demo badge), `ListingQualityMeter.tsx:273–285` (sell variant, demo badge), and `SellerHubScreen.tsx:27` (comment referencing demo). These are truthfully labelled but they are **dead features in production** — Smart Sell and the sell-side Listing Quality Meter are demo-only and do not perform their represented actions. Per AGENTS.md §11: "Never expose controls that only produce 'Coming soon', 'Backend required', or generic explanation toasts." A demo-mode toggle that does nothing in production is a control that does not perform its represented action.

---

## 4. Micro Improvements

1. **Fix the ListingPreviewScreen duplicate/dead "Edit" button.** The right-side "Edit" control (line 115–123) calls `handleBack` — either wire it to a real edit action (navigate back to Sell/EditListing) or remove it and rely on the footer's "Back to edit". Three controls doing the same thing is a §12 violation.
2. **Remove fabricated statistics from SmartSellCard.** Delete "60% more likely to sell in 7 days" (line 174) and "expect ~3–5 offers/week" (line 244). Replace with truthful, source-anchored copy or remove the stats preview entirely. If Smart Sell is demo-only in production, honestly disable the toggle (show a "Coming after beta" disabled state) rather than a demo badge post-hoc.
3. **Remove the fabricated `trendPercentage` in SellerAnalyticsScreen.** The hero trend row (line 293–304) should show a real period-over-period delta when the backend `fetchSellerAnalytics` returns prior-period data, or show no trend at all. Relabelling conversion rate as a trend is fabrication.
4. **De-duplicate the "Get verified" block in SellerHubScreen.** Remove the bottom standalone `FlagshipFormSection variant="state"` block (line 489–505); the Account → Verification row is the canonical entry. One prompt, one destination.
5. **De-duplicate the "Analytics" navigation row in SellerHubScreen.** It appears in both "Performance" (line 426–433) and "Store" (line 447–453). Keep it in Performance (where it is contextually adjacent to views/likes) and remove from Store.
6. **Replace MyListingsScreen StatCard grid with FlagshipMetricLine rows.** Remove the 2×2 `statsGrid` of bordered `StatCard` surfaces and the `quickActionsRow` of bordered buttons. Use flat `FlagshipMetricLine` rows (Active, Sold, Avg price, Active value) and a single primary "Create listing" CTA + a flat "Manage all" row. This resolves the card-on-card silhouette.
7. **Deep-link "Needs you" tasks to filtered destinations.** In SellerHubScreen, the "N listings missing details" task should navigate to `InventoryManagement` with a `filter=missing_details` param, not the unfiltered inventory. The "N with buyer questions" task should deep-link to the inbox filtered to those listings.
8. **Replace ManageListingScreen overflow `Alert.alert` with a bottom sheet action menu.** Use the existing `BottomSheet` primitive with icon + label + destructive separation for Pause/Reactivate/Mark sold/Delete.
9. **Make the autofill card honest about its source.** Label it "Suggested from filename" (not "AI autofill") or remove the title suggestion (`buildSuggestedTitle` produces slop) and keep only the brand/category hints, which are at least grounded in the filename.
10. **Consistent currency precision across seller surfaces.** SellerHub uses `.toFixed(2)`, MyListings/Inventory use `.toFixed(0)` for summary values. Pick one (recommend `.toFixed(0)` for summary headers, `.toFixed(2)` for line items) and apply consistently.
11. **Wire SellerVerification into Seller Hub.** Add an "Verification requests" row in the Account section when the seller has co-own listings, navigating to `SellerVerification` (not the generic `Verification` screen).
12. **Add a "first hour" nudge to ListingSuccessScreen.** After publish, show a truthful, source-anchored tip: "Listings with 3+ likes in the first hour sell faster — share your listing now." with the Share action prominent. This is the Depop insight operationalized.

---

## 5. Macro Improvements

### 5.1 Re-architect the sell flow as capture-first and progressive

The current `SellScreen.tsx` is a single 737-line scrolling form. The 2026 architecture is a **guided, multi-step flow** with the camera as the entry point:

```
Step 1 — Capture:        camera/gallery → 1–10 photos (ListingMediaStudio)
Step 2 — AI suggests:    title, category, brand, condition, price from real data
Step 3 — Review:         seller reviews/edits each AI-suggested field
Step 4 — Details:        description, size, shipping, tags (progressive — only what's missing)
Step 5 — Preview:        ListingPreviewScreen (how buyers will see it)
Step 6 — Publish:        ListingSuccessScreen (celebration + distribution nudge)
```

Each step is a focused screen (or a focused section with a clear progress indicator), not a 737-line form. The listing is publishable as soon as the category-policy `canActivate` floor is met (Step 3 or 4); the seller is not forced through all 6 steps to go live. This is the eBay 2026 model: "50% reduction in the total steps needed to list."

**Implementation shape:** Keep `SellScreen.tsx` as the canonical screen but restructure it into a step-based composition with a step indicator in the header and a single primary CTA per step (Next / Publish). The existing `ListingMediaStudio`, `ListingModeSelector`, `ListingPublishFooter`, and the field pickers become step contents. The draft sync (`updateSellDraft` on every change) already persists state across steps — no new state architecture is needed. The `ListingPreviewScreen` and `ListingSuccessScreen` are already the final two steps.

### 5.2 Replace filename autofill with real image recognition (or honest removal)

The `useListingAutofill` hook must be replaced with one of:
- **(a) Real image recognition** — a backend endpoint that takes the photo and returns brand/category/title suggestions from a product knowledge graph (the eBay 2026 model). This is a backend+frontend project, not a frontend-only fix.
- **(b) Honest removal** — delete the autofill card and the `useListingAutofill` hook. Let the seller start with a blank form and fill it themselves. This is better than slop titles.

Until (a) exists, (b) is the truthful choice. A blank form with a good photo and a clear placeholder ("What are you selling?") is more honest than "Nike sportswear item."

### 5.3 AI-assist truthfulness — the approval-capsule model

When AI assistance is added (image recognition, description generation, pricing recommendations), it must follow the **approval-capsule** pattern from the 2026 benchmark:
- Each AI suggestion is an independent, reviewable unit (title capsule, category capsule, price capsule, description capsule).
- Each capsule shows the AI's proposed value, the confidence/source, and an accept/reject control.
- Nothing is auto-applied without a tap. The seller is always the author.
- The source is visible: "Title suggested from image match (87% confidence)" or "Price suggested from 12 sold comparables in this category."

This replaces the current one-tap "Apply autofill" (`handleApplyAutofill` at SellScreen.tsx:219–225) which silently sets three fields at once with no per-field review.

### 5.4 Seller dashboard hierarchy — three questions, task-first

Re-establish the Seller Hub hierarchy around the three questions:
1. **Do I have new orders?** — Currently absent from SellerHub (orders are in `MyOrders`, not surfaced on the hub). Add an "Orders to ship" task in "Needs you" when there are paid orders awaiting dispatch, deep-linking to `SellerFulfilment` or a fulfilment queue.
2. **Have I been paid?** — Currently a "Payouts" row in the Account section. Elevate to a "Payouts" metric line near "Listed value" showing the real pending/available balance from the wallet backend (if it exists), or an honest "Payout details in Wallet" row if it doesn't.
3. **Are my listings performing?** — Currently in the "Performance" section (Views, Likes). Good. Keep.

The "Needs you" section becomes the **primary above-the-fold content** (after the seller identity), not the "Listed value" metric. Task-first means the first thing the seller sees is what to do, not a number to look at.

### 5.5 Unify the listing quality primitive

There are **two** `ListingQualityMeter` components: `components/listing/ListingQualityMeter.tsx` (160 lines, used in `ListingPreviewScreen`) and `components/sell/ListingQualityMeter.tsx` (459 lines, used in `SellScreen` via the quality score). They display the same concept (listing quality) with different compositions, different scoring sources (`calculateListingQuality` heuristic vs `listingQualityApi` demo service), and different demo-mode labels. This is the "two primitives for the same job" anti-pattern.

Unify on one component with one scoring source. If the backend `listingQualityApi` is real, use it and remove the `calculateListingQuality` heuristic. If it is demo-only, use the heuristic and remove the demo service and its demo badge. The unified component should be the compact inline indicator from `ListingPublishFooter` (the dot + score + tier in one row) for the sell flow, and the expandable meter for the preview screen.

### 5.6 Bulk listing needs a capture-first path

`BulkListingScreen` is a manual form-per-item batch tool. The 2026 bar (eBay Magical Bulk) is capture-first bulk: the seller photographs a batch of items, AI processes each photo into a draft listing, the seller reviews the drafts in a grid and publishes. This is a larger re-architecture — but even a partial step (let the seller pick multiple photos at once from the gallery, create one draft per photo with the filename-autofill applied per draft) would reduce the per-item friction significantly.

### 5.7 The listing success screen as a distribution launchpad

`ListingSuccessScreen` currently ends with "create another listing" and "back to feed." The 2026 pattern is that the success screen is the **start of distribution**, not the end of creation:
- **Share** (already present) — prominent, first action.
- **Poster** — generate a promotional poster (the `CreatorStudio` poster flow is already linked from `ManageListingScreen`). Add it to the success screen.
- **Social nudge** — "Listings shared in the first hour get more views" (truthful, source-anchored) with a Share CTA.
- **Create another** — present but secondary.

This operationalizes the Depop first-hour insight and the Poshmark distribution lesson.

---

## 6. Flagship Acceptance Criteria

A flagship sell/listing/seller department must pass all of the following:

### Listing creation
- [ ] The sell flow is capture-first: the first interaction is the camera or gallery, not a title field.
- [ ] The flow is progressive: the listing is publishable as soon as the category-policy `canActivate` floor is met; the seller is not forced through every field to go live.
- [ ] AI assistance (when present) follows the approval-capsule model: per-field suggestions, visible source/confidence, nothing auto-applied without a tap.
- [ ] No AI-slop titles or descriptions are generated. The `buildSuggestedTitle` filename heuristic is removed or replaced with real image recognition.
- [ ] The listing preview (`ListingPreviewScreen`) shows the listing exactly as buyers see it (mirrors `ProductCardV2` / `ItemDetail` composition). No duplicate or dead controls — every header button performs its labelled action.
- [ ] The listing success screen celebrates the publish and immediately offers distribution actions (Share, Poster) as primary, "create another" as secondary.
- [ ] Draft state persists across steps and across app kills (`updateSellDraft` is preserved). The "Saved" indicator is a transient 1.5s flash, not a toast per field.

### Seller dashboard (Seller Hub)
- [ ] The three seller questions (orders, payouts, listing performance) are answerable above the fold.
- [ ] "Needs you" is the primary content section, above metrics. Every task deep-links to the specific filtered destination, not the unfiltered inventory.
- [ ] No duplicate navigation rows to the same destination. No duplicate "Get verified" blocks.
- [ ] No card-on-card composition. Flat canvas, hairline separators, one dominant panel max above the fold.
- [ ] The empty state ("Start your shop") has a clear CTA and a verification nudge.

### Inventory management
- [ ] Search, filter tabs, sort, and bulk selection all work with optimistic updates and rollback on failure.
- [ ] The summary row is flat (no bordered stat cards), consistent currency precision with Seller Hub.
- [ ] Full state coverage: loading, error, offline, empty, filtered-empty, populated.

### Seller analytics
- [ ] No fabricated trend percentages. The hero trend shows a real period-over-period delta or nothing.
- [ ] The conversion rate is labelled as an approximation if it is computed client-side from raw engagement.
- [ ] Period selector (7d/30d/90d/1y) drives real backend queries; the loading state is a skeleton that matches the final layout.

### Manage listing
- [ ] The overflow menu is a bottom sheet action menu with icons, not a native `Alert.alert`.
- [ ] Buyer activity metrics are real (likes, saves, questions, offers from `engagement`). Views are omitted only if the backend does not return them (and the omission is documented in a comment, as it currently is).
- [ ] Status transitions (pause/reactivate/mark sold/delete) are confirmed, optimistic, and rollback on failure.

### Fulfilment
- [ ] Ship-by deadline is server-derived; no client-invented fallback. (Already met.)
- [ ] Integrated vs manual shipping modes are correctly resolved from the fulfilment snapshot. (Already met.)
- [ ] Escrow release timing is server-derived; no invented 14-day countdown. (Already met.)

### Verification
- [ ] Seller verification demands are reachable from Seller Hub (Account section) for any seller with co-own listings, not only from the co-own-filtered MyListings view.
- [ ] Deadline tracking, overdue detection, and the action prompt are preserved.

### Truthfulness (AGENTS.md §11)
- [ ] No fabricated statistics ("60% more likely", "3–5 offers/week") anywhere in the department.
- [ ] No demo-mode controls in production that do not perform their represented action. Demo features are honestly disabled at the point of toggle, not celebrated post-hoc with a caveat.
- [ ] No "Coming soon" toasts. Every visible control performs its action, navigates, or shows a truthful disabled state.

### Visual quality (AGENTS.md §4)
- [ ] Thumbnail test passes on every screen: at 25% scale, media/content dominates, not rounded rectangles.
- [ ] Squint test passes: media/identity/content dominate, navigation/utility chrome recedes.
- [ ] No card-on-card composition. One radius family per viewport. Flat canvas is the default utility structure.
- [ ] Light/dark parity: geometry, hierarchy, and density are identical across themes.

---

## 7. Priority & Sequencing

### Phase 1 — Truthfulness and dead-control fixes (immediate, no backend)
1. Remove fabricated statistics from `SmartSellCard` ("60% more likely", "3–5 offers/week"). Honestly disable or remove the demo toggle.
2. Remove the fabricated `trendPercentage` from `SellerAnalyticsScreen`. Show no trend or a real delta.
3. Fix the `ListingPreviewScreen` dead "Edit" button — wire it or remove it.
4. De-duplicate the "Get verified" block and "Analytics" row in `SellerHubScreen`.
5. Remove or honestly relabel the `useListingAutofill` title suggestion (`buildSuggestedTitle` slop).
6. Wire `SellerVerification` into Seller Hub Account section for co-own sellers.

### Phase 2 — Card-on-card and primitive unification (frontend-only)
7. Replace `MyListingsScreen` `StatCard` grid + `quickActionsRow` with flat `FlagshipMetricLine` rows and a single primary CTA.
8. Unify the two `ListingQualityMeter` components into one with one scoring source.
9. Replace `ManageListingScreen` overflow `Alert.alert` with a `BottomSheet` action menu.
10. Flatten `ListingSuccessScreen` — remove the nested `ElevatedSurface` containers and `actionIconBox` circles; use flat rows with hairline separators.

### Phase 3 — Seller Hub task-first hierarchy (frontend-only)
11. Add "Orders to ship" to "Needs you" when paid orders exist (requires reading from `commerceApi` order list).
12. Deep-link all "Needs you" tasks to filtered destinations (`InventoryManagement?filter=missing_details`, inbox filtered to unanswered listings).
13. Elevate "Payouts" to a metric line near "Listed value" with real wallet balance (if backend supports) or an honest "Payout details in Wallet" row.

### Phase 4 — Capture-first sell flow re-architecture (frontend, large)
14. Restructure `SellScreen.tsx` from a single scrolling form into a step-based guided flow (Capture → AI suggests → Review → Details → Preview → Publish) with a step indicator and one primary CTA per step.
15. Move the camera to the first step; make gallery/camera the first interaction.
16. Add the "first hour" distribution nudge to `ListingSuccessScreen` (Share + Poster as primary actions).

### Phase 5 — Real AI assistance (backend + frontend, largest)
17. Backend: image recognition endpoint that returns brand/category/title suggestions from a product knowledge graph.
18. Frontend: approval-capsule UI for per-field AI suggestions with visible source/confidence.
19. Backend: real sold-comparables pricing recommendation (extend `useSoldComps` to return a suggested price, not just a range).
20. Bulk listing: capture-first bulk path (pick N photos → N drafts with AI autofill per draft).

### Phase 6 — Seller analytics real deltas (backend + frontend)
21. Backend: `fetchSellerAnalytics` returns prior-period revenue/items-sold for real period-over-period deltas.
22. Frontend: hero trend shows the real delta with direction, or nothing.

---

**Bottom line:** The sell/listing/seller department has strong foundations — `SellerFulfilmentScreen` is production-grade, `SellerHubScreen` and `InventoryManagementScreen` are close to the 2026 task-first benchmark, and the category-aware completeness policy is the right contract. The defining gap is the **listing creation flow**: it is form-first where the 2026 bar is capture-first, and its "AI assistance" is a filename regex that produces slop. The truthfulness defects (fabricated statistics, dead controls, demo features in production) are immediate fixes. The capture-first re-architecture and real AI assistance are the flagship work that will determine whether ThryftVerse's sell flow matches or trails the 2026 eBay/Vinted/Depop bar.
