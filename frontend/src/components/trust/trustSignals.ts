/**
 * Trust Signals — flagship marketplace trust system.
 *
 * 2026 research (August): static "Secure Site" badges are obsolete under
 * AI-content skepticism. Trust signals must be backed by real backend
 * verification data, not cosmetic UI. This module defines the canonical
 * trust-signal vocabulary plus fail-closed derivation from the existing
 * `SellerTrustSummary` / `ListingCommerceContext` contracts.
 *
 * Anti-AI / truthful-UI rules (AGENTS.md §4, §11):
 *  - Every signal is either `verified: true` (backed by backend data) or
 *    `verified: false` (behavioural metric, not a verification claim).
 *  - Derivation never fabricates metrics. Missing data → signal omitted.
 *  - No generic "100% Safe" claims — only factual, backed statements.
 *  - Verification level reflects actual verification status without exposing
 *    sensitive data (privacy-aware UX).
 */
import type { Ionicons } from '@expo/vector-icons';
import type {
  SellerTrustSummary,
  ListingCommerceContext,
  VerificationTier,
} from '../../platform/product/listingDetailContract';

// ───────────────────────────────────────────────────────────────────────────
// Types
// ───────────────────────────────────────────────────────────────────────────

/**
 * Verification ladder. Each rung is strictly stronger than the one below it.
 * Mirrors the backend verification status (ID, email, phone, payment method)
 * without exposing the underlying PII.
 */
export type VerificationLevel = 'unverified' | 'email' | 'phone' | 'identity' | 'enhanced';

export type TrustSignalType =
  | 'verified-seller'
  | 'responsive-seller'
  | 'fast-shipper'
  | 'top-rated'
  | 'secure-payment'
  | 'buyer-protection'
  | 'authenticity-guarantee'
  | 'return-friendly'
  | 'community-standing'
  | 'sale-count'
  | 'response-time'
  | 'dispute-free'
  | 'repeat-buyer'
  | 'early-adopter';

export interface TrustSignal {
  type: TrustSignalType;
  label: string;
  /** Short description shown on tap. */
  description: string;
  /** Whether this signal is backed by backend verification (vs. behavioural metric). */
  verified: boolean;
  /** Optional metric value (e.g. "1,234 sales", "< 2hr response"). */
  metric?: string;
  /** Icon concept resolved through the icon registry. */
  iconConcept: string;
}

export interface SellerTrustProfile {
  verificationLevel: VerificationLevel;
  signals: TrustSignal[];
  /** Total sales count. */
  totalSales: number;
  /** Average response time in hours. */
  averageResponseHours: number;
  /** Dispute rate (0-1). Only set when a real backend field exists. */
  disputeRate?: number;
  /** Whether seller offers returns. */
  offersReturns: boolean;
  /** Whether seller has buyer protection. */
  hasBuyerProtection: boolean;
}

/** Registry: icon concept → Ionicons glyph name. Single source of truth. */
export const TRUST_ICON_REGISTRY: Record<string, keyof typeof Ionicons.glyphMap> = {
  'shield-check': 'shield-checkmark-outline',
  shield: 'shield-outline',
  'checkmark-circle': 'checkmark-circle-outline',
  card: 'card-outline',
  umbrella: 'umbrella-outline',
  ribbon: 'ribbon-outline',
  star: 'star-outline',
  flash: 'flash-outline',
  chatbubble: 'chatbubble-ellipses-outline',
  pricetag: 'pricetag-outline',
  people: 'people-outline',
  'trending-up': 'trending-up-outline',
  repeat: 'repeat-outline',
  cash: 'cash-outline',
};

export type TrustContext = 'listing' | 'profile' | 'checkout';

// ───────────────────────────────────────────────────────────────────────────
// Verification labels
// ───────────────────────────────────────────────────────────────────────────

export function getVerificationLabel(level: VerificationLevel): string {
  switch (level) {
    case 'enhanced':
      return 'Enhanced Verification';
    case 'identity':
      return 'ID Verified';
    case 'phone':
      return 'Phone Verified';
    case 'email':
      return 'Email Verified';
    case 'unverified':
      return 'Unverified';
  }
}

export function getVerificationDescription(level: VerificationLevel): string {
  switch (level) {
    case 'enhanced':
      return 'Identity, payment method, and phone verified by the platform.';
    case 'identity':
      return 'Government-issued ID verified by the platform.';
    case 'phone':
      return 'Phone number verified by the platform.';
    case 'email':
      return 'Email address verified by the platform.';
    case 'unverified':
      return 'This seller has not completed verification.';
  }
}

/** Map the existing backend `VerificationTier` onto the verification ladder. */
export function tierToLevel(tier: VerificationTier | null | undefined): VerificationLevel {
  if (!tier) return 'unverified';
  if (tier === 'seller') return 'enhanced';
  if (tier === 'id') return 'identity';
  return 'email';
}

// ───────────────────────────────────────────────────────────────────────────
// Context filtering
// ───────────────────────────────────────────────────────────────────────────

const LISTING_SIGNALS: ReadonlySet<TrustSignalType> = new Set([
  'verified-seller',
  'responsive-seller',
  'secure-payment',
  'buyer-protection',
]);

const CHECKOUT_SIGNALS: ReadonlySet<TrustSignalType> = new Set([
  'secure-payment',
  'buyer-protection',
  'authenticity-guarantee',
]);

/**
 * In listing context, show only the top 2-3 most impactful signals.
 * In profile context, show all signals.
 * In checkout context, show security and protection signals.
 */
export function shouldShowSignal(
  signal: TrustSignal,
  context: TrustContext,
): boolean {
  if (context === 'listing') return LISTING_SIGNALS.has(signal.type);
  if (context === 'checkout') return CHECKOUT_SIGNALS.has(signal.type);
  return true;
}

// ───────────────────────────────────────────────────────────────────────────
// Fail-closed derivation from existing contracts
// ───────────────────────────────────────────────────────────────────────────

function formatSalesCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k sales`;
  if (n === 1) return '1 sale';
  return `${n} sales`;
}

function formatResponseHours(hours: number): string {
  if (hours <= 0) return 'Same-day response';
  if (hours < 1) return 'Under 1 hr response';
  if (hours < 24) return `Under ${Math.ceil(hours)} hr response`;
  const days = Math.ceil(hours / 24);
  return `Under ${days} day${days > 1 ? 's' : ''} response`;
}

/**
 * Derive a `SellerTrustProfile` from the existing backend contracts.
 *
 * FAIL-CLOSED: every signal is built only from data the backend actually
 * provides. Missing fields → signal omitted. No client-side thresholds
 * masquerade as verification; behavioural signals are marked
 * `verified: false` so the UI can distinguish evidence from metric.
 */
export function deriveSellerTrustProfile(
  seller: SellerTrustSummary | null,
  commerce?: ListingCommerceContext | null,
): SellerTrustProfile {
  const level = seller
    ? tierToLevel(seller.verificationTier ?? (seller.verified ? 'email' : null))
    : 'unverified';

  const signals: TrustSignal[] = [];

  // ── Verification signal (backend-backed) ──
  if (level !== 'unverified') {
    signals.push({
      type: 'verified-seller',
      label: getVerificationLabel(level),
      description: getVerificationDescription(level),
      verified: true,
      iconConcept: level === 'enhanced' ? 'shield-check' : 'checkmark-circle',
    });
  }

  // ── Sale count (social proof — behavioural metric) ──
  const totalSales = seller?.completedSales ?? 0;
  if (totalSales > 0) {
    signals.push({
      type: 'sale-count',
      label: formatSalesCount(totalSales),
      description: 'Completed sales recorded by the platform.',
      verified: false,
      metric: formatSalesCount(totalSales),
      iconConcept: 'pricetag',
    });
  }

  // ── Response time (behavioural metric) ──
  // Prefer a backend-provided label; fall back to a derived hours value only
  // when an explicit numeric source exists. We never parse human-readable
  // labels into a number (per the seller-standards fail-closed precedent).
  const responseLabel = seller?.responseTimeLabel ?? null;
  let averageResponseHours = 0;
  if (responseLabel) {
    signals.push({
      type: 'response-time',
      label: responseLabel,
      description: 'Typical time to reply to buyer messages.',
      verified: false,
      metric: responseLabel,
      iconConcept: 'chatbubble',
    });
  }

  // ── Responsive-seller (derived from response rate) ──
  const responseRate = seller?.responseRate ?? null;
  if (responseRate != null && responseRate >= 0.9) {
    signals.push({
      type: 'responsive-seller',
      label: 'Responsive',
      description: 'Replies to at least 90% of buyer messages.',
      verified: false,
      metric: `${Math.round(responseRate * 100)}% response rate`,
      iconConcept: 'chatbubble',
    });
  }

  // ── Fast shipper (backend dispatch label) ──
  if (seller?.dispatchTimeLabel) {
    signals.push({
      type: 'fast-shipper',
      label: seller.dispatchTimeLabel,
      description: 'Typical dispatch time recorded by the platform.',
      verified: false,
      metric: seller.dispatchTimeLabel,
      iconConcept: 'flash',
    });
  }

  // ── Top-rated (rating + review volume) ──
  const rating = seller?.rating ?? null;
  const reviewCount = seller?.reviewCount ?? null;
  if (rating != null && rating >= 4.5 && reviewCount != null && reviewCount >= 10) {
    signals.push({
      type: 'top-rated',
      label: 'Top rated',
      description: `Holds a ${rating.toFixed(1)} rating across ${reviewCount} reviews.`,
      verified: false,
      metric: `${rating.toFixed(1)} (${reviewCount})`,
      iconConcept: 'star',
    });
  }

  // ── Buyer protection (commerce context) ──
  const hasBuyerProtection = commerce?.protectionPolicy?.available === true;
  if (hasBuyerProtection) {
    signals.push({
      type: 'buyer-protection',
      label: commerce!.protectionPolicy!.label ?? 'Buyer Protection',
      description:
        commerce!.protectionPolicy!.summary ??
        'Eligible orders are covered by the platform buyer protection policy.',
      verified: true,
      iconConcept: 'umbrella',
    });
  }

  // ── Secure payment (behavioural/platform claim, not a per-listing verified fact) ──
  if (commerce && commerce.itemPrice != null) {
    signals.push({
      type: 'secure-payment',
      label: 'Secure payment',
      description:
        'Payments are processed through the platform’s encrypted checkout.',
      verified: false,
      iconConcept: 'shield-check',
    });
  }

  // ── Authenticity guarantee (commerce context) ──
  const authenticity = commerce?.authenticity ?? null;
  if (authenticity && (authenticity.status === 'eligible' || authenticity.status === 'verified')) {
    signals.push({
      type: 'authenticity-guarantee',
      label: authenticity.label ?? 'Authenticity Guarantee',
      description:
        authenticity.status === 'verified'
          ? 'Item verified by the platform authenticity programme.'
          : 'Eligible for the platform authenticity verification programme.',
      verified: authenticity.status === 'verified',
      iconConcept: 'ribbon',
    });
  }

  // ── Return-friendly (commerce context) ──
  const returnPolicy = commerce?.returnPolicy ?? null;
  const offersReturns = returnPolicy?.accepted === true;
  if (offersReturns) {
    const window = returnPolicy?.windowDays;
    signals.push({
      type: 'return-friendly',
      label: window ? `${window}-day returns` : 'Returns accepted',
      description: returnPolicy?.conditions ?? 'Seller accepts returns per policy.',
      verified: false,
      iconConcept: 'repeat',
    });
  }

  return {
    verificationLevel: level,
    signals,
    totalSales,
    averageResponseHours,
    offersReturns,
    hasBuyerProtection,
  };
}

/** Pick the most impactful N signals for a given context (stable ordering). */
export function selectSignals(
  signals: TrustSignal[],
  context: TrustContext,
  max?: number,
): TrustSignal[] {
  const filtered = signals.filter((s) => shouldShowSignal(s, context));
  if (context === 'listing') {
    // Stable priority order for the listing first viewport.
    const priority: TrustSignalType[] = [
      'verified-seller',
      'responsive-seller',
      'buyer-protection',
      'secure-payment',
      'top-rated',
      'fast-shipper',
    ];
    const ordered = [...filtered].sort(
      (a, b) => priority.indexOf(a.type) - priority.indexOf(b.type),
    );
    return ordered.slice(0, max ?? 3);
  }
  if (context === 'checkout') {
    const priority: TrustSignalType[] = [
      'secure-payment',
      'buyer-protection',
      'authenticity-guarantee',
    ];
    const ordered = [...filtered].sort(
      (a, b) => priority.indexOf(a.type) - priority.indexOf(b.type),
    );
    return ordered.slice(0, max ?? ordered.length);
  }
  return max ? signals.slice(0, max) : signals;
}
