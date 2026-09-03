# Metric Dictionary v1

The authoritative reference for every metric displayed in the ThryftVerse seller
surfaces. When a metric appears in the UI, it **must** use the `label` defined
here — no per-screen variants, no invented names.

The TypeScript source of truth lives at
`frontend/src/domain/metricDictionary.ts`.

## Conventions

- **unit** — `count`, `currency`, `percent`, or `duration`.
- **scope** — `listing` (single item), `seller` (one seller's aggregate),
  `platform` (marketplace-wide).
- **periodRequired** — whether the metric needs a `7d` / `30d` / `90d` window.
- **source** — the backend endpoint or derivation that produces the value.
  All monetary values are stored and returned in **GBP**.

---

## Listing-level engagement

| key | label | unit | source |
|-----|-------|------|--------|
| `views` | Views | count | `GET /sellers/:id/analytics` (`totalViews`) · listing_engagement |
| `uniqueViewers` | Unique viewers | count | `ListingHealthMetrics.uniqueViewers` |
| `saves` | Saves | count | `SellerAnalytics.totalSaves` |
| `likes` | Likes | count | `TopPerformerListing.likesCount` |
| `shares` | Shares | count | `ListingHealthMetrics.shares` |
| `inquiries` | Inquiries | count | `ListingHealthMetrics.inquiries` |
| `offers` | Offers | count | `ListingHealthMetrics.offers` |

## Listing-level conversion

| key | label | unit | source |
|-----|-------|------|--------|
| `conversionRate` | Conversion | percent | Derived: `(itemsSold / totalViews) * 100` |
| `engagementRate` | Engagement | percent | `TopPerformerListing.engagementScore` |
| `viewToInquiryRate` | View-to-inquiry rate | percent | `ListingHealthMetrics.viewToInquiryRate` |
| `inquiryToOfferRate` | Inquiry-to-offer rate | percent | `ListingHealthMetrics.inquiryToOfferRate` |
| `offerToSaleRate` | Offer-to-sale rate | percent | `ListingHealthMetrics.offerToSaleRate` |

## Operational metrics

| key | label | unit | source |
|-----|-------|------|--------|
| `responseTime` | Response time | duration | `SellerPerformanceTrend.averageResponseTimeHours` |
| `shipTime` | Ship time | duration | `SellerPerformanceTrend.averageShipTimeDays` |

## Seller-level financials

| key | label | unit | source |
|-----|-------|------|--------|
| `revenue` | Revenue | currency | `GET /sellers/:id/analytics` (`revenueGbpMinor`) |
| `netSales` | Net sales | currency | `SellerAnalytics.netSalesGbpMinor` |
| `grossMerchandiseValue` | Gross merchandise value | currency | `SellerHubOverview.businessPulse.grossSalesGbp` |
| `refunds` | Refunds | currency | `SellerAnalytics.refundsGbpMinor` |
| `fees` | Fees | currency | `SellerAnalytics.feesGbpMinor` |

## Seller-level sales metrics

| key | label | unit | source |
|-----|-------|------|--------|
| `itemsSold` | Items sold | count | `SellerAnalytics.itemsSold` |
| `avgSalePrice` | Avg sale | currency | Derived: `totalRevenue / itemsSold` |
| `avgOrderValue` | Avg order value | currency | Derived: `heroValue / itemsSold` |

## Velocity / time-to-sell

| key | label | unit | source |
|-----|-------|------|--------|
| `daysToSell` | Days to sell | duration | `SellerPerformanceTrend.medianDaysToSell` |
| `daysListed` | Days listed | duration | `ListingHealthMetrics.daysListed` |
| `sellThroughRate` | Sell-through rate | percent | Derived: `itemsSold / activeListings` |

## Listing health

| key | label | unit | source |
|-----|-------|------|--------|
| `healthScore` | Health score | count (0–100) | `ListingHealthMetrics.healthScore` · `deriveHealthScore()` |
| `healthGrade` | Health grade | count (A–D) | `ListingHealthMetrics.healthGrade` · `getHealthGrade()` |

## Top performers

| key | label | unit | source |
|-----|-------|------|--------|
| `topPerformersRanking` | Top listings | count | `GET /sellers/:id/analytics/top-performers` |

## Seller Hub money posture

| key | label | unit | source |
|-----|-------|------|--------|
| `availableBalance` | Available | currency | `GET /seller-hub/overview` (`money.availableGbp`) |
| `processingBalance` | Processing | currency | `GET /seller-hub/overview` (`money.processingGbp`) |
| `heldBalance` | Held in reserve | currency | `GET /seller-hub/overview` (`money.heldGbp`) |
| `listedValue` | Listed value | currency | `GET /seller-hub/overview` (`inventory.listedValueGbp`) |

## Inventory counts

| key | label | unit | source |
|-----|-------|------|--------|
| `activeListings` | Active listings | count | `GET /seller-hub/overview` (`inventory.active`) |
| `draftListings` | Draft | count | `GET /seller-hub/overview` (`inventory.drafts`) |
| `soldListings` | Sold | count | `GET /seller-hub/overview` (`inventory.sold`) |
| `pausedListings` | Paused | count | `GET /seller-hub/overview` (`inventory.paused`) |
| `avgActivePrice` | Avg active price | currency | `MyListings analytics.avgActivePrice` |
| `totalActiveValue` | Active value | currency | `MyListings analytics.totalActiveValue` |

## Rating / trust

| key | label | unit | source |
|-----|-------|------|--------|
| `avgRating` | Avg rating | count | `SellerAnalytics.avgRating` |
| `reviewCount` | Reviews | count | `SellerAnalytics.reviewCount` |
| `responseRate` | Response rate | percent | `SellerAnalytics.responseRate` |
| `positiveRatingPct` | Positive rating | percent | `SellerAnalytics.positiveRatingPct` |

---

## Governance rules

1. **One label per concept.** If a metric is shown on two screens, both render
   the `label` from this dictionary. No "Revenue" on one screen and "Sales" on
   another for the same underlying value.
2. **Source is verifiable.** Every metric traces to a backend endpoint or an
   explicit derivation. No fabricated numbers.
3. **Currency is GBP at the source.** All monetary metrics are stored and
   returned in GBP. Conversion to the user's display currency happens only at
   the formatting layer (`formatFromFiat(amount, 'GBP', …)`).
4. **Add before you display.** A new metric must be added to
   `metricDictionary.ts` before it appears in any screen.
