/**
 * Co-Own surface formatting — money in exact 2dp GBP, compact volumes,
 * signed moves. Pure module, safe on the server.
 */

import type {
  AssetLifecycleState,
  CoOwnIssuer,
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

/** AllocationBar palette — quiet, editorial; cycles if there are many positions. */
export const ALLOCATION_COLORS = [
  'var(--coown-up)',
  'var(--antique-gold)',
  'var(--text-muted)',
  'var(--commerce-trust, var(--coown-up))',
];
