/**
 * Listing-management view-model — the row shape the /seller-hub/listings
 * table renders, derived from MY_LISTINGS + MY_DRAFT_LISTINGS +
 * MY_LISTING_STATS and the session store's bump timestamps.
 *
 * A bump resurfaces a listing: the persisted bumpedAt wins over createdAt
 * when it's newer, so age and newest-sort stay truthful across reloads
 * even though fixture mutations are session-local.
 */

import type { Listing } from '@/lib/contracts/domain';
import { MY_LISTING_STATS } from '@/lib/data/fixtures';
import { LISTING_BUMP_COOLDOWN_MS } from '@/lib/data/fixtures-commerce';

export type ListingStatus = 'active' | 'sold' | 'draft';
export type ListingStatusFilter = 'all' | ListingStatus;
export type ListingSortKey = 'newest' | 'views' | 'likes';

export interface ManagedListingRow {
  listing: Listing;
  status: ListingStatus;
  views: number;
  likes: number;
  watchers: number;
  /** max(createdAt, lastBumpAt) — the truth feeds and sorting use. */
  effectiveCreatedAt: string;
}

export function listingStatusOf(listing: Listing): ListingStatus {
  if (listing.isSold || listing.status === 'sold') return 'sold';
  if (listing.status === 'draft') return 'draft';
  return 'active';
}

/** Stats the seller dashboard reports — fixture-backed, zero for fresh listings. */
function statsFor(listing: Listing): { views: number; likes: number; watchers: number } {
  const authored = MY_LISTING_STATS[listing.id];
  return {
    views: authored?.views ?? listing.views ?? 0,
    likes: listing.likes,
    watchers: authored?.watchers ?? 0,
  };
}

export function buildManagedRows(
  listings: Listing[],
  drafts: Listing[],
  bumps: Record<string, string>,
): ManagedListingRow[] {
  return [...listings, ...drafts].map((listing) => {
    const bumpedAt = bumps[listing.id];
    const created = listing.createdAt ?? new Date().toISOString();
    const effective =
      bumpedAt && Date.parse(bumpedAt) > Date.parse(created) ? bumpedAt : created;
    return {
      listing,
      status: listingStatusOf(listing),
      ...statsFor(listing),
      effectiveCreatedAt: effective,
    };
  });
}

export function sortManagedRows(rows: ManagedListingRow[], sort: ListingSortKey): ManagedListingRow[] {
  const list = [...rows];
  switch (sort) {
    case 'views':
      return list.sort((a, b) => b.views - a.views);
    case 'likes':
      return list.sort((a, b) => b.likes - a.likes);
    default:
      return list.sort(
        (a, b) => Date.parse(b.effectiveCreatedAt) - Date.parse(a.effectiveCreatedAt),
      );
  }
}

/**
 * Milliseconds left on the 24h bump cooldown; 0 when a bump is allowed.
 * `bumpedAt` undefined → allowed.
 */
export function bumpCooldownRemaining(bumpedAt: string | undefined, now: number): number {
  if (!bumpedAt) return 0;
  const ends = Date.parse(bumpedAt) + LISTING_BUMP_COOLDOWN_MS;
  return Math.max(0, ends - now);
}

/** "Next bump in 7h" / "Next bump in 23m" — the honest cooldown label. */
export function bumpCooldownLabel(remainingMs: number): string {
  const minutes = Math.ceil(remainingMs / 60_000);
  if (minutes >= 60) return `Next bump in ${Math.ceil(minutes / 60)}h`;
  return `Next bump in ${Math.max(1, minutes)}m`;
}
