/**
 * Metric Dictionary v1 — authoritative product language governance.
 *
 * Every metric displayed in the UI must have an entry here. The `label`
 * is the canonical human-readable string; screens should render it rather
 * than inventing per-screen variants. The `source` documents where the
 * value originates so reviewers can verify provenance end-to-end.
 *
 * When a new metric is added to a screen, add it here first.
 */

export type MetricUnit = 'count' | 'currency' | 'percent' | 'duration';
export type MetricScope = 'listing' | 'seller' | 'platform';

export interface MetricDefinition {
  key: string;
  label: string;
  description: string;
  unit: MetricUnit;
  source: string;
  scope: MetricScope;
  periodRequired: boolean;
}

export const METRIC_DICTIONARY: MetricDefinition[] = [
  // ── Listing-level engagement ──
  {
    key: 'views',
    label: 'Views',
    description: 'Total view events recorded for a single listing.',
    unit: 'count',
    source: 'GET /sellers/:id/analytics (totalViews) · listing_engagement table',
    scope: 'listing',
    periodRequired: true,
  },
  {
    key: 'uniqueViewers',
    label: 'Unique viewers',
    description: 'Distinct users who viewed a listing at least once.',
    unit: 'count',
    source: 'ListingHealthMetrics.uniqueViewers · listing_engagement table',
    scope: 'listing',
    periodRequired: false,
  },
  {
    key: 'saves',
    label: 'Saves',
    description: 'Number of users who saved a listing to their closet.',
    unit: 'count',
    source: 'SellerAnalytics.totalSaves · ListingHealthMetrics.saves',
    scope: 'listing',
    periodRequired: true,
  },
  {
    key: 'likes',
    label: 'Likes',
    description: 'Number of likes received on a listing.',
    unit: 'count',
    source: 'TopPerformerListing.likesCount · listing engagement table',
    scope: 'listing',
    periodRequired: true,
  },
  {
    key: 'shares',
    label: 'Shares',
    description: 'Number of times a listing was shared.',
    unit: 'count',
    source: 'ListingHealthMetrics.shares',
    scope: 'listing',
    periodRequired: false,
  },
  {
    key: 'inquiries',
    label: 'Inquiries',
    description: 'Chat conversations started about a listing.',
    unit: 'count',
    source: 'ListingHealthMetrics.inquiries · SellerPerformanceTrend.totalInquiries',
    scope: 'listing',
    periodRequired: true,
  },
  {
    key: 'offers',
    label: 'Offers',
    description: 'Offers received on a listing.',
    unit: 'count',
    source: 'ListingHealthMetrics.offers · SellerPerformanceTrend.totalOffers · NeedsAttentionListing.offerCount',
    scope: 'listing',
    periodRequired: true,
  },

  // ── Listing-level conversion ──
  {
    key: 'conversionRate',
    label: 'Conversion',
    description: 'Items sold divided by total views, expressed as a percentage.',
    unit: 'percent',
    source: 'Derived: (itemsSold / totalViews) * 100 — SellerAnalyticsScreen',
    scope: 'listing',
    periodRequired: true,
  },
  {
    key: 'engagementRate',
    label: 'Engagement',
    description: 'Composite engagement score blending views, likes, saves and inquiries.',
    unit: 'percent',
    source: 'TopPerformerListing.engagementScore',
    scope: 'listing',
    periodRequired: true,
  },
  {
    key: 'viewToInquiryRate',
    label: 'View-to-inquiry rate',
    description: 'Inquiries divided by views for a listing.',
    unit: 'percent',
    source: 'ListingHealthMetrics.viewToInquiryRate',
    scope: 'listing',
    periodRequired: false,
  },
  {
    key: 'inquiryToOfferRate',
    label: 'Inquiry-to-offer rate',
    description: 'Offers divided by inquiries for a listing.',
    unit: 'percent',
    source: 'ListingHealthMetrics.inquiryToOfferRate',
    scope: 'listing',
    periodRequired: false,
  },
  {
    key: 'offerToSaleRate',
    label: 'Offer-to-sale rate',
    description: 'Sales divided by offers for a listing.',
    unit: 'percent',
    source: 'ListingHealthMetrics.offerToSaleRate',
    scope: 'listing',
    periodRequired: false,
  },

  // ── Operational metrics ──
  {
    key: 'responseTime',
    label: 'Response time',
    description: 'Average hours from buyer inquiry to seller reply.',
    unit: 'duration',
    source: 'SellerPerformanceTrend.averageResponseTimeHours · SellerAnalytics.responseRate',
    scope: 'seller',
    periodRequired: true,
  },
  {
    key: 'shipTime',
    label: 'Ship time',
    description: 'Average days from payment to dispatch for fulfilled orders.',
    unit: 'duration',
    source: 'SellerPerformanceTrend.averageShipTimeDays · seller_trust.ship_within_days',
    scope: 'seller',
    periodRequired: true,
  },

  // ── Seller-level financials ──
  {
    key: 'revenue',
    label: 'Revenue',
    description: 'Gross sales from paid/shipped/delivered orders in the period, before refunds and fees.',
    unit: 'currency',
    source: 'GET /sellers/:id/analytics (revenueGbpMinor) · SellerHubOverview.businessPulse.grossSalesGbp',
    scope: 'seller',
    periodRequired: true,
  },
  {
    key: 'netSales',
    label: 'Net sales',
    description: 'Revenue minus refunds and platform fees for the period.',
    unit: 'currency',
    source: 'SellerAnalytics.netSalesGbpMinor · SellerHubOverview.businessPulse.netSalesGbp',
    scope: 'seller',
    periodRequired: true,
  },
  {
    key: 'grossMerchandiseValue',
    label: 'Gross merchandise value',
    description: 'Total value of goods sold across the platform or seller, gross of refunds.',
    unit: 'currency',
    source: 'SellerHubOverview.businessPulse.grossSalesGbp',
    scope: 'platform',
    periodRequired: true,
  },
  {
    key: 'refunds',
    label: 'Refunds',
    description: 'Total refund amounts debited from seller payable in the period.',
    unit: 'currency',
    source: 'SellerAnalytics.refundsGbpMinor · SellerHubOverview.businessPulse.refundsGbp',
    scope: 'seller',
    periodRequired: true,
  },
  {
    key: 'fees',
    label: 'Fees',
    description: 'Platform fees debited from seller payable in the period.',
    unit: 'currency',
    source: 'SellerAnalytics.feesGbpMinor · SellerHubOverview.businessPulse.feesGbp',
    scope: 'seller',
    periodRequired: true,
  },

  // ── Seller-level sales metrics ──
  {
    key: 'itemsSold',
    label: 'Items sold',
    description: 'Count of items sold (paid/shipped/delivered) in the period.',
    unit: 'count',
    source: 'SellerAnalytics.itemsSold · SellerPerformanceTrend.itemsSold · SellerHubOverview.businessPulse.orders',
    scope: 'seller',
    periodRequired: true,
  },
  {
    key: 'avgSalePrice',
    label: 'Avg sale',
    description: 'Average price per sold item: total revenue divided by items sold.',
    unit: 'currency',
    source: 'Derived: totalRevenue / itemsSold — SellerPerformanceTrend.averageSalePrice',
    scope: 'seller',
    periodRequired: true,
  },
  {
    key: 'avgOrderValue',
    label: 'Avg order value',
    description: 'Average value per order: revenue divided by order count.',
    unit: 'currency',
    source: 'Derived: heroValue / itemsSold — SellerAnalyticsScreen',
    scope: 'seller',
    periodRequired: true,
  },

  // ── Velocity / time-to-sell ──
  {
    key: 'daysToSell',
    label: 'Days to sell',
    description: 'Median days from listing creation to sold status.',
    unit: 'duration',
    source: 'SellerPerformanceTrend.medianDaysToSell · SoldComparable.daysToSell',
    scope: 'listing',
    periodRequired: false,
  },
  {
    key: 'daysListed',
    label: 'Days listed',
    description: 'Days since the listing was created.',
    unit: 'duration',
    source: 'ListingHealthMetrics.daysListed',
    scope: 'listing',
    periodRequired: false,
  },
  {
    key: 'sellThroughRate',
    label: 'Sell-through rate',
    description: 'Percentage of listed items that sold in the period.',
    unit: 'percent',
    source: 'Derived: itemsSold / activeListings — seller analytics',
    scope: 'seller',
    periodRequired: true,
  },

  // ── Listing health ──
  {
    key: 'healthScore',
    label: 'Health score',
    description: 'Composite score (0–100) derived from engagement, inquiry rate, offer rate, recency and price positioning.',
    unit: 'count',
    source: 'ListingHealthMetrics.healthScore · deriveHealthScore()',
    scope: 'listing',
    periodRequired: false,
  },
  {
    key: 'healthGrade',
    label: 'Health grade',
    description: 'Letter grade (A–D) mapped from the health score.',
    unit: 'count',
    source: 'ListingHealthMetrics.healthGrade · getHealthGrade()',
    scope: 'listing',
    periodRequired: false,
  },

  // ── Top performers ──
  {
    key: 'topPerformersRanking',
    label: 'Top listings',
    description: 'Listings ranked by engagement score within the period.',
    unit: 'count',
    source: 'GET /sellers/:id/analytics/top-performers',
    scope: 'seller',
    periodRequired: true,
  },

  // ── Seller Hub money posture ──
  {
    key: 'availableBalance',
    label: 'Available',
    description: 'Seller payable balance available for withdrawal.',
    unit: 'currency',
    source: 'GET /seller-hub/overview (money.availableGbp) · ledger_entries',
    scope: 'seller',
    periodRequired: false,
  },
  {
    key: 'processingBalance',
    label: 'Processing',
    description: 'Funds from paid/shipped/delivered orders awaiting escrow release.',
    unit: 'currency',
    source: 'GET /seller-hub/overview (money.processingGbp)',
    scope: 'seller',
    periodRequired: false,
  },
  {
    key: 'heldBalance',
    label: 'Held in reserve',
    description: 'Rolling reserve held back from payouts.',
    unit: 'currency',
    source: 'GET /seller-hub/overview (money.heldGbp) · payout_reserve_holds',
    scope: 'seller',
    periodRequired: false,
  },
  {
    key: 'listedValue',
    label: 'Listed value',
    description: 'Sum of asking prices for active listings. Not revenue.',
    unit: 'currency',
    source: 'GET /seller-hub/overview (inventory.listedValueGbp) · listings.price_gbp',
    scope: 'seller',
    periodRequired: false,
  },

  // ── Inventory counts ──
  {
    key: 'activeListings',
    label: 'Active listings',
    description: 'Count of listings currently live and purchasable.',
    unit: 'count',
    source: 'GET /seller-hub/overview (inventory.active) · SellerAnalytics.activeListings',
    scope: 'seller',
    periodRequired: false,
  },
  {
    key: 'draftListings',
    label: 'Draft',
    description: 'Count of listings in draft status.',
    unit: 'count',
    source: 'GET /seller-hub/overview (inventory.drafts)',
    scope: 'seller',
    periodRequired: false,
  },
  {
    key: 'soldListings',
    label: 'Sold',
    description: 'Count of listings marked sold.',
    unit: 'count',
    source: 'GET /seller-hub/overview (inventory.sold)',
    scope: 'seller',
    periodRequired: false,
  },
  {
    key: 'pausedListings',
    label: 'Paused',
    description: 'Count of listings paused by the seller.',
    unit: 'count',
    source: 'GET /seller-hub/overview (inventory.paused)',
    scope: 'seller',
    periodRequired: false,
  },
  {
    key: 'avgActivePrice',
    label: 'Avg active price',
    description: 'Average asking price across active listings.',
    unit: 'currency',
    source: 'MyListings analytics.avgActivePrice · listings.price_gbp',
    scope: 'seller',
    periodRequired: false,
  },
  {
    key: 'totalActiveValue',
    label: 'Active value',
    description: 'Sum of asking prices across active listings.',
    unit: 'currency',
    source: 'MyListings analytics.totalActiveValue · listings.price_gbp',
    scope: 'seller',
    periodRequired: false,
  },

  // ── Rating / trust ──
  {
    key: 'avgRating',
    label: 'Avg rating',
    description: 'Average star rating from seller reviews.',
    unit: 'count',
    source: 'SellerAnalytics.avgRating',
    scope: 'seller',
    periodRequired: false,
  },
  {
    key: 'reviewCount',
    label: 'Reviews',
    description: 'Total number of reviews received.',
    unit: 'count',
    source: 'SellerAnalytics.reviewCount',
    scope: 'seller',
    periodRequired: false,
  },
  {
    key: 'responseRate',
    label: 'Response rate',
    description: 'Percentage of inquiries the seller responded to.',
    unit: 'percent',
    source: 'SellerAnalytics.responseRate',
    scope: 'seller',
    periodRequired: false,
  },
  {
    key: 'positiveRatingPct',
    label: 'Positive rating',
    description: 'Percentage of reviews that are positive.',
    unit: 'percent',
    source: 'SellerAnalytics.positiveRatingPct',
    scope: 'seller',
    periodRequired: false,
  },
];

const dictionaryByKey = new Map<string, MetricDefinition>(
  METRIC_DICTIONARY.map((m) => [m.key, m]),
);

export function getMetricDefinition(key: string): MetricDefinition | undefined {
  return dictionaryByKey.get(key);
}

export function getMetricLabel(key: string): string | undefined {
  return dictionaryByKey.get(key)?.label;
}
