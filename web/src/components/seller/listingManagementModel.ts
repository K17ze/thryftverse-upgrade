/**
 * Listing-management view-model — the row shape the /seller-hub/listings
 * table renders, derived from MY_LISTINGS + MY_DRAFT_LISTINGS + the
 * session import-draft store + MY_LISTING_STATS and the session store's
 * bump timestamps.
 *
 * A bump resurfaces a listing: the persisted bumpedAt wins over createdAt
 * when it's newer, so age and newest-sort stay truthful across reloads
 * even though fixture mutations are session-local.
 */

import type { Listing } from '@/lib/contracts/domain';
import { MY_LISTING_STATS } from '@/lib/data/fixtures';
import { LISTING_BUMP_COOLDOWN_MS } from '@/lib/data/fixtures-commerce';
import { DESCRIPTION_MIN } from '@/components/sell/constants';

export type ListingStatus = 'active' | 'paused' | 'sold' | 'draft';
export type ListingStatusFilter = 'all' | ListingStatus;
export type ListingSortKey = 'newest' | 'views' | 'likes';
export type BulkCommand = 'pause' | 'resume' | 'delete';

export interface ManagedListingRow {
  listing: Listing;
  status: ListingStatus;
  /** True for catalog-import drafts — session-scoped, "Imported" badge. */
  imported: boolean;
  views: number;
  likes: number;
  watchers: number;
  /** max(createdAt, lastBumpAt) — the truth feeds and sorting use. */
  effectiveCreatedAt: string;
}

export function listingStatusOf(listing: Listing): ListingStatus {
  if (listing.isSold || listing.status === 'sold') return 'sold';
  if (listing.status === 'draft') return 'draft';
  // Paused is a real Listing.status — the row keeps its own badge and
  // eligibility rules instead of masquerading as active.
  if (listing.status === 'paused') return 'paused';
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
  importedDrafts: Listing[] = [],
): ManagedListingRow[] {
  // Dedupe: a composer-resumed imported draft can round-trip onto the
  // shelf — the import store is the source of truth for that id.
  const importedIds = new Set(importedDrafts.map((d) => d.id));
  const seen = new Set<string>();
  const merged = [...listings, ...drafts, ...importedDrafts].filter((l) => {
    if (seen.has(l.id)) return false;
    seen.add(l.id);
    return true;
  });
  return merged.map((listing) => {
    const bumpedAt = bumps[listing.id];
    const created = listing.createdAt ?? new Date().toISOString();
    const effective =
      bumpedAt && Date.parse(bumpedAt) > Date.parse(created) ? bumpedAt : created;
    return {
      listing,
      status: listingStatusOf(listing),
      imported: importedIds.has(listing.id),
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

/** Publish floor — the composer's own gate, imported so the shelf's
 *  "Needs: description" check can never drift from what publish demands. */
const DRAFT_DESCRIPTION_MIN = DESCRIPTION_MIN;

/**
 * What a draft is still missing before it can publish — same checks the
 * composer enforces, projected onto the Listing shape the shelf stores.
 * Renders as "Needs: photos, price" on draft rows (mobile parity).
 */
export function draftMissingFields(listing: Listing): string[] {
  const missing: string[] = [];
  if (!listing.images.length) missing.push('photos');
  if (!listing.title?.trim() || listing.title.trim().length < 3) missing.push('title');
  if (!listing.category || listing.category === 'uncategorised') missing.push('category');
  if (!listing.condition) missing.push('condition');
  // Category policy parity — sneakers require a size to publish.
  if (listing.category === 'sneakers' && !listing.size) missing.push('size');
  if ((listing.description ?? '').trim().length < DRAFT_DESCRIPTION_MIN)
    missing.push('description');
  if (!(listing.price > 0)) missing.push('price');
  return missing;
}

/**
 * Discovery-quality gaps on a live listing — mobile surfaces "Missing
 * details" when a live listing lacks the fields buyers filter on
 * (brand / size / condition / category).
 */
export function listingMissingDetails(listing: Listing): string[] {
  const missing: string[] = [];
  if (!listing.brand) missing.push('brand');
  if (!listing.size) missing.push('size');
  if (!listing.condition) missing.push('condition');
  if (!listing.category || listing.category === 'uncategorised') missing.push('category');
  return missing;
}

// ============================================================================
// BULK ACTIONS — multi-select grammar (eBay bulk edit / Poshmark bulk
// reactivate). The batch command returns per-item receipts, so the model
// also owns the truthful reason → copy map the toolbar's toast reads.
// ============================================================================

/** Rows a bulk command can legitimately touch. Anything else is rejected
 *  by the command itself and reported on the receipt, never hidden. */
export function bulkEligible(row: ManagedListingRow, command: BulkCommand): boolean {
  switch (command) {
    case 'pause':
      return row.status === 'active';
    case 'resume':
      return row.status === 'paused';
    case 'delete':
      // The batch endpoint only manages live listings — sold rows carry
      // order history and drafts live in their own stores (the page
      // splits drafts out before the command runs).
      return row.status === 'active' || row.status === 'paused';
  }
}

/** Anything but a sold row can leave the shelf: drafts delete through
 *  their own stores, live/paused listings through the batch command. */
export function bulkDeletable(row: ManagedListingRow): boolean {
  return row.status !== 'sold';
}

/** Rows the 'edit' batch command can touch — live listings only. Drafts
 *  belong to the composer flow; sold rows keep order history. */
export function bulkEditable(row: ManagedListingRow): boolean {
  return row.status === 'active' || row.status === 'paused';
}

/** Batch-command reason codes → seller-facing copy. Unknown codes fall
 *  back to the raw reason rather than a generic shrug. */
export function bulkReasonCopy(reason: string | undefined): string {
  switch (reason) {
    case 'not_found':
      return 'no longer listed';
    case 'already_sold':
      return 'already sold';
    case 'not_active':
      return 'not active';
    case 'not_paused':
      return 'not paused';
    case 'sold_kept_for_order_history':
      return 'sold listings stay for order history';
    case 'conflict':
      return 'changed since you loaded';
    default:
      return reason ?? 'not eligible';
  }
}
