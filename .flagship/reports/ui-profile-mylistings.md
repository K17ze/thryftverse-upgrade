# UI Upgrade — Profile Identity Hero + My Listings

Date: 2026-10-12
Scope: `frontend/src/components/profile/MyProfileIdentityHero.tsx`, `frontend/src/screens/MyListingsScreen.tsx` (no sibling/screen changes needed — `MyProfileScreen.tsx` required no edits since the hero's prop contract is unchanged).

## Case study findings

### MyProfileIdentityHero (own profile)
- The "Edit profile" row was a full-width hairline chevron list row — a settings-screen pattern dropped into an identity surface. It competed with the name for dominance and read as assembled chrome.
- The trust block restated "N sold" even though the seam stats directly above it already carry a tappable Sold stat (routed to `MyOrders`). Sold + "Joined" + location formed a three-line caption stack under the bio — label-everything disease.

### MyListingsScreen
- Four icon+label metric rows (Active / Sold / Avg price / Active value) duplicated counts that the filter tabs already display (each tab renders its count badge). Icon+label stat rows are the AI-assembled tell.
- Four equal `flex:1` boxed buttons (New listing / Analytics / Auctions / Payouts) gave a secondary navigation cluster the same visual weight as the primary creation action.
- A "N listings · Tab" count line under the tabs restated the tab counts a third time.

## Changes

### `components/profile/MyProfileIdentityHero.tsx`
- Removed the full-width `editRow` chevron row. Edit is now a quiet trailing `create-outline` glyph (20pt, `textSecondary`) pinned to the end of the display-name row via `marginLeft: 'auto'`. Transparent target — the 44pt hit area comes from `AnimatedPressable`'s default 12pt hitSlop; no grey container rendered. Same handler, a11y label ("Edit profile and storefront"), role, and light haptic retained.
- Collapsed the trust block (sold + response time + joined) and the separate location `contextLine` into ONE `metaLine`: `Replies {responseTimeLabel} · {location} · Joined {memberSince}` — segments joined with `·`, only present segments rendered, `numberOfLines={1}`. Sold is deliberately dropped (redundant with the tappable seam stat). Response time leads because it is a top-3 marketplace conversion signal; location and tenure follow.
- Removed dead styles (`editRow`, `editRowText`, `trustBlock`, `trustMetaRow`, `trustSold`, `trustJoined`, `trustResponse`, `trustDot`, `contextLine`) and the unused `Radius` import.
- Prop contract unchanged — `MyProfileScreen.tsx` needed no edits. Seam triad (For sale / Sold / Followers), bio linkification, verification badge, and website link untouched.

### `screens/MyListingsScreen.tsx`
- Deleted the `FlagshipMetricLine` component and its four-row ledger. Active/Sold counts now live exclusively on the filter tabs (they already rendered count badges — no mechanism change needed).
- Value metrics compressed to a single muted line shown only when inventory exists: `{statActiveValue} {totalActiveValue} · {statAvgPrice} {avgActivePrice}` (reuses existing i18n keys; avg price is not surfaced by SellerHub, so it stays). The truthful `partialCounts` note is retained when the server totals endpoint is unreachable.
- Removed the duplicated "N listings · Tab" header row under the tabs.
- Rebuilt the bottom action bar as one control cluster: a single filled brand `primaryAction` ("+ New listing", 40pt height, `Radius.md`, `textInverse` label) on the left, and three transparent 44×44 `iconAction` targets (analytics → SellerAnalytics, hammer → SellerAuctionCentre, wallet → Wallet) on the right — glyph-only, no boxed buttons. All handlers, `haptics.tap()`, i18n keys, a11y labels/roles preserved.
- Trimmed dead analytics fields (`totalSoldValue`, `avgSoldPrice` — computed but never rendered) and removed now-unused imports (`Pressable`, `Stroke`).
- Radius budget: viewport keeps two non-avatar radii (`Radius.sm` status badge, `Radius.md` images + primary button). Strokes: hairlines only (row separators, badge outlines). No filled dividers added.

## Anti-AI checklist
- No icon+label stat rows; counts live on tabs.
- No duplicate headings/count lines; sold count rendered once (seam stat).
- Edit affordance: 44pt hit area decoupled from the 20pt visible glyph — no grey box.
- One filled control per surface (New listing); secondary actions are transparent icon targets.
- Hairline separators only; no stacked identical rounded cards introduced.

## Verification
- `npx tsc --noEmit` — 41 errors, ALL pre-existing in `src/components/filters/*` (FilterAdvancedSection, FilterBrandSection, FilterConditionSection, FilterLoadingState, FilterSizeSection, FilterSortSection). Zero errors in touched files. Those files were already modified in the working tree before this task (not by this change).
- `npx vitest run` on related suites: `pkg09CommerceSurfaces`, `structuralArchitecture`, `stateTruthfulnessRepairs`, `e2eSmokePlan`, `visualRegressionPlan`, `settings01InformationArchitecture` — 6 files, 337 passed, 2 skipped.

## Notes / follow-ups
- `myListings.statActive` / `statSold` / `listingCount` / `listingWord*` i18n keys are now unused by this screen; left in place (shared i18n file is outside ownership scope).
- SellerHub already shows "£X listed" (SellerListingsModule) — the single value line here was kept because avg price is not shown there and the line is one muted text row, not a metric stack.
