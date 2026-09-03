/**
 * Listing Health — evidence-backed listing performance metrics.
 *
 * 2026 research: seller decision systems must be authoritative, not
 * vanity metrics. Every metric must be backed by real backend data,
 * never fabricated client-side.
 */

export interface ListingHealthMetrics {
  listingId: string;
  // Engagement
  views: number;
  uniqueViewers: number;
  saves: number;
  shares: number;
  inquiries: number;        // chat conversations started
  offers: number;           // offers received
  // Conversion
  viewToInquiryRate: number;  // inquiries / views
  inquiryToOfferRate: number; // offers / inquiries
  offerToSaleRate: number;    // sales / offers (if sold)
  // Velocity
  daysListed: number;
  daysSinceLastView: number;
  daysSinceLastInquiry: number;
  // Price positioning
  priceVsComparable: 'below' | 'at' | 'above' | 'no-data';
  priceVsComparablePercent: number; // -20 = 20% below, +15 = 15% above
  // Health score (0-100, derived from the above — NOT fabricated)
  healthScore: number;
  healthGrade: 'A' | 'B' | 'C' | 'D';
}

export interface SoldComparable {
  listingId: string;
  title: string;
  soldPrice: number;
  currency: string;
  originalPrice?: number;
  daysToSell: number;
  soldAt: string;        // ISO timestamp
  category: string;
  condition: string;
  // Media count (more photos may correlate with faster sale)
  photoCount: number;
}

export interface PriceExperiment {
  experimentId: string;
  listingId: string;
  originalPrice: number;
  newPrice: number;
  startDate: string;
  endDate?: string;
  // Results (populated after the experiment runs)
  viewsBefore: number;
  viewsAfter: number;
  inquiriesBefore: number;
  inquiriesAfter: number;
  offersBefore: number;
  offersAfter: number;
  sold: boolean;
  soldAt?: number;
  // Conclusion
  outcome?: 'improved' | 'no-change' | 'worsened';
  confidence?: 'high' | 'medium' | 'low';
}

export interface SellerPerformanceTrend {
  period: '7d' | '30d' | '90d' | '1y';
  // Sales velocity
  itemsSold: number;
  totalRevenue: number;
  averageSalePrice: number;
  medianDaysToSell: number;
  // Engagement
  totalViews: number;
  totalInquiries: number;
  totalOffers: number;
  // Operational
  averageResponseTimeHours: number;
  averageShipTimeDays: number;
  disputeRate: number;       // 0-1, only set when backend provides
  repeatBuyerRate: number;   // 0-1
  // Trends (percent change vs previous period)
  revenueTrend: number;       // +10 = 10% increase
  viewsTrend: number;
  inquiryTrend: number;
  conversionTrend: number;
}

export function getHealthGrade(score: number): ListingHealthMetrics['healthGrade'] {
  if (score >= 80) return 'A';
  if (score >= 60) return 'B';
  if (score >= 40) return 'C';
  return 'D';
}

export function getHealthLabel(grade: ListingHealthMetrics['healthGrade']): string {
  switch (grade) {
    case 'A': return 'Strong';
    case 'B': return 'Good';
    case 'C': return 'Needs attention';
    case 'D': return 'Underperforming';
  }
}

/**
 * Derive a listing health score from real metrics.
 * FAIL-CLOSED: if metrics are missing, the score is conservative (low).
 * Never fabricate a high score from missing data.
 */
export function deriveHealthScore(metrics: Partial<ListingHealthMetrics>): number {
  let score = 0;
  let maxScore = 0;

  // Engagement (30 points max)
  if (metrics.views != null && metrics.views > 0) {
    // 10+ views = full engagement score
    score += Math.min(10, metrics.views / 10) * 3;
    maxScore += 30;
  }

  // Inquiry rate (25 points max)
  if (metrics.viewToInquiryRate != null) {
    // 10% inquiry rate = full score
    score += Math.min(1, metrics.viewToInquiryRate / 0.1) * 25;
    maxScore += 25;
  }

  // Offer rate (20 points max)
  if (metrics.inquiryToOfferRate != null) {
    // 30% offer rate = full score
    score += Math.min(1, metrics.inquiryToOfferRate / 0.3) * 20;
    maxScore += 20;
  }

  // Recency (15 points max)
  if (metrics.daysSinceLastView != null) {
    // Viewed in last 3 days = full score
    const recencyScore = Math.max(0, 1 - metrics.daysSinceLastView / 7);
    score += recencyScore * 15;
    maxScore += 15;
  }

  // Price positioning (10 points max)
  if (metrics.priceVsComparable === 'below') {
    score += 10;
    maxScore += 10;
  } else if (metrics.priceVsComparable === 'at') {
    score += 7;
    maxScore += 10;
  } else if (metrics.priceVsComparable === 'above') {
    score += 3;
    maxScore += 10;
  }

  // If we don't have enough data, return a conservative score
  if (maxScore < 50) return Math.round(score);

  return Math.round((score / maxScore) * 100);
}
