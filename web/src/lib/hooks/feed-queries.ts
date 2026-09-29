'use client';

/**
 * Feed query hooks — the home-feed read path and the feed-control writes.
 *
 * Serve contract (mirrors mobile useForYouFeed / feedApi):
 *  - live + signed-in: `GET /recommendations/:userId` — the server-ranked
 *    for-you serve; each item carries score/policy/position/reasonCodes/
 *    componentScores which surface in "Why am I seeing this?" and join
 *    feedback writes back to the serve via requestId.
 *  - live + guest / fixture: `data.feed()` — `/feed/home` (keyset-paginated
 *    in live; single authored page in fixture) rendered as-is.
 *
 * Pagination uses `useInfiniteQuery` — `nextCursor` from `/feed/home`
 * pages forward; the recommendations serve is a single page (no cursor in
 * the backend contract), so `hasNextPage` simply stays false there.
 */

import {
  useInfiniteQuery,
  useQuery,
  type InfiniteData,
} from '@tanstack/react-query';
import { useCallback, useRef } from 'react';
import { data, DATA_MODE } from '@/lib/api/client';
import * as feedService from '@/lib/api/services/feed';
import * as recommendations from '@/lib/api/services/recommendations';
import type {
  DiscoveryFeedUnit,
  DiscoveryListingSummary,
} from '@/lib/contracts/domain';
import { useSession } from '@/lib/session/SessionProvider';
import { useFeedPrefs } from '@/lib/feedPrefs';

/** Where the currently rendered feed order came from — honesty-critical. */
export type FeedSource =
  | 'recommendations' // server-ranked personalised serve
  | 'feed' // live baseline feed (/feed/home), recency-ordered
  | 'fixture'; // bundled sample catalogue

/** Per-item serve metadata for a server-ranked item — the attribution the
 *  explanation sheet and feedback writes need. */
export interface ServeItemMeta {
  score: number;
  model: string;
  policy: 'exploit' | 'explore';
  position: number;
  reasonCodes: string[];
  componentScores: Record<string, number>;
}

export interface HomeFeedPage {
  units: DiscoveryFeedUnit[];
  nextCursor: string | null;
  source: FeedSource;
  requestId: string | null;
  serveMode: recommendations.ServeMode | null;
  policyVersion: string | null;
  trainedModel: boolean;
  metaByListing: Record<string, ServeItemMeta>;
}

function makeSessionId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID().replace(/-/g, '').slice(0, 16);
  }
  return `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

export function useHomeFeed() {
  const { user } = useSession();
  const userId = user?.id ?? null;
  const sessionIdRef = useRef<string | null>(null);
  if (sessionIdRef.current === null) sessionIdRef.current = makeSessionId();

  return useInfiniteQuery<
    HomeFeedPage,
    Error,
    InfiniteData<HomeFeedPage>,
    (string | null)[],
    string | null
  >({
    queryKey: ['home-feed', DATA_MODE, userId ?? 'guest'],
    initialPageParam: null,
    queryFn: async ({ pageParam, signal }): Promise<HomeFeedPage> => {
      if (DATA_MODE === 'live' && userId) {
        const page = await recommendations.fetchForYouRecommendations(userId, {
          surface: 'home_feed',
          sessionId: sessionIdRef.current ?? undefined,
          signal,
        });
        const metaByListing: Record<string, ServeItemMeta> = {};
        const units: DiscoveryFeedUnit[] = page.items.map((item) => {
          metaByListing[item.listing.id] = {
            score: item.score,
            model: item.model,
            policy: item.policy,
            position: item.position,
            reasonCodes: item.reasonCodes,
            componentScores: item.componentScores,
          };
          return {
            type: 'listing' as const,
            id: `listing-${item.listing.id}`,
            listing: item.listing,
          };
        });
        return {
          units,
          nextCursor: null, // the serve contract has no cursor — one page
          source: 'recommendations',
          requestId: page.requestId,
          serveMode: page.serveMode,
          policyVersion: page.policyVersion,
          trainedModel: page.trainedModel,
          metaByListing,
        };
      }

      const page = await data.feed(pageParam ?? undefined, signal);
      return {
        units: page.units,
        nextCursor: page.nextCursor,
        source: DATA_MODE === 'live' ? 'feed' : 'fixture',
        requestId: null,
        serveMode: null,
        policyVersion: null,
        trainedModel: false,
        metaByListing: {},
      };
    },
    getNextPageParam: (last) => last.nextCursor,
  });
}

/**
 * Following feed — the authoritative live source: GET
 * /feed/following/listings returns followed sellers' active listings in
 * one joined query (native semantic: per-seller inventory fetch, merged
 * newest-first). Disabled unless live + signed in — the caller keeps the
 * local-follows fixture path for guest/fixture sessions. `staleTime` is
 * 0 so a follow/unfollow mutation is reflected on the next mount.
 */
export function useFollowingFeed(enabled: boolean) {
  const { user } = useSession();
  const userId = user?.id ?? null;
  return useInfiniteQuery({
    queryKey: ['following-feed', DATA_MODE, userId ?? 'guest'],
    enabled: enabled && DATA_MODE === 'live' && userId !== null,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) =>
      feedService.fetchFollowingListings(signal, { cursor: pageParam, limit: 24 }),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

/**
 * Explore feed — the browse surface's read of the same feed contract as
 * the home fallback (`data.feed` → `/feed/home` in live, the authored
 * fixture page otherwise). Unlike `useFeed` — the single-page query the
 * other surfaces share — this threads `nextCursor` through
 * `useInfiniteQuery` so the Explore masonry actually paginates. Fixture
 * mode serves its one authored page and reports no cursor, so the tail
 * marker is honest in both modes.
 */
export function useExploreFeed() {
  return useInfiniteQuery({
    queryKey: ['explore-feed', DATA_MODE],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) => data.feed(pageParam, signal),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

/**
 * Feed-control writes — "Not interested" / "Show less like this" / undo.
 * The local preference store updates immediately so the feed reflects the
 * choice; the durable backend write reports `persisted`/`failure` honestly
 * so the UI can say exactly what happened (same semantics as mobile).
 */
export function useFeedActions() {
  const { user } = useSession();
  const userId = user?.id ?? null;
  const hideListing = useFeedPrefs((s) => s.hideListing);
  const unhideListing = useFeedPrefs((s) => s.unhideListing);
  const downweightKey = useFeedPrefs((s) => s.downweightKey);
  const unDownweightKey = useFeedPrefs((s) => s.unDownweightKey);

  const notInterested = useCallback(
    async (
      listing: DiscoveryListingSummary,
      attribution?: recommendations.FeedbackAttribution,
      reason?: string,
    ): Promise<recommendations.FeedControlResult> => {
      hideListing(listing.id);
      if (DATA_MODE !== 'live') {
        return { persisted: false, failure: 'fixture_mode' };
      }
      // The follow-up reason rides the interaction's metadata; a style
      // reason additionally writes a facet `less` mutation server-side.
      return recommendations.markItemNotInterested(userId, listing, attribution, reason);
    },
    [userId, hideListing],
  );

  const showFewer = useCallback(
    async (
      listing: DiscoveryListingSummary,
      attribution?: recommendations.FeedbackAttribution,
    ): Promise<recommendations.FeedControlResult> => {
      // Local facet penalty (category → brand) — applies to the local
      // ranking layer immediately even while the server write is in flight.
      const key = listing.category?.trim() || listing.brand?.trim() || '';
      if (key) downweightKey(key);
      if (DATA_MODE !== 'live') {
        return { persisted: false, failure: 'fixture_mode' };
      }
      return recommendations.showFewerLikeThis(userId, listing, attribution);
    },
    [userId, downweightKey],
  );

  /**
   * "See more like this" — the positive facet tune. Locally it lifts any
   * "Show less" penalty on the same facet (the ledger's
   * latest-mutation-wins reversal, mirrored in the device store); the
   * durable `more` directive rides the intent mutation in live mode.
   */
  const seeMore = useCallback(
    async (
      listing: DiscoveryListingSummary,
    ): Promise<recommendations.FeedControlResult> => {
      const key = listing.category?.trim() || listing.brand?.trim() || '';
      if (key) unDownweightKey(key);
      if (DATA_MODE !== 'live') {
        return { persisted: false, failure: 'fixture_mode' };
      }
      return recommendations.showMoreLikeThis(userId, listing);
    },
    [userId, unDownweightKey],
  );

  /**
   * "Remove this topic" — durable facet exclusion. Locally the facet takes
   * the strongest penalty the device ranker has (a demote — exclusion is
   * the serve's job on the next ranked page); the `remove` intent mutation
   * carries the durable exclusion in live mode.
   */
  const removeTopic = useCallback(
    async (
      listing: DiscoveryListingSummary,
    ): Promise<recommendations.FeedControlResult> => {
      const key = listing.category?.trim() || listing.brand?.trim() || '';
      if (key) downweightKey(key);
      if (DATA_MODE !== 'live') {
        return { persisted: false, failure: 'fixture_mode' };
      }
      return recommendations.removeFeedTopic(userId, listing);
    },
    [userId, downweightKey],
  );

  const undoNotInterested = useCallback(
    async (
      listing: DiscoveryListingSummary,
    ): Promise<recommendations.FeedControlResult> => {
      unhideListing(listing.id);
      if (DATA_MODE !== 'live') {
        return { persisted: false, failure: 'fixture_mode' };
      }
      return recommendations.undoItemNotInterested(userId, listing);
    },
    [userId, unhideListing],
  );

  return { notInterested, showFewer, seeMore, removeTopic, undoNotInterested };
}

/** Intent-ledger topics — the real signal set behind the chip rail in live
 *  mode. Returns an empty result for guests/fixture (no profile exists). */
export function useIntentTopics() {
  const { user } = useSession();
  const userId = user?.id ?? null;
  return useQuery<recommendations.IntentTopic[] | null>({
    queryKey: ['intent-topics', userId ?? 'guest'],
    enabled: DATA_MODE === 'live' && userId !== null,
    staleTime: 60_000,
    queryFn: ({ signal }) =>
      userId ? recommendations.fetchIntentTopics(userId, signal) : Promise.resolve(null),
  });
}
