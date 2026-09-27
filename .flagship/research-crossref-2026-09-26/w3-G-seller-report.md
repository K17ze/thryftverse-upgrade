# W3-G Seller Department — Implementation Report
**Date:** 2026-09-26 · **Scope:** sell composer + seller-hub (web) · **Status:** COMPLETE — `npx tsc --noEmit` clean project-wide, `npx eslint` clean on all touched files.

---

## Rescued state

The previous W3-G agent died mid-flight with the data layer mostly built and the
listings page half-wired. Found on arrival:

- **Breakage fixed:** `ListingStatus` gained `'paused'` (`listingManagementModel.ts:17`)
  but `seller-hub/listings/page.tsx` had no `paused` key in `EMPTY_COPY` or the
  counts record — 3 tsc errors, now resolved.
- **Already complete (verified, kept):** holiday-mode settings page wired to the
  real `PATCH /users/me/preferences` (`sellerHub.ts:511`); promotions manage page
  against `/seller/promotions` + `/stats`; fixture stores for away state,
  promotions, batch commands and seller standards in `fixtures-seller.ts`;
  hooks (`useShopAway`, `useSellerPromotions`, `useListingStats`,
  `useSellerStandards`, `useListingBatchCommand`) in `seller-queries.ts`;
  composer `originalPrice` + `sustainabilityTags`, `DESCRIPTION_MIN=40`,
  photo shot-list line; `methodIsDemo` flag and the corrected payout-schedule
  comment (the stale "first Tuesday" copy was already fixed and the +3d
  invented-date fallback removed).

## Changes this session

| File | Change |
|---|---|
| `src/components/seller/listingManagementModel.ts` | Added `BulkCommand` type, `bulkEligible()`, `bulkDeletable()`, `bulkReasonCopy()` — the truthful reason→copy map for batch receipts. |
| `src/components/seller/ListingManagementToolbar.tsx` | Added **Paused** to the status filter rail. |
| `src/components/seller/ListingManagementTable.tsx` | Rewritten: real checkboxes + select-all/mixed header, bulk bar (Pause/Resume/Delete with eligible counts, skipped rows reported not hidden), paused badge + dimmed thumb + Resume/Edit actions, stats affordance (clickable stats column ≥md, icon button <md), bulk-delete confirm Sheet. |
| `src/components/seller/ListingStatsSheet.tsx` | **New** — per-listing analytics sheet: views→watching→likes→offers→sales, conversion, time on market; live mode adds intent signal + price history verbatim; fixture mode carries an explicit demo disclosure. |
| `src/app/seller-hub/listings/page.tsx` | Fixed `paused` in `EMPTY_COPY` + `statusCounts`; selection state pruned against live rows; wired `useListingBatchCommand` with per-item receipt toasts ("Paused 2 · 1 skipped (already sold)"); drafts in bulk-delete routed through their own stores; stats sheet mounted; demo footnote extended to pauses/deletes. |
| `src/lib/hooks/seller-queries.ts` | `SellerOverview.offersReceived` → `funnel {views, watchers, offers, orders}` — same numbers the metric cells show, one truth; offers null-honest on live fetch failure. |
| `src/app/seller-hub/page.tsx` | Funnel strip under the metric grid ("30-day funnel — 1.2k views → 86 watching → 5 offers → 3 sold", `—` for missing offers); watchers metric renders `· est.` + footnote when the `estimated` flag is set; payout line appends "(demo)" to the fixture bank method. |
| `src/app/seller-hub/earnings/page.tsx` | `Bank account •••• 4521` now labelled `(demo)` in the next-payout line and the CSV Method row, plus a footnote: "no bank account is connected in this preview." Hidden entirely in live mode (`method: null`). |

## Task ledger

1. **Vacation/holiday mode** — DONE (pre-existing work verified). `/seller-hub/settings` toggle + return date + away message + buyer-visible preview line; live writes `PATCH /users/me/preferences`; fixture mode persists on-device and projects `seller.holidayMode` onto the fixture closet so buy buttons genuinely pause.
2. **Promoted listings manage** — DONE (verified). `/seller-hub/promotions` — create (balance-aware copy), pause/resume/end with confirm; impressions/clicks/billed days from the stats endpoint only; demo rows labelled and metric-free.
3. **originalPrice + sustainability** — DONE (verified). Composer fields, honest-RRP validation, `originalPriceGbp` on live publish; sustainability chips disclosed as seller-asserted.
4. **Bulk actions** — DONE (this session). Multi-select + bulk pause/resume/delete through the durable batch command; per-item receipts surfaced.
5. **Per-listing analytics** — DONE (this session). Real endpoint live; fixture-derived demo-labelled.
6. **Bank demo caveat** — DONE (this session). Labelled in UI + CSV + overview.
7. **Watcher truth** — DONE. Aggregate watchers flagged `estimated`; per-listing sheet discloses demo source.
8. **Stale "first Tuesday" copy** — DONE (prior agent; verified correct).
9. **Shot-list nudges** — DONE (verified): front/back/label/flaws line in PhotosSection.
10. **Description floor** — DONE (verified): `DESCRIPTION_MIN=40` + helper copy.
11. **Standards + offers funnel** — DONE: standards on settings page (live verbatim / demo-computed ship time, returns honestly "—"); funnel strip on overview.

## Concerns

- `MY_LISTING_STATS` re-export in `fixtures-commerce.ts` left untouched per instructions.
- Paused fixture listings mutate `Listing.status` in place; buyer-facing filtering of paused rows in feed/shop surfaces is W3-D's display-side ownership — `capabilities.ts` already gates purchase.
- Batch `delete` in fixture mode removes rows from `MY_LISTINGS` outright (backend 'deleted' end-state); sold rows are rejected and reported, matching the endpoint contract.
