# Seller Department — Cross-Reference Audit
**Date:** 2026-09-26 · **Scope:** sell composer, seller-hub (overview/listings/auctions/fulfilment/earnings/import/quick-replies) · **Code:** `web/src` · **Mobile reference:** `frontend/src`

---

## 1. Reference Grammar (live research)

### eBay Seller Hub
- **Tab grammar:** Overview (tasks + orders + listings + feedback modules) / Orders (awaiting payment, awaiting dispatch, dispatched, returns, resolution centre) / Listings (single + bulk create-edit, templates, business policies, up to 5,000 drafts/scheduled) / Marketing (promoted listings, discounts) / Performance (sales, cost %, traffic sources, seller level) / Payments (payout history, next payout ETA, funds on hold) / Reports (CSV/XLSX).
- **Listing quality:** inline prompts to improve listings so they "sell faster"; item-specifics completeness is the quality lever.
- **2025 additions:** "Your cost" field in the listing flow → feeds the earnings page for true profit; Inventory Mapping API.
- **Fulfilment:** print postage labels + upload tracking from Orders; dispatch SLAs surface as tasks.

### Vinted sell flow
- Photo-first composer (up to 20 photos), then title/description, category wizard (granular, example-corrected), brand, condition, **price guidance** (auto-suggested price, overridable), **parcel size** selection, publish. ~10 min end-to-end.
- **Zero seller fees** is the core positioning: buyer pays protection + shipping; prepaid label sent on sale; payout lands 48–72h after delivery confirmation.
- Seller hygiene loops: relist aging items every 10–14 days, "fast shipper" badge, bundle discounts, auto-notify likers on price drops.

### Depop Selling Hub
- Stats tab: earnings (post-fee), items sold (bundle items counted individually), potential revenue (sum of live ask prices), listings posted — all historical, CSV sales download (3-month windows, fee columns broken out).
- Ecosystem expects views/likes/clicks per listing (third-party tools exist solely for this) and boosted-listing ROI analysis.

### Etsy Shop Manager
- Stats: visits, orders, revenue, **conversion rate** (the headline quality metric), traffic-source breakdown, per-listing views/favourites/orders/revenue; year-over-year compare.
- Listing Quality Score is internal/hidden but publicly defined by levers: title length, tag count (13), photo count (10) + video, free shipping, returns policy set (even "no returns"), processing time.
- Star Seller: response-time, review-score, dispatch-speed thresholds.

### Poshmark
- My Seller Tools: **Vacation Hold** (dates, banner on closet, all listings "Not for Sale"), My Sales Report, My Inventory Report (emailed CSV: days listed, SKU, likes, lowest price, private fields), **Offer to Likers**, price-drop notifications.
- Posh Stats (private): avg ship time (90-day window, weekends excluded), cancellation rate, returns, total sales, shipped orders. New: Inactive Listings (60-day staleness) + **Bulk Reactivate**; per-listing metrics rolling out (impressions, clicks, likes, offers).
- Sharing/self-shares are a first-class engagement metric.

### Facebook Marketplace
- Listing = photos → details → Next gated until required fields → Publish; free price allowed (0); multi-quantity countdown shown to buyers; "mark as sold/pending".
- **Meta AI grammar (2026):** photo → auto-drafted listing incl. suggested price from local comps; **AI auto-replies** to "is this available?" drafted from listing facts, editable during listing creation; AI-generated seller profile summary for buyer trust.

### Distilled grammar to audit against
1. Completeness gating on publish + explicit "what's missing" communication.
2. Photo guidance: count targets, cover semantics, shot-list nudges, quality cues.
3. Price guidance honesty: comps labelled as live vs sold; fee math shown seller-side.
4. Draft/resume as a first-class store, not a localStorage orphan.
5. Fulfilment depth: dispatch deadlines, labels, tracking upload, returns, overdue accent.
6. Earnings transparency: gross → fees → net per order, clearance windows, next-payout scheduling, exportable statements.
7. Metrics that matter: views→likes/watchers→offers→orders funnel, conversion, sell-through, ship time — not vanity counts.
8. Vacation/holiday mode with buyer-visible suppression.
9. Bulk tools: multi-edit, reactivate, import, reports.
10. Growth levers: promote/boost, offer-to-likers, price-drop notifications, AI listing assist.

---

## 2. Our Implementation (web/src)

### Sell composer — `src/components/sell/SellFlow.tsx` + sections
- Flat 5-section composer (Photos → Details → Price → Postage → Review) on one page, `SellProgress` step rail with done checks (`SellProgress.tsx`), publish happens only on a dedicated **preview surface** (`SellPreview.tsx`) that renders the real `PdpGallery` + PDP grammar + feed tile (`SellPreviewCard.tsx`), then `SellSuccess.tsx` with View/Share/Sell-another + tips.
- **Validation gate** (`SellFlow.tsx:328-352`): ≥1 photo, title ≥3 chars, category, explicit condition (never silently defaulted — `:383`), size required only for sneakers (category policy parity, `constants.ts:212`), description ≥10 chars (`DESCRIPTION_MIN`), price £1–£50k. First-error scroll + field focus via `ERROR_FIELD_IDS` (`:72`).
- **Photos** (`PhotosSection.tsx`): dropzone → grid, cover badge on first, drag reorder + keyboard arrows, max 8.
- **Details** (`DetailsSection.tsx`): title, brand + popular-brand chips, category/subcategory selects, condition radio-cards with honest hints, size chips (required vs recommended vs hidden for sizeless), description with char count, tag autocomplete field (`TagField.tsx` + `useTagAutocomplete`).
- **Price** (`PriceSection.tsx`): £ input, **live-listing comps** — range + count + median "tap to set" + market-position read (below/within/above ±20% band, `constants.ts:259-306`), buyer-protection preview "Buyer pays £X incl. protection — you get £Y" (fee = 5% + £0.70, floor 2%).
- **Postage** (`PostageSection.tsx`): speed (standard/express) × payer (buyer/seller) radio cards; honestly defers cost — "priced at checkout… you never quote it" (`:110`).
- **Review** (`ReviewSection.tsx`): spec ledger + fee line + "Still needs: photos, price" completeness line (`:85-95`) + "Nothing goes live until you confirm".
- **Drafts:** `useSellDraftPersistence.ts` — 600ms debounced localStorage autosave, "Draft saved" flash, `DraftResumeBanner` (Resume/Discard, blob-photo caveat `:36`), "Save draft & exit" → `/seller-hub/listings`; dead blob refs filtered + counted with an honest notice (`SellFlow.tsx:684-703`). Drafts reconcile bidirectionally with the hub shelf (`upsertSellerDraft`) and the import session store — one draft resumable from `/sell?draft=`, the listings table, and the import wizard.
- Edit mode `?edit=<id>` (own listings only, not-found state), `EditListingPicker` disclosure, guests compose but hit the signup wall at preview/publish (`:357`).
- Live publish: presign-uploads blob photos → POST/PATCH `/listings`; honest failure keeps draft state (`:462-471`).

### Seller hub — `src/app/seller-hub/`
- **Overview** (`page.tsx`): dominant "Available to withdraw" figure + pending + lifetime + next-payout line (same ledger as earnings), 7/30/90d segmented period, **unified to-do radar** (dispatch deadlines w/ overdue-danger tone, open offers, slow-mover inventory — `sellerTodos()` `fixtures-seller.ts:585`), revenue chart (`RevenueChart`, honest smooth path + crosshair), metric grid **views / watchers / conversion / avg sale / sell-through with period deltas** (`seller-queries.ts:180-186`), sortable per-listing performance rows (views·likes·age), quick-action rail.
- **Listings** (`listings/page.tsx` + `ListingManagementTable/Toolbar/Model`): All/Active/Sold/Drafts counted rail, newest/views/likes sort, per-row Bump (24h cooldown with live countdown, session-persisted, honesty footnote `:233`), Edit → `/sell?edit=`, Mark sold (confirmed) / Relist, View; drafts get "Needs: photos, price" (same publish gate — `listingManagementModel.ts:117`), "Imported" badge, Resume + confirmed Delete; live listings flag "Missing: brand, size" discovery gaps (`:136`). Destructive actions confirm through Sheet.
- **Auctions** (`auctions/page.tsx`): summary header, counted bucket tabs (scheduled/live/sold/unsold), rows deep-link to `/auctions/[id]`, Create CTA → `/auctions/create`. Port of mobile SellerAuctionCentreScreen.
- **Fulfilment** (`fulfilment/page.tsx` + `FulfilmentRow`): To post/Posted/Delivered counted tabs; ship-by deadlines with overdue danger accent (fixture deliberately contains an overdue job); "Mark posted" is optimistic **without fabricating a tracking number** (`seller-queries.ts:363-377`); posted/delivered rows keep the tracking number visible + copy affordance; "Print label" → `fulfilment/label` printable sheet (scoped print CSS, mono-safe); fixture mints tracking once shared with the order record (`markJobPosted` → `markOrderDispatched`); live mode calls `POST /orders/:id/shipping-label`, renders only the carrier artifact + hosted PDF link, and **discloses demo mode** on the label page (`label/page.tsx:232`).
- **Earnings** (`earnings/page.tsx`): next payout (amount/date/method, all nullable-honest), Available + Pending-clearance balances, per-order clearance entries (item price, −protection fee, release date), monthly totals, **client-side CSV statement** with BOM; "Total in clearance" footer ties the breakdown to the balance. Live mode: fee split null → renders "—" not invented £0 (`seller-queries.ts:432-437`).
- **Import** (`import/page.tsx` → `components/catalogimport/`): CSV dropzone or paste → **consent step with three attestations** ("I own the text", "facts are accurate", "no buyer personal data") → review workbench (per-row inline edit, Ready/Needs fixes/Excluded rail, include checkbox, condition-guess flags, fix-or-exclude gating) → deterministic progress phases (no fake %) → factual receipt with per-row skip reasons → session drafts unified with the hub shelf. 200-row / 1MB caps, reported not dropped.
- **Quick replies** (`quick-replies/page.tsx`): title(40)/message(200) CRUD in a Sheet, delete confirm, "saved on this device" honesty note; consumed by the inbox composer bolt menu (`inbox/Composer.tsx:21,51`).

---

## 3. Gap Table

| Reference grammar | Status | Evidence / notes |
|---|---|---|
| Completeness gating + "what's missing" | **MATCHED** | `SellFlow.validate()` `:328`, `missingPublishFields` `constants.ts:313`, "Needs:"/ "Still needs:" lines, step-rail checks |
| Photo-first + cover + reorder | **MATCHED** | `PhotosSection.tsx` dropzone/grid/cover/drag+keyboard. Max 8 vs Vinted 20. **PARTIAL on guidance**: no shot-list nudge ("front/back/label/flaw"), no min-count suggestion, no quality feedback |
| Price guidance honesty | **MATCHED (honest)** | `PriceSection.tsx:70-103` — comps labelled "similar **live** listings", never claims sold data; median tap-to-set; ±20% position copy |
| Fee/payout transparency in composer | **MATCHED** | buyer-pays vs you-get split, `protectionFeeGbp` shared helper |
| Draft/resume UX | **MATCHED+** | localStorage autosave + shelf + import-store unification is *deeper* than reference norms (eBay 5,000 drafts is the only comparable); blob-loss honesty is flagship-grade |
| Listing preview before publish | **MATCHED** | real PDP gallery + feed tile — stronger than Vinted/Depop (no preview) |
| Orders dashboard / dispatch queue | **MATCHED** | 3-stage queue, ship-by SLA, overdue accent, optimistic mark-posted, print label, tracking copy |
| Label/tracking honesty | **MATCHED (hardened, verified)** | fixture mints once and shares with the commerce order; live mode only renders server artifact; demo disclosed; optimistic update never fakes a tracking number |
| Earnings ledger truthfulness | **MATCHED (hardened, verified)** | null-fee honesty live, clearance ties to balance, CSV = on-screen truth, `WALLET_BALANCE` single source. One stale comment (see caveats) |
| Seller metrics that matter | **MATCHED** | views/watchers/conversion/AOV/sell-through + period deltas — real funnel metrics, not vanity. **PARTIAL**: no offers per listing, no impressions/clicks (Poshmark's new granularity), no per-listing detail page |
| Unified to-do radar | **MATCHED** | dispatch/offers/slow-movers in one list with severity tones — matches eBay Overview tasks |
| Catalog import | **MATCHED** | CSV/paste + consent attestations + row workbench + receipts = stronger trust grammar than eBay file exchange. **PARTIAL**: no photos in CSV (all drafts need photos), no marketplace-account connectors, no per-item review screen (mobile has `CatalogImportItemScreen`) |
| Quick replies | **MATCHED** | CRUD + inbox bolt-menu insertion; honestly device-scoped |
| Bump/resurface | **MATCHED** | 24h cooldown + honest countdown (Depop/Poshmark share grammar) |
| Offer to likers | **MATCHED** (lives on PDP) | `components/pdp/OfferToLikers.tsx` + sheet — Poshmark grammar; not surfaced in hub rows |
| Auction management | **MATCHED** | `/seller-hub/auctions` full port |
| Vacation / holiday mode | **MISSING (seller control)** | contract `holidayMode` (`domain.ts:41`) + buyer-side hard gate (`capabilities.ts:99`) exist; **no seller toggle anywhere in web** (mobile: PrivacySettingsScreen toggle + `AwayModeBanner`). Dead lever on web |
| Promoted listings / boost purchase | **MISSING (seller side)** | `listing.promoted` flag consumed by feed (`rankFeed.ts` boost stride) + PDP sponsored badge, but **no seller purchase/manage flow and no promo metrics** |
| Smart-sell / auto-accept policy | **DIVERGENT→MISSING** | mobile `SmartSellCard` (853ln, min-net policy + decision history via `smartSellApi`); web has none |
| AI-assisted listing | **MISSING** | mobile `AIPoweredListingScreen` + `aiListingApi` field suggestions; FB Marketplace Meta-AI grammar now market-standard; web composer is fully manual |
| Original price (RRP) field | **MISSING (composer)** | `originalPrice` exists in `domain.ts:52,95,277` and mobile authors it (`useSellScreenForm.ts:62`); web `SellDraft` has no field |
| Auction option inside sell composer | **DIVERGENT** | mobile embeds `AuctionFieldsSection` in SellScreen; web routes auctions through `/auctions/create` — acceptable split, but no cross-link from `/sell` |
| Sustainability tags in composer | **PARTIAL** | PDP renders `SustainabilityBadge`, settings has a Sustainability view, mobile authors tags in the AI flow — web composer can't author them |
| Bulk listing actions | **MISSING** | no multi-select on the management table (eBay bulk edit, Poshmark bulk reactivate); import is the only bulk path |
| Listing quality score | **PARTIAL** | "Missing: brand, size" flags (`listingManagementModel.ts:136`) are the honest version; no scored quality/readiness per listing (Etsy LQS, eBay listing-quality prompts) |
| Per-listing analytics detail | **MISSING** | mobile `SellerAnalyticsScreen` + `AnalyticsListingDetail` + insights hook; web overview rows link only to PDP |
| Seller standards / ship-time stats | **MISSING** | mobile `SellerStandardsModule`; web reports no avg ship time, cancellation rate, or seller level (Etsy Star Seller / Posh Stats grammar) |
| Scheduled listings / templates | **MISSING** | eBay grammar; nothing on web |
| Returns / dispute management | **MISSING** | eBay Orders includes returns + resolution centre; web fulfilment stops at delivered |
| Parcel-size selection | **DIVERGENT (deliberate)** | Vinted requires it; web asks speed+payer and honestly defers pricing to checkout (`PostageSection:110`) — lighter but honest |
| Sales/inventory report export | **PARTIAL** | earnings CSV exists (client-generated, honest); no inventory report (Poshmark grammar) |

---

## 4. Top caveats (quality audit)

1. **Price guidance exists and is honest** — comps come from `LISTINGS` filtered by category, labelled "similar live listings", never claiming sold evidence (`PriceSection.tsx:70-80`, `constants.ts:264-267`). The honesty is explicit in comments and copy. Caveat: comps are the *global* fixture pool, not seller-relevant solds — fine for fixture mode; live mode must keep the same labelling discipline.
2. **No listing-quality score** — there is a *completeness gate* (publish-blocking) and *discovery-gap flags* ("Missing: brand, size"), but no graded quality/readiness indicator on live listings. Etsy's hidden LQS grammar suggests the next step is a per-listing "add X to sell faster" prompt — the `listingMissingDetails()` hook is already the right carrier.
3. **Draft completeness communication is excellent** — three surfaces carry the same "Needs:" grammar (composer review, hub table, import shelf), and the publish gate is the same function. Blob-photo loss is surfaced honestly, not silently.
4. **Label/tracking honesty verified** — the optimistic mark-posted deliberately omits a fabricated tracking number; fixture minting is shared between label and queue (one truth); live mode renders only the server artifact; demo mode is disclosed on-screen. No caveats.
5. **Earnings ledger truthfulness verified (hardened)** — pending total is the sum of the displayed clearance rows (ties on screen), fee null → "—" not £0.00, next-payout fields all nullable, CSV generated on-device from the same data, `WALLET_BALANCE` is the single source for Available. **One drift**: `fixtures-seller.ts:532` comment claims "first Tuesday on or after the earliest clearance date" but `nextDate` is just the earliest `releaseAt` (or +3d fallback) — stale comment, and the +3d fallback means "nothing scheduled" still shows a date in fixture mode rather than the honest empty state the page supports.
6. **Metrics are the right ones, not vanity** — conversion, sell-through, AOV, watchers, per-period deltas; per-listing views/likes/watchers. Gaps: no offers-funnel stage, no impressions, no ship-time stat — and fixture watchers are `likes × 0.4` synthetic (fine for demo, flag it if shown to investors).
7. **Bulk actions are absent** — the management table is per-row only; the one bulk surface is catalog import. Poshmark's bulk-reactivate and eBay's bulk edit are both unrepresented.
8. **Honest-scope footnotes are good but asymmetric** — bump footnote and demo-label caveat exist; the earnings page shows `Bank account •••• 4521` (a fixture value) with no demo caveat, and quick-replies "saved on this device" while earnings says "generated on this device" — consistent enough, but fixture payment details presented as real is the sharpest honesty edge in the dept.
9. **DESCRIPTION_MIN = 10 chars** is a very low publish floor vs Vinted/Etsy quality expectations (the hint copy carries the real guidance — consider raising or tiering the gate).
10. **Web-only/ mobile-only skew is deliberate-looking but unrecorded**: no in-repo doc explains why Smart Sell, AI listing assist, holiday mode, originalPrice, and sustainability authoring are mobile-only — these read as unported features, not decisions.
