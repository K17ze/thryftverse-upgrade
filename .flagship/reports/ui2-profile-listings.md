# UI2 — Profile Hero + My Listings (second-pass re-author)

Benchmarks: Depop/Vinted profile (identity-first, media-forward, near-zero
chrome) and Vinted "My items" (clean inventory list).

## 1. MyProfileIdentityHero.tsx — re-authored

Previous shape: avatar overlapping cover (left) + three stacked stat
columns (For sale / Sold / Followers with hairline dividers) + full-width
name below + meta line. Stats led the first band; identity receded.

New composition (Depop pattern):

```
[cover]
avatar 96pt (left, seam overlap) │ Name ✓            ✎ (20pt glyph)
                                 │ @handle
                                 │ ★ 4.8 · 23 reviews   ← tappable seam
12 for sale · 34 sold · 1.2k followers · 56 following   ← inline numbers
bio (plain, linkified)
Replies within 2h · London · Joined June 2026
website
```

- **Identity owns the seam row.** Name + verified badge + quiet edit glyph,
  @handle, and the star-rating seam now sit beside the avatar instead of
  below it. Avatar + name dominate; everything else recedes.
- **Star rating + review count** is a new tappable seam (`★ 4.8 · 23
  reviews`, Pressable only when a reviews tab exists). Data:
  `sellerTrust.rating ?? reviewSummary.ratingAverage`, `reviewCount` from
  the existing reviews query — no new fetch.
- **Followers/following as numbers, not columns.** The three stacked stat
  columns + dividers are replaced by one inline run —
  `12 for sale · 34 sold · 1.2k followers · 56 following` — semibold
  tabular number + muted lowercase word, each segment a hit-slopped
  pressable. `followingCount` was already fetched (`followCounts`) and
  routes to `ConnectionList` mode `following`.
- **Edit affordance** stays a 20pt `create-outline` glyph pinned to the end
  of the name row (transparent 44pt target) — unchanged, already correct.
- **No duplicated counts.** Sold lives once (stats line → MyOrders). Meta
  line keeps Replies/location/joined only.
- Truthful-UI preserved: `—` for unknown counts while loading/error;
  rating seam hidden when no rating and no reviews.
- `lookCount` prop removed (declared but never passed or rendered).
- String style kept literal, matching the file and `ProfileHero` (no new
  i18n keys created; existing pattern reused).

## 2. MyProfileScreen.tsx — wiring only

- New `handlePressReviews` — same contract as `handlePressListings`
  (FRESH-06): selects `reviews` tab + scrolls to measured tab-content Y.
  Passed as `onPressRating` only when `myReviewCount > 0` (the tab is
  conditional, so the seam is never a dead affordance).
- Passes `followingCount`, `onPressFollowing` → `ConnectionList`
  (`mode: 'following'`), `rating`, `reviewCount`.
- Hero still composes with what surrounds it: cover, highlights rail,
  utility rail, ShopRail, StorefrontTabs unchanged.

## 3. MyListingsScreen.tsx — re-authored top region + rows

Reading order is now: `My listings` (FlagshipHeader, megaphone = promotions)
→ one filled `+ New listing` + 3 transparent 44pt glyph targets (analytics /
auctions / wallet) → tabs with counts → hairline-separated list.

Removed above the list:

- **Inventory value line** (`statActiveValue · statAvgPrice`) — analytics
  belongs in SellerAnalytics; cut, not relocated.
- **SellerStandardsBadges** — seller-trust chrome already lives on the
  profile/SellerHub; removed along with the `useSellerTrust` fetch.
- **`icon` field on TabConfig** — dead config (icons were never rendered).

Kept:

- **Partial-counts note** — only renders when the totals endpoint fails,
  disclosing that tab counts cover the loaded page (truthful UI).
- Action cluster unchanged in structure: one filled primary + quiet icons —
  already correct per charter, verified not boxed.

Rows (Vinted "My items" pattern):

- Pill badge, category text, and the icon-led engagement row collapsed into
  **one meta line**: status word in its semantic colour, then a muted tail
  `· Jackets · 12 views · 3 likes`. Removes the only visible containment on
  the row (radius budget drops to media + primary CTA).
- Price promoted to `bodyStrong`/textPrimary — the row's second anchor.
- `gap` removed from the list container — rows are now contiguous
  hairline-separated (hairline was already there; gap created double
  separation).
- Missing-details warning kept as a conditional second line (active +
  incomplete only).
- Filtered-empty: oversized `filter` hero icon removed — authored message +
  single quiet "Show all" action remains.
- Dead `styles.container`, `valueLine`, `statusBadge`, `engagement*`,
  `rowCategory` styles removed.

## Verification

- `npx tsc --noEmit`: clean for all owned files. **One pre-existing error
  outside my ownership**: `src/screens/SellerHubScreen.tsx(326,11)` —
  `listedValueLabel` not in `SellerListingsModuleProps`. This is an
  uncommitted wave-1 change in `seller/` (I did not touch it; the file is
  modified in the working tree). Parent agent should route this to whoever
  owns `seller/`.
- `npx vitest run pkg09CommerceSurfaces stateTruthfulnessRepairs
  e2eSmokePlan`: **3 files, 111 tests — all pass.** FRESH-06 (For-sale stat
  wiring) intact.

## Anti-AI checklist

- Flat canvas + hairlines: yes — list is hairline-separated, no cards.
- One dominant panel above fold: the cover media; everything else flat.
- Non-avatar radii per viewport ≤ 2: profile hero has none; listings has
  Radius.md (media thumbs) + Radius.md (primary CTA).
- 44pt targets separated from visible shape: edit glyph, quiet icons, stat
  segments via hitSlop.
- No restated headings / label-everything: value line, badges, stat-column
  labels, pill, icon row, empty-state icon all cut.
- Dark mode: all colour via `colors.*` tokens. Large text: stats line wraps
  (`flexWrap`), name `numberOfLines=1` + flexShrink, `flexShrink` on name.
- States: loading (FlagshipState), empty (authored EmptyState + single CTA),
  filtered-empty, error toast + partial-counts disclosure, offline banner.
- i18n: existing `myListings.*` keys reused; no new keys; hero keeps the
  file's existing literal-string convention (same as ProfileHero).
