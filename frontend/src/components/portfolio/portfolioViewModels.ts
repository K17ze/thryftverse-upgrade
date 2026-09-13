/**
 * Portfolio view models — pure derivations from position/summary data to
 * the section prop shapes. Kept out of the screen so the orchestrator
 * stays lean and the math stays unit-testable.
 */

import type { CoOwnPositionVM } from '../../services/coOwnPortfolio';
import type { SupportedCurrencyCode } from '../../constants/currencies';

/** Matches `useFormattedPrice().formatFromFiat` for the call sites this
 *  feature uses (fiat amount + source currency → display string). */
export type FormatFromFiat = (fiatAmount: number, sourceCurrency?: SupportedCurrencyCode) => string;

export interface AllocationBar {
  id: string;
  ratio: number;
  title: string;
}

export interface IssuerBand {
  id: string;
  label: string;
  band: string;
  ratio: number;
}

export interface ClassBar {
  id: string;
  label: string;
  ratio: number;
}

export interface PortfolioPerformers {
  best: CoOwnPositionVM | null;
  worst: CoOwnPositionVM | null;
}

/** Total cost basis — sum of avgEntryPrice * unitsOwned across all
 *  positions. Used by the performance chart to show cost basis vs
 *  current value. */
export function computeTotalCostBasis(positions: CoOwnPositionVM[]): number {
  return positions.reduce((sum, p) => sum + p.avgEntryPriceGbp * p.unitsOwned, 0);
}

/** Allocation bars — only when real positions exist. */
export function computeAllocationBars(
  positions: CoOwnPositionVM[],
  totalValueGbp: number,
): AllocationBar[] {
  if (positions.length === 0 || totalValueGbp <= 0) return [];
  return positions.map((p) => ({
    id: p.assetId,
    ratio: (p.unitsOwned * p.unitPriceGbp) / totalValueGbp,
    title: p.title,
  }));
}

/**
 * Issuer concentration bands — privacy-safe (spec 06 §1.2).
 * Groups positions by issuer, computes concentration %, rounds to 5%
 * bands. Never names the issuer — shows "Top issuer", "2nd issuer", etc.
 */
export function computeIssuerBands(
  positions: CoOwnPositionVM[],
  totalValueGbp: number,
): IssuerBand[] {
  if (positions.length === 0 || totalValueGbp <= 0) return [];
  const byIssuer = new Map<string, number>();
  for (const p of positions) {
    const value = p.unitsOwned * p.unitPriceGbp;
    byIssuer.set(p.issuerId, (byIssuer.get(p.issuerId) ?? 0) + value);
  }
  const sorted = [...byIssuer.entries()].sort((a, b) => b[1] - a[1]);
  const ORDINALS = ['Top', '2nd', '3rd', '4th', '5th'];
  return sorted.slice(0, 5).map(([, value], i) => {
    const pct = (value / totalValueGbp) * 100;
    const bandLow = Math.floor(pct / 5) * 5;
    const bandHigh = bandLow + 5;
    return {
      id: `issuer-${i}`,
      label: `${ORDINALS[i] ?? `${i + 1}th`} issuer`,
      band: `${bandLow}–${bandHigh}%`,
      ratio: value / totalValueGbp,
    };
  });
}

/** By class allocation — groups positions by asset category (spec 06 §1.2). */
export function computeClassBars(
  positions: CoOwnPositionVM[],
  totalValueGbp: number,
): ClassBar[] {
  if (positions.length === 0 || totalValueGbp <= 0) return [];
  const byClass = new Map<string, number>();
  for (const p of positions) {
    const cls = p.category ?? 'Other';
    const value = p.unitsOwned * p.unitPriceGbp;
    byClass.set(cls, (byClass.get(cls) ?? 0) + value);
  }
  return [...byClass.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([cls, value]) => ({
      id: `class-${cls}`,
      label: cls.charAt(0).toUpperCase() + cls.slice(1),
      ratio: value / totalValueGbp,
    }));
}

/** Best / worst performer — derived from unrealized P&L percentage. */
export function computePerformers(positions: CoOwnPositionVM[]): PortfolioPerformers {
  if (positions.length === 0) return { best: null, worst: null };
  const withPct = positions
    .filter((p) => p.avgEntryPriceGbp > 0)
    .map((p) => ({ p, pct: p.unrealizedPnlGbp / (p.avgEntryPriceGbp * p.unitsOwned) }));
  if (withPct.length === 0) return { best: null, worst: null };
  const sorted = [...withPct].sort((a, b) => b.pct - a.pct);
  return {
    best: sorted[0].pct !== 0 ? sorted[0].p : null,
    worst: sorted[sorted.length - 1].pct !== 0 ? sorted[sorted.length - 1].p : null,
  };
}

/** U39: Format the sale quote age from the saleProceedsAsOf timestamp. */
export function formatQuoteAge(isoTimestamp: string): string {
  const ageMs = Date.now() - new Date(isoTimestamp).getTime();
  if (isNaN(ageMs) || ageMs < 0) return 'unknown';
  const mins = Math.floor(ageMs / 60000);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

export function formatPositionStatus(p: CoOwnPositionVM): 'open' | 'closed' | 'paused' {
  if (!p.isOpen) return 'closed';
  return p.availableUnits > 0 ? 'open' : 'closed';
}
