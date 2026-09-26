/**
 * Syndicate contracts — group-buy pools for shared ownership targets.
 * Ported from the mobile Syndicate* screens' domain: a named pool of
 * members commits funds toward buying units of one Co-Own asset. When
 * the pool covers the target, the buy executes and each member owns a
 * pro-rata share — contribution over the pool target.
 *
 * Monetary values are GBP numbers at this layer (fixtures), matching the
 * co-own contract's posture: the wire format parses once at the data
 * boundary.
 */

import type { CoOwnAsset } from './coown';

// ── Pool ──────────────────────────────────────────────────────────────

/** Stored lifecycle. 'funded' is derived, never stored — a pool becomes
 * funded the moment contributions cover the target. */
export type SyndicateStatus = 'open' | 'executed' | 'dissolved';

/** Render lifecycle — what a member actually sees. */
export type SyndicatePhase = 'open' | 'funded' | 'executed' | 'dissolved';

export interface SyndicateMember {
  id: string;
  userId: string;
  username: string;
  displayName: string | null;
  avatar: string | null;
  role: 'organizer' | 'member';
  /** Total committed to the pool — top-ups fold into this. */
  contributionGbp: number;
  joinedAt: string;
}

/** One line in the pool's order history — contributions, executions,
 * refunds and milestones, newest rendered first. */
export interface SyndicateExecution {
  id: string;
  kind: 'contribution' | 'purchase' | 'refund' | 'note';
  actorUsername: string | null;
  amountGbp: number | null;
  units: number | null;
  note: string | null;
  at: string;
}

export interface Syndicate {
  id: string;
  name: string;
  /** The shared ownership target — one Co-Own asset. */
  assetId: string;
  organizerId: string;
  organizerUsername: string;
  /** Hard cap on distinct members. Top-ups by existing members are not
   * capped by this — it gates joining, not funding. */
  memberCap: number;
  /** Units of the asset the pool buys when funded. */
  unitsTarget: number;
  /** Per-member contribution bounds — cumulative per member. */
  minContributionGbp: number;
  maxContributionGbp: number;
  termsNote: string | null;
  status: SyndicateStatus;
  members: SyndicateMember[];
  executions: SyndicateExecution[];
  createdAt: string;
}

/** Creation bounds — kept narrow so pools stay group buys, not solo
 * listings or unconstrained crowds. */
export const SYNDICATE_LIMITS = {
  memberCapMin: 2,
  memberCapMax: 20,
  nameMaxLength: 48,
  termsMaxLength: 240,
} as const;

// ── Pool math ─────────────────────────────────────────────────────────

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** The buy the pool is raising toward — units × unit price. */
export function targetTotalGbp(s: Syndicate, asset: CoOwnAsset): number {
  return round2(s.unitsTarget * asset.unitPriceGbp);
}

/** Sum of member commitments. */
export function pooledGbp(s: Syndicate): number {
  return round2(s.members.reduce((sum, m) => sum + m.contributionGbp, 0));
}

/** Funding gap before the buy can execute. */
export function remainingGbp(s: Syndicate, asset: CoOwnAsset): number {
  return Math.max(0, round2(targetTotalGbp(s, asset) - pooledGbp(s)));
}

/** Progress toward the pooled target — 0–100, clamped. */
export function poolProgressPct(s: Syndicate, asset: CoOwnAsset): number {
  const target = targetTotalGbp(s, asset);
  if (target <= 0) return 0;
  return Math.min(100, Math.round((pooledGbp(s) / target) * 100));
}

export function syndicatePhase(s: Syndicate, asset: CoOwnAsset): SyndicatePhase {
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
export function sharePctOfPool(contributionGbp: number, s: Syndicate, asset: CoOwnAsset): number {
  const target = targetTotalGbp(s, asset);
  return target > 0 ? (contributionGbp / target) * 100 : 0;
}

/** Pro-rata units a contribution buys at the unit price. */
export function unitsForContribution(contributionGbp: number, asset: CoOwnAsset): number {
  return asset.unitPriceGbp > 0 ? contributionGbp / asset.unitPriceGbp : 0;
}

// ── Contribution validation ───────────────────────────────────────────

export type ContributionIssue =
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

/**
 * Validate a contribution against the pool's rules. Checks run in the
 * order a member would hit them: is the pool even open, can this person
 * join, is the amount inside the band, does it overshoot the target.
 */
export function checkContribution(
  s: Syndicate,
  asset: CoOwnAsset,
  userId: string,
  amountGbp: number,
): ContributionIssue | null {
  if (syndicatePhase(s, asset) !== 'open') return 'pool_closed';
  const existing = memberByUserId(s, userId);
  if (!existing && isMemberCapReached(s)) return 'member_cap';
  if (!Number.isFinite(amountGbp) || amountGbp < s.minContributionGbp) return 'below_min';
  if ((existing?.contributionGbp ?? 0) + amountGbp > s.maxContributionGbp + 0.005) return 'above_max';
  if (amountGbp > remainingGbp(s, asset) + 0.005) return 'over_remaining';
  return null;
}
