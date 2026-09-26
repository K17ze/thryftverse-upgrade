/**
 * Profile view-model — pure derivations shared by the self and public
 * profile surfaces: member-since formatting, verification-tier badges and
 * board-card route resolution. Mirrors mobile's myProfileViewModels +
 * VerificationBadge/ProfileTrustSignals contracts.
 */

import type { Review, User } from '@/lib/contracts/domain';
import type { AppIconName } from '@/components/ui/Icon';
import { userById } from '@/lib/data/fixtures';
import { USER_MEMBER_SINCE, type ProfileBoard } from './fixtures';

/** "March 2024"-style membership line — mirrors formatMemberSince (mobile). */
export function formatMemberSince(iso: string | undefined | null): string | undefined {
  if (!iso) return undefined;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toLocaleDateString('en-GB', { year: 'numeric', month: 'long' });
}

/** Join-date lookup for a profile — undefined when no record exists. */
export function memberSinceFor(userId: string): string | undefined {
  return formatMemberSince(USER_MEMBER_SINCE[userId]);
}

// ── Verification tiers ──
// Mirrors mobile VERIFICATION_TIERS: email → "Verified", id → "ID Verified",
// seller → "Trusted Seller". The User contract carries trustLevel plus the
// identityVerified/sellerVerified flags; resolve the highest honest tier.
export type ProfileVerificationTier = 'email' | 'id' | 'seller';

export const VERIFICATION_BADGE: Record<
  ProfileVerificationTier,
  { label: string; icon: AppIconName; variant: 'success' | 'brand' }
> = {
  email: { label: 'Verified', icon: 'shieldCheck', variant: 'success' },
  id: { label: 'ID Verified', icon: 'card', variant: 'brand' },
  seller: { label: 'Trusted Seller', icon: 'shieldCheck', variant: 'success' },
};

/** Highest verification tier for a user — null when unverified. */
export function verificationTierFor(user: User): ProfileVerificationTier | null {
  if (user.sellerVerified === true || user.trustLevel === 'seller') return 'seller';
  if (user.identityVerified === true || user.trustLevel === 'identity') return 'id';
  if (user.trustLevel === 'email') return 'email';
  return null;
}

/** Reviewer profile route for a review row — automatic reviews carry no
 *  identity and unknown reviewer ids resolve to undefined (no dead link). */
export function reviewerHref(review: Review): string | undefined {
  if (review.isAutomatic) return undefined;
  if (review.reviewerId === 'me') return '/profile';
  const reviewer = userById(review.reviewerId);
  return reviewer ? `/u/${reviewer.username}` : undefined;
}

/** Route for a profile board — collections vs moodboards resolve on
 *  different detail surfaces. */
export function boardHref(board: ProfileBoard): string {
  return board.kind === 'moodboard' ? `/moodboard/${board.id}` : `/collection/${board.id}`;
}
