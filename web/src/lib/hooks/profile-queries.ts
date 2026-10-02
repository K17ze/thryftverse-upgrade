'use client';

/**
 * Public profile aggregate — the viewer-scoped /users/:id/profile payload
 * (mobile UserProfileScreen): viewer relations (block/mute/restrict), the
 * seller's away state, the DSA trader disclosure and the storefront extras
 * the plain User row doesn't carry.
 *
 * This is enrichment for /u/[username], not a second loading gate — the
 * page renders on the base user query and layers these fields in as they
 * land; every surface self-omits when its field is null.
 *
 * Fixture mode derives the same shape from the bundled members plus the
 * local moderation stores so the states are still demoable: block truth
 * lives in the same store pair the options menu writes, while mute and
 * restrict (which have no persisted fixture store) use a session overlay.
 */

import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { DATA_MODE } from '@/lib/api/client';
import { fetchJson } from '@/lib/api/http';
import type { User } from '@/lib/contracts/domain';
import {
  fetchSellerListings,
  type ListingPage,
} from '@/lib/api/services/listings';
import {
  fetchUserProfileAggregate,
  type PublicProfile,
} from '@/lib/api/services/users';
import { listingsBySeller, userById, USERS } from '@/lib/data/fixtures';
import { useSession } from '@/lib/session/SessionProvider';
import { useInboxSafety } from '@/components/inbox/inboxSafety';
import { useSettingsPrefs } from '@/lib/store/settingsPrefs';

const tick = (ms = 120) => new Promise((r) => setTimeout(r, ms));

/** Query key — moderation mutations invalidate the
 *  ['profile-aggregate', userId] prefix to re-read viewer truth. */
export function profileAggregateQueryKey(userId: string) {
  return ['profile-aggregate', userId] as const;
}

/** Root prefix — invalidates every aggregate entry (id-keyed AND
 *  username-keyed). Only one profile is on screen at a time, so the
 *  broad prefix is the correct mutation target. */
export const PROFILE_AGGREGATE_ROOT = ['profile-aggregate'] as const;

// Fixture moderation overlay — mute/restrict have no persisted store, so
// fixture flips land here and the aggregate derivation reads them back.
const fixtureMutedIds = new Set<string>();
const fixtureRestrictedIds = new Set<string>();

/** Fixture-mode write-back for mute/restrict — a no-op semantic in live
 *  mode, where the server write + invalidation is the truth path. */
export function applyFixtureModeration(
  userId: string,
  patch: { isMuted?: boolean; isRestricted?: boolean },
): void {
  if (patch.isMuted !== undefined) {
    if (patch.isMuted) fixtureMutedIds.add(userId);
    else fixtureMutedIds.delete(userId);
  }
  if (patch.isRestricted !== undefined) {
    if (patch.isRestricted) fixtureRestrictedIds.add(userId);
    else fixtureRestrictedIds.delete(userId);
  }
}

/** Fixture aggregate derivation — shared by the id- and username-keyed
 *  queries. Block truth is the same store pair ProfileOptionsMenu writes —
 *  the unblock state must agree with the menu's row label. Persisted
 *  localStorage stores hydrate synchronously at create(), so a post-mount
 *  queryFn read is already accurate. */
function fixtureAggregate(user: User, meId: string | undefined): PublicProfile {
  const blocked =
    useInboxSafety.getState().blockedUserIds.includes(user.id) ||
    useSettingsPrefs.getState().blockedIds.includes(user.id);
  // The bundled listingCount is a display prop that outruns the actual
  // fixture closet (u5 claims 67 on 6 rows). The live contract's
  // activeListingCount/soldListingCount semantics apply here too: the
  // profile may only claim what the closet can actually show.
  const closet = listingsBySeller(user.id);
  const soldListingCount = closet.filter((l) => l.isSold).length;
  return {
    user: { ...user, listingCount: closet.length - soldListingCount },
    isSelf: meId === user.id || user.id === 'me',
    isFollowing: false,
    canMessage: !blocked,
    isBlocked: blocked,
    isMuted: fixtureMutedIds.has(user.id),
    isRestricted: fixtureRestrictedIds.has(user.id),
    canViewSocialContent: true,
    canViewShop: true,
    soldListingCount,
    trader: null,
    away: null,
    storefront: null,
  };
}

/**
 * The resolved member's profile aggregate. Keyed on the user id the base
 * `useUserByUsername` query already resolved — no second by-username
 * lookup, and the query stays disabled until an id exists.
 */
export function usePublicProfile(userId: string | null | undefined) {
  const { user: me } = useSession();
  return useQuery<PublicProfile | null>({
    queryKey: [...profileAggregateQueryKey(userId ?? ''), DATA_MODE],
    enabled: Boolean(userId),
    queryFn: async ({ signal }): Promise<PublicProfile | null> => {
      if (DATA_MODE === 'live') {
        return fetchUserProfileAggregate(userId as string, signal);
      }
      await tick();
      const user = userById(userId as string);
      return user ? fixtureAggregate(user, me?.id) : null;
    },
  });
}

/**
 * /u/[username]'s single read — resolves the handle to an id, then the
 * aggregate. The page used to chain useUserByUsername (which already
 * fetched /users/:id/profile) + usePublicProfile — two identical profile
 * fetches per visit. This composes the chain once: by-username →
 * profile, and the User surfaces read `aggregate.user`.
 */
export function usePublicProfileByUsername(username: string | null | undefined) {
  const { user: me } = useSession();
  return useQuery<PublicProfile | null>({
    queryKey: ['profile-aggregate', 'by-username', username ?? '', DATA_MODE],
    enabled: Boolean(username),
    queryFn: async ({ signal }): Promise<PublicProfile | null> => {
      if (DATA_MODE === 'live') {
        const idPayload = await fetchJson<{
          ok: boolean;
          user?: { id?: string };
        }>(`/users/by-username/${encodeURIComponent(username as string)}`, undefined, { signal });
        const id = idPayload.user?.id;
        if (!idPayload.ok || !id) return null;
        return fetchUserProfileAggregate(id, signal);
      }
      await tick();
      const user = USERS.find((u) => u.username === username);
      return user ? fixtureAggregate(user, me?.id) : null;
    },
  });
}

// ============================================================================
// SELLER CLOSET PAGES — /u/[username] reads the public closet through a
// cursor walk, not the one-shot first page.
// ============================================================================

/** Page size for the paged closet — bounded first render, then appends. */
const SELLER_PAGE_SIZE = 24;

/**
 * One closet page. Live mode calls GET /users/:id/listings directly —
 * the route paginates by keyset cursor ({ts,id} → nextCursor), which the
 * flat `data.sellerListings` array discards. Fixture mode has no cursor:
 * the resolved closet is bounded, so it's sliced into the same page
 * shape — the load-more path stays exercisable and the initial render
 * stays bounded either way.
 */
async function fetchSellerClosetPage(
  sellerId: string,
  cursor: string | undefined,
  signal?: AbortSignal,
): Promise<ListingPage> {
  if (DATA_MODE === 'live') {
    return fetchSellerListings(
      sellerId,
      { cursor, limit: SELLER_PAGE_SIZE },
      signal,
    );
  }
  await tick();
  const all = listingsBySeller(sellerId);
  const start = cursor ? Number.parseInt(cursor, 10) || 0 : 0;
  const end = Math.min(start + SELLER_PAGE_SIZE, all.length);
  return {
    items: all.slice(start, end),
    nextCursor: end < all.length ? String(end) : null,
  };
}

/**
 * The seller's public closet, paged. `select` flattens pages to a plain
 * `Listing[]` so consumers keep the array contract `useSellerListings`
 * established (for-sale/sold split, mosaic pool and counts all keep
 * loaded-set semantics) while `hasNextPage`/`fetchNextPage` walk the
 * server's cursor past the old first-page ceiling.
 */
export function useSellerListingsPaged(sellerId: string) {
  return useInfiniteQuery({
    queryKey: ['seller-listings', 'paged', sellerId, DATA_MODE],
    queryFn: ({ pageParam, signal }) =>
      fetchSellerClosetPage(sellerId, pageParam, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: !!sellerId,
    select: (d) => d.pages.flatMap((p) => p.items),
  });
}
