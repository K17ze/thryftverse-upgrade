# ThryftVerse Flagship Upgrade — Ratings & Reviews UI

**Component deep-dive:** every star rating display, rating input, review card, rating distribution histogram, and review filtering control in the ThryftVerse React Native app, audited and upgraded to 2026 flagship quality.

**Benchmark date:** 2026-08
**Sources:** AGENTS.md §4, §6 (truthful UI) · production codebase audit · 2026 web research.

---

## 1. 2026 Competitor Benchmark

### eBay (2026)
eBay's rating system is the commerce benchmark: 5-star display with **half-star support** (4.5 shows 4 full + 1 half), rating distribution histogram (5→1 with bar widths and counts), review filtering (by stars, by date, with photos only), review sorting (most recent, highest, lowest, most helpful), and category breakdown (Item quality, Shipping, Communication). Each review card shows: reviewer name, verified badge, 5-star display, date, review text, photos (up to 5), seller response, and helpfulness voting. eBay's lesson: **ratings are the primary trust signal in a marketplace — they must be granular, filterable, and verifiable.**

### Pinterest (2026)
Pinterest's review system focuses on visual reviews — photos of the product in real use, with the rating overlaid on the photo. The review grid shows photos first, text second. Pinterest's lesson: **visual reviews (photos) are more persuasive than text reviews — surface them prominently.**

### Cross-cutting 2026 consensus
- **Half-star support** — 4.5 shows 4 full + 1 half, not rounded to 5 or 4.
- **Rating distribution histogram** — 5→1 bars showing the spread of ratings.
- **Review filtering** — by stars, by date, with photos only.
- **Review sorting** — most recent, highest, lowest, most helpful.
- **Verified buyer badge** — confirms the reviewer actually purchased.
- **Review photos** — up to 5 photos per review, with fullscreen viewer.
- **Seller response** — seller can respond to reviews, shown in a styled box.
- **Category breakdown** — separate ratings for item quality, shipping, communication.
- **Helpfulness voting** — users can mark reviews as "helpful", sorted by helpfulness.

---

## 2. Psychology & Principles

### Social proof and trust
Ratings are the primary social proof signal in a marketplace. A buyer who sees "4.9 ★ (47 reviews)" trusts the seller more than a buyer who sees "New seller, no reviews." The rating is a heuristic — the buyer doesn't read all 47 reviews, they trust the aggregate. This is why the distribution histogram matters: "4.9 average from 47 reviews, all 5-star except two 4-star" is more trustworthy than "4.9 average from 47 reviews" (which could be 46 5-star + 1 1-star).

### The half-star precision problem
Rounding 4.5 to 5 stars overstates the rating. Rounding 4.5 to 4 stars understates it. Half-stars solve this: 4.5 shows 4 full + 1 half, which is visually accurate. The `Math.round(avg)` pattern (used in ThryftVerse) is a defect — it loses precision and misrepresents the rating.

### Review photos as evidence
A review with photos is more persuasive than a text-only review because the photos are evidence — the buyer can see the actual item, not just read about it. Surfacing "reviews with photos" as a filter and showing photo thumbnails in review cards increases trust.

### Recency weighting
Recent reviews are more relevant than old reviews. A seller who was 5-star in 2024 but 3-star in 2026 should not show "4.5 average" without context. Review sorting by "most recent" and date filtering ("last 6 months") address this.

---

## 3. Current ThryftVerse Audit — Concrete Defects

### Rating/review components (6 files)

| File | Lines | Description | Quality |
|------|-------|-------------|---------|
| `components/profile/ProfileReviews.tsx` | 312 | Core: ReviewSummaryBlock (histogram) + ProfileReviewRow (card) | ✅ Well-built |
| `components/orders/ReviewPromptSheet.tsx` | 260 | Quick 5-star rating prompt | ✅ Haptic feedback |
| `screens/WriteReviewScreen.tsx` | 486 | Full review submission (stars, text, 4 photos) | ✅ Well-built |
| `components/skeletons/WriteReviewSkeleton.tsx` | 103 | Loading skeleton | ✅ |
| `services/reviewApi.ts` | 62 | Order review API | ✅ |
| `services/sellerReviewsApi.ts` | 52 | Seller reviews API with distribution | ✅ |

### Inline rating displays (8 locations)

| Screen | Lines | Format |
|--------|-------|--------|
| `ProfileHero.tsx` | 119-131, 273-296 | "4.9 ★ · 47 sold · Joined June 2026" |
| `ProfileTrustSignals.tsx` | 82-92 | "★ 4.9 (47)" chip |
| `ListingSellerRow.tsx` | 47-63 | Star icon + rating + count |
| `SellerInfoCard.tsx` | 67-70 | "4.9★ (47)" |
| `SellerTrustCard.tsx` | 39-45 | Grid cell with rating |
| `ItemDetailScreen.tsx` | 970-979 | "★ 4.9 · 47 reviews" |
| `AuctionDetailScreen.tsx` | 1059-1063 | Rating passed to seller row |
| `OrderDetailScreen.tsx` | 657-668 | "Leave a review" action |

### ✅ Already well-built
- **Review card** with author, verified badge, 5-star display, date, text, photos (up to 4), seller response
- **Rating distribution histogram** with 5→1 bars and percentage widths
- **Review submission flow** with star input, text area, photo upload
- **Seller response** to reviews with styled box
- **API** supports `photoUrls`, `sellerResponse`, `distribution` array

### Defects

| # | Defect | Location | Severity |
|---|--------|----------|----------|
| 1 | **No half-star support** — uses `Math.round(avg)`, 4.5 shows as 5 stars | `ProfileReviews.tsx:41` | High |
| 2 | **No review filtering** — can't filter by stars, date, or photos only | UserProfileScreen Reviews tab | High |
| 3 | **No review sorting** — only API default order | Global | Medium |
| 4 | **No category breakdown** — single overall rating only | WriteReviewScreen, ProfileReviews | Medium |
| 5 | **No helpfulness voting** — can't mark reviews as helpful | ProfileReviews | Low |
| 6 | **`Math.round(avg)` loses precision** — 4.7 rounds to 5, 4.3 rounds to 4 | `ProfileReviews.tsx:41` | High |
| 7 | **No review reporting** — can't report inappropriate reviews | ProfileReviews | Low |
| 8 | **Photo limit is 4** (eBay allows 5) | WriteReviewScreen | Low |

---

## 4. Micro Improvements

### M1 — Add half-star support
Replace `Math.round(avg)` with half-star logic:
```tsx
function getStarType(position: number, rating: number): 'full' | 'half' | 'empty' {
  const diff = rating - position;
  if (diff >= 0.75) return 'full';
  if (diff >= 0.25) return 'half';
  return 'empty';
}
```
Use `star` (full), `star-half-outline` (half), `star-outline` (empty) from Ionicons.

### M2 — Add review filtering
Extend `fetchSellerReviews` API to support: `minRating`, `hasPhotos`, `dateFrom`. Add filter chips in the Reviews tab: "All", "5★", "4★", "With photos", "Last 6 months".

### M3 — Add review sorting
Add `sort` parameter to API: `recent`, `highest`, `lowest`, `helpful`. Add sort dropdown in the Reviews tab header.

### M4 — Add category breakdown
Extend WriteReviewScreen to collect: Item quality, Shipping speed, Communication. Display as 3 mini rating rows in the review card and as a breakdown in the summary.

### M5 — Add helpfulness voting
Add "Helpful" button on each review card. Track count. Sort by helpfulness when selected.

### M6 — Fix rating precision in all inline displays
Update all 8 inline rating displays to use the half-star logic from M1, not `Math.round()`.

---

## 5. Macro Improvements

### A1 — Rating component system
Create a unified rating component family:
- `StarRating` — display (read-only) with half-star support, size variants (sm/md/lg)
- `StarRatingInput` — interactive input with haptic per star
- `RatingDistribution` — histogram with 5→1 bars
- `ReviewCard` — author, verified badge, stars, date, text, photos, seller response, helpfulness
- `ReviewFilterBar` — filter chips + sort dropdown

### A2 — Reviews as the trust center
Make the seller's reviews tab the trust center: distribution histogram at top, filter/sort bar, review cards with photos, seller responses, and helpfulness voting. This is the surface a buyer visits before purchasing — it must be comprehensive.

---

## 6. Flagship Acceptance Criteria

- **Half-star support** on all rating displays (no `Math.round`)
- **Rating distribution histogram** with 5→1 bars
- **Review filtering** by stars, date, photos
- **Review sorting** by recent, highest, lowest, helpful
- **Review cards** with author, verified badge, stars, date, text, photos, seller response
- **Category breakdown** (item quality, shipping, communication)
- **Helpfulness voting** on reviews
- **Photo support** up to 5 per review
- **Skeleton loading state** for reviews
- **Accessibility** — stars with `accessibilityLabel` ("Rated 4.5 out of 5")

### Thumbnail test
At 25% scale, a review card must show: the star row, the reviewer name, and at least the first line of review text. The distribution histogram must show the bar proportions.

---

## 7. Priority & Sequencing

| Priority | Item | Risk | Unblocks |
|----------|------|------|----------|
| P0 | M1 — Half-star support | Low | Rating accuracy |
| P0 | M6 — Fix all inline displays | Low | Consistency |
| P1 | M2 — Review filtering | Medium | Review UX |
| P1 | M3 — Review sorting | Medium | Review UX |
| P2 | M4 — Category breakdown | Medium | Rating granularity |
| P2 | M5 — Helpfulness voting | Low | Review quality |
| P3 | A1 — Rating component system | High | All rating surfaces |
| P3 | A2 — Reviews as trust center | High | Trust UX |

---

## 8. Token-Level Spec

| Token | Value | Notes |
|-------|-------|-------|
| `star.size.sm` | 12pt | Inline (listing cards) |
| `star.size.md` | 16pt | Review cards |
| `star.size.lg` | 24pt | Input (WriteReviewScreen) |
| `star.color.filled` | colors.brand | Gold/brand |
| `star.color.empty` | colors.textMuted | Grey |
| `star.color.half` | colors.brand | Half fill |
| `star.haptic` | selection per star | Input only |
| `rating.precision` | half-star (0.25 threshold) | Not Math.round |
| `review.photo.maxCount` | 5 | Up from 4 |
| `review.photo.thumbnailSize` | 72pt | Grid |
| `distribution.bar.height` | 8pt | |
| `distribution.bar.color` | colors.brand | Filled |
| `distribution.bar.trackColor` | colors.surfaceAlt | Unfilled |
| `filter.chip.activeColor` | colors.brand | Active filter |

---

*Generated 2026-08-18. Sources: production codebase audit, eBay rating/review patterns, Pinterest visual review patterns.*
