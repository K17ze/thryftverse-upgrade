/**
 * Syndicate pool math — port of the web syndicate contract's pure layer
 * (web/src/lib/contracts/syndicate.ts). A pool becomes funded the moment
 * contributions cover the target; 'funded' is derived, never stored.
 * All money is GBP numbers rounded to 2dp at the boundary.
 */

import type { MarketCoOwnAsset, Syndicate, SyndicateMember } from '../../../services/marketApi';

/** Render lifecycle — what a member actually sees. */
export type SyndicatePhase = 'open' | 'funded' | 'executed' | 'dissolved';

export type SyndicateContributionIssue =
  /** Pool isn't accepting funds — funded, executed or dissolved. */
  | 'pool_closed'
  /** Member cap reached and the viewer isn't already a member. */
  | 'member_cap'
  /** Below the per-member minimum. */
  | 'below_min'
  /** Would push this member past the per-member maximum (cumulative). */
  | 'above_max'
  /** More than the pool still needs to reach the target. */
  | 'over_remaining';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** The buy the pool is raising toward — units × unit price. */
export function targetTotalGbp(s: Syndicate, asset: Pick<MarketCoOwnAsset, 'unitPriceGbp'>): number {
  return round2(s.unitsTarget * asset.unitPriceGbp);
}

/** Sum of member commitments. */
export function pooledGbp(s: Syndicate): number {
  return round2(s.members.reduce((sum, m) => sum + m.contributionGbp, 0));
}

/** Funding gap before the buy can execute. */
export function remainingGbp(s: Syndicate, asset: Pick<MarketCoOwnAsset, 'unitPriceGbp'>): number {
  return Math.max(0, round2(targetTotalGbp(s, asset) - pooledGbp(s)));
}

/** Progress toward the pooled target — 0–100, clamped. */
export function poolProgressPct(s: Syndicate, asset: Pick<MarketCoOwnAsset, 'unitPriceGbp'>): number {
  const target = targetTotalGbp(s, asset);
  if (target <= 0) return 0;
  return Math.min(100, Math.round((pooledGbp(s) / target) * 100));
}

export function syndicatePhase(s: Syndicate, asset: Pick<MarketCoOwnAsset, 'unitPriceGbp'>): SyndicatePhase {
  if (s.status === 'executed') return 'executed';
  if (s.status === 'dissolved') return 'dissolved';
  return remainingGbp(s, asset) <= 0.005 ? 'funded' : 'open';
}

/** The cap gates joining — existing members can still top up. */
export function isMemberCapReached(s: Syndicate): boolean {
  return s.members.length >= s.memberCap;
}

export function memberByUserId(s: Syndicate, userId: string): SyndicateMember | undefined {
  return s.members.find((m) => m.userId === userId);
}

/** A member's share of the pooled buy — contribution over the pool
 * target, not over the amount raised so far. */
export function sharePctOfPool(
  contributionGbp: number,
  s: Syndicate,
  asset: Pick<MarketCoOwnAsset, 'unitPriceGbp'>,
): number {
  const target = targetTotalGbp(s, asset);
  return target > 0 ? (contributionGbp / target) * 100 : 0;
}

/** Pro-rata units a contribution buys at the unit price. */
export function unitsForContribution(
  contributionGbp: number,
  asset: Pick<MarketCoOwnAsset, 'unitPriceGbp'>,
): number {
  return asset.unitPriceGbp > 0 ? contributionGbp / asset.unitPriceGbp : 0;
}

/**
 * Validate a contribution against the pool's rules. Checks run in the
 * order a member would hit them: is the pool even open, can this person
 * join, is the amount inside the band, does it overshoot the target.
 */
export function checkContribution(
  s: Syndicate,
  asset: Pick<MarketCoOwnAsset, 'unitPriceGbp'>,
  userId: string,
  amountGbp: number,
): SyndicateContributionIssue | null {
  if (syndicatePhase(s, asset) !== 'open') return 'pool_closed';
  const existing = memberByUserId(s, userId);
  if (!existing && isMemberCapReached(s)) return 'member_cap';
  if (!Number.isFinite(amountGbp) || amountGbp < s.minContributionGbp) return 'below_min';
  if ((existing?.contributionGbp ?? 0) + amountGbp > s.maxContributionGbp + 0.005) return 'above_max';
  if (amountGbp > remainingGbp(s, asset) + 0.005) return 'over_remaining';
  return null;
}
