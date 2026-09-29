/**
 * Co-Own surface formatting — money in exact 2dp GBP, compact volumes,
 * signed moves. Pure module, safe on the server.
 */

import type {
  AssetLifecycleState,
  CoOwnIssuer,
  CorporateAction,
  CorporateActionStatus,
  Distribution,
  DistributionStatus,
} from '@/lib/contracts/coown';

const GBP2 = new Intl.NumberFormat('en-GB', {
  style: 'currency',
  currency: 'GBP',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** £1,234.50 — never returns empty; null renders as an em dash. */
export function gbp(n: number | null | undefined): string {
  return n == null ? '—' : GBP2.format(n);
}

function trim1(n: number): string {
  return n.toFixed(1).replace(/\.0$/, '');
}

/** £31.3k / £1.2M for volumes; falls back to exact 2dp under £1k. */
export function gbpCompact(n: number | null | undefined): string {
  if (n == null) return '—';
  if (n >= 1_000_000) return `£${trim1(n / 1_000_000)}M`;
  if (n >= 1_000) return `£${trim1(n / 1_000)}k`;
  return GBP2.format(n);
}

/** +£158.20 / −£275.20 / £0.00 (neutral at zero). */
export function signedGbp(n: number): string {
  if (Math.abs(n) < 0.005) return GBP2.format(0);
  return `${n > 0 ? '+' : '−'}${GBP2.format(Math.abs(n))}`;
}

/** +2.4% / −1.2% / — */
export function signedPct(n: number | null | undefined): string {
  if (n == null) return '—';
  if (Math.abs(n) < 0.05) return '0.0%';
  return `${n > 0 ? '+' : '−'}${Math.abs(n).toFixed(1)}%`;
}

/** Units sold as a share of the issue — the ownership progress meter. */
export function pctAllocated(asset: { totalUnits: number; availableUnits: number }): number {
  if (asset.totalUnits <= 0) return 0;
  const sold = asset.totalUnits - asset.availableUnits;
  return Math.max(0, Math.min(100, Math.round((sold / asset.totalUnits) * 100)));
}

export const LIFECYCLE_LABEL: Record<AssetLifecycleState, string> = {
  initialOffering: 'Initial offering',
  secondaryTrading: 'Secondary market',
  tradingPaused: 'Trading paused',
  exitUnderway: 'Exit underway',
};

/** WS2 tier, spelled out. Null tiers fail closed — no label, no badge. */
export function verificationLabel(tier: CoOwnIssuer['verificationTier']): string | null {
  if (!tier) return null;
  if (tier === 'seller') return 'Seller verified';
  if (tier === 'id') return 'ID verified';
  return 'Email verified';
}

// ── Wire-vocabulary labels ────────────────────────────────────────────
// Backend statuses and types pass through verbatim — these helpers map
// the known vocabulary to display text and humanize anything unexpected
// rather than collapsing it into a friendly-but-wrong label.

function humanizeWire(raw: string): string {
  return raw
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Distribution type label — 'revenue_share' is the backend default;
 *  unrecognised wire types humanize from `rawType` instead of being
 *  re-labelled as rental income. */
export function distributionKindLabel(d: Pick<Distribution, 'kind' | 'rawType'>): string {
  switch (d.kind) {
    case 'rental_income':
      return 'Rental income';
    case 'resale_gain':
      return 'Resale gain';
    case 'licensing':
      return 'Licensing';
    case 'revenue_share':
      return 'Revenue share';
    case 'dividend':
      return 'Dividend';
    default:
      return d.rawType ? humanizeWire(d.rawType) : 'Distribution';
  }
}

/** Every status migration 279 permits — 'settled' is the paid-out state. */
export function distributionStatusLabel(status: DistributionStatus): string {
  switch (status) {
    case 'settled':
      return 'Paid';
    case 'scheduled':
      return 'Scheduled';
    case 'pending':
      return 'Pending';
    case 'reversed':
      return 'Reversed';
    case 'reinvested':
      return 'Reinvested';
    case 'reinvest_failed':
      return 'Reinvest failed';
    case 'retained_cash':
      return 'Retained';
    default:
      return humanizeWire(status);
  }
}

export function distributionStatusVariant(
  status: DistributionStatus,
): 'success' | 'warning' | 'danger' | 'neutral' {
  switch (status) {
    case 'settled':
    case 'paid': // legacy label for settled rows — same truth
      return 'success';
    case 'scheduled':
    case 'pending':
      return 'warning';
    case 'reversed':
    case 'reinvest_failed':
      return 'danger';
    default:
      return 'neutral';
  }
}

/** Corporate-action kind label — 'other' humanizes the wire actionType
 *  so a buyback or split never renders as "Sale offer". */
export function corporateActionKindLabel(
  a: Pick<CorporateAction, 'kind' | 'actionType'>,
): string {
  switch (a.kind) {
    case 'sale_vote':
      return 'Sale offer';
    case 'insurance_renewal':
      return 'Insurance renewal';
    case 'authentication':
      return 'Authentication';
    case 'exit':
      return 'Exit vote';
    case 'governance':
      return 'Governance vote';
    case 'buyback':
      return 'Buyback';
    case 'dividend':
      return 'Dividend';
    case 'split':
      return 'Unit split';
    default:
      return a.actionType ? humanizeWire(a.actionType) : 'Corporate action';
  }
}

/** Full backend status vocabulary — 'announced' is the insert default,
 *  'executing'/'completed' track a passed resolution in flight/done. */
export function corporateActionStatusLabel(status: CorporateActionStatus): string {
  switch (status) {
    case 'open':
      return 'Voting open';
    case 'announced':
      return 'Announced';
    case 'passed':
      return 'Passed';
    case 'rejected':
      return 'Rejected';
    case 'executing':
      return 'Executing';
    case 'executed':
      return 'Executed';
    case 'completed':
      return 'Completed';
    case 'cancelled':
      return 'Cancelled';
    default:
      return humanizeWire(status);
  }
}

export function corporateActionStatusVariant(
  status: CorporateActionStatus,
): 'success' | 'warning' | 'neutral' {
  switch (status) {
    case 'open':
      return 'success';
    case 'announced':
    case 'executing':
      return 'warning';
    default:
      return 'neutral';
  }
}

/** AllocationBar palette — quiet, editorial; cycles if there are many positions. */
export const ALLOCATION_COLORS = [
  'var(--coown-up)',
  'var(--antique-gold)',
  'var(--text-muted)',
  'var(--commerce-trust, var(--coown-up))',
];
