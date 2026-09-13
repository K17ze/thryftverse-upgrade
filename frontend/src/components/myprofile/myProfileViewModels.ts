// Pure view-model derivations for the owner-profile (MyProfile) surface —
// the domain counterpart to components/seller/hubViewModels.ts. No React,
// no side effects: formatting, ordering and completion maths only.

import type { Listing } from '../../domain';
import type { ShopRailItem } from '../profile/ShopRail';
import type { CompletionFocus } from '../../hooks/myprofile/types';

/**
 * Compact number formatting for social/stats counters.
 *   999        → "999"
 *   1200       → "1.2K"
 *   12500      → "12.5K"
 *   125000     → "125K"
 *   1250000    → "1.2M"
 *   12500000   → "12M"
 */
export function formatCompact(n: number): string {
  if (n < 1000) return String(n);
  if (n < 100000) {
    const v = (n / 1000).toFixed(1).replace(/\.0$/, '');
    return `${v}K`;
  }
  if (n < 1000000) {
    return `${Math.round(n / 1000)}K`;
  }
  if (n < 10000000) {
    const v = (n / 1000000).toFixed(1).replace(/\.0$/, '');
    return `${v}M`;
  }
  return `${Math.round(n / 1000000)}M`;
}

/**
 * Owned listings in grid order. Pinned/featured listings appear first in the
 * Shop grid (2026 pattern). When an override order is active (reorder mode),
 * sort by the override rank; otherwise fall back to the backend `featured`
 * flag with a stable sort that preserves backend ordering for non-featured
 * items.
 */
export function orderOwnedListings(
  listings: Listing[],
  profileUserId: string | null,
  overrideFeaturedIds: string[] | null,
): Listing[] {
  if (!profileUserId) return [];
  return listings
    .filter((item) => item.sellerId === profileUserId)
    .sort((a, b) => {
      if (overrideFeaturedIds) {
        const ai = overrideFeaturedIds.indexOf(a.id);
        const bi = overrideFeaturedIds.indexOf(b.id);
        const ar = ai === -1 ? Number.MAX_SAFE_INTEGER : ai;
        const br = bi === -1 ? Number.MAX_SAFE_INTEGER : bi;
        return ar - br;
      }
      const af = a.featured === true ? 0 : 1;
      const bf = b.featured === true ? 0 : 1;
      return af - bf;
    });
}

/**
 * Curated shop window — featured listings projected to ShopRail items. The
 * rail renders only when featured items exist (ShopRail returns null for
 * empty input), keeping the first viewport truthful.
 */
export function toShopRailItems(
  listings: Listing[],
  isItemFeatured: (id: string, defaultFeatured: boolean | null | undefined) => boolean,
): ShopRailItem[] {
  return listings
    .filter((item) => isItemFeatured(item.id, item.featured))
    .slice(0, 10)
    .map((item) => ({
      id: item.id,
      title: item.title,
      price: item.price,
      imageUri: item.images?.[0] ?? '',
      brand: item.brand ?? null,
      isSold: item.isSold,
      isPinned: true,
    }));
}

export interface ProfileCompletionResult {
  percent: number;
  done: number;
  total: number;
}

/**
 * Profile completion — drives the progress prompt. Completion measures ONLY
 * identity fields the user can complete directly: display name, bio, profile
 * photo and cover. Audience growth (followers) and first listing are NOT
 * profile-completion requirements.
 */
export function computeProfileCompletion(input: {
  displayName: string | null | undefined;
  bio: string | null | undefined;
  hasAvatar: boolean;
  hasCover: boolean;
}): ProfileCompletionResult {
  const checks = [
    Boolean(input.displayName?.trim()),
    Boolean(input.bio?.trim()),
    input.hasAvatar,
    input.hasCover,
  ];
  const done = checks.filter(Boolean).length;
  return { percent: Math.round((done / checks.length) * 100), done, total: checks.length };
}

export interface CompletionCtaResult {
  label: string;
  focus?: CompletionFocus;
}

type CompletionCtaKey =
  | 'completionCta.addName'
  | 'completionCta.addBio'
  | 'completionCta.addPhoto'
  | 'completionCta.addCover'
  | 'completionCta.editProfile';

/**
 * First missing identity facet → the CTA label key + EditProfile focus. Every
 * completion CTA routes to EditProfile because every remaining gap is a
 * direct profile field.
 */
export function resolveCompletionCtaKey(input: {
  displayName: string | null | undefined;
  bio: string | null | undefined;
  hasAvatar: boolean;
  hasCover: boolean;
}): { labelKey: CompletionCtaKey; focus?: CompletionFocus } {
  if (!input.displayName?.trim()) return { labelKey: 'completionCta.addName' };
  if (!input.bio?.trim()) return { labelKey: 'completionCta.addBio' };
  if (!input.hasAvatar) return { labelKey: 'completionCta.addPhoto', focus: 'avatar' };
  if (!input.hasCover) return { labelKey: 'completionCta.addCover', focus: 'cover' };
  return { labelKey: 'completionCta.editProfile' };
}

/** "March 2024"-style membership line for the identity hero and passport. */
export function formatMemberSince(createdAt: string | undefined | null): string | undefined {
  return createdAt
    ? new Date(createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long' })
    : undefined;
}
