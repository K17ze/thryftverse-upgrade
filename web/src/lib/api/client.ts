/**
 * Data access layer — one interface, two backends:
 *  - "fixture": bundled design dataset (NEXT_PUBLIC_DATA_MODE=fixture, default)
 *  - "live":    the ThryftVerse backend API (backend/api routes, same as mobile)
 *
 * Screens consume hooks from lib/hooks — never fetch directly.
 * Live mode delegates to lib/api/services/* which hit the same versioned
 * endpoints (`{NEXT_PUBLIC_API_BASE_URL}/api/v1/*`) the mobile app uses.
 */

import type {
  Conversation,
  DiscoveryFeedUnit,
  Listing,
  Order,
  User,
} from '@/lib/contracts/domain';
import { mapListingToDiscoverySummary } from '@/lib/contracts/domain';
import {
  CONVERSATIONS,
  LISTINGS,
  MY_LISTINGS,
  NOTIFICATION_FEED,
  ORDERS,
  STORY_RAIL,
  USERS,
  listingById,
  listingsBySeller,
  userById,
  LOOKS,
  POSTERS,
  MOODBOARDS,
  REVIEWS,
} from '@/lib/data/fixtures';
import * as listingsService from './services/listings';
import type {
  ListingFilters,
  SortKey,
} from '@/components/filters/filterTypes';
import * as feedService from './services/feed';
import * as usersService from './services/users';
import * as chatService from './services/chat';
import * as notificationsService from './services/notifications';
import * as commerceService from './services/commerce';
import * as socialService from './services/social';

const envDataMode = process.env.NEXT_PUBLIC_DATA_MODE ?? 'fixture';
// Defensive mirror of the next.config.ts check — this module is also
// imported outside the Next runtime (tests, scripts), where the config
// guard never runs.
if (envDataMode !== 'fixture' && envDataMode !== 'live') {
  throw new Error(
    `NEXT_PUBLIC_DATA_MODE must be "fixture" or "live" — got "${envDataMode}".`,
  );
}
export const DATA_MODE = envDataMode as 'fixture' | 'live';

// Fixture latency — keeps skeleton states honest without feeling slow.
const tick = (ms = 120) => new Promise((r) => setTimeout(r, ms));

export interface FeedPage {
  units: DiscoveryFeedUnit[];
  nextCursor: string | null;
}

/** SortKey → wire enum, per endpoint contract. /search/listings ranks by
 *  `relevance`; /listings' nearest equivalent is `recommended`. */
const SEARCH_SORT_WIRE: Record<SortKey, string> = {
  relevance: 'relevance',
  newest: 'recent',
  'most-liked': 'most_liked',
  'price-asc': 'price_asc',
  'price-desc': 'price_desc',
  'ending-soon': 'ending_soon',
};

const BROWSE_SORT_WIRE: Record<SortKey, string> = {
  relevance: 'recommended',
  newest: 'newest',
  'most-liked': 'most_liked',
  'price-asc': 'price_asc',
  'price-desc': 'price_desc',
  'ending-soon': 'ending_soon',
};

async function fetchFeedFixture(_cursor?: string): Promise<FeedPage> {
  await tick();
  // Authored feed: interleave listing units with look/poster/moodboard/editorial
  // breaks — the Discover feed is an authored canvas, not a uniform catalogue.
  const listings = LISTINGS.map((l) => mapListingToDiscoverySummary(l));
  const units: DiscoveryFeedUnit[] = [];
  const look = LOOKS[0];
  const poster = POSTERS[0];
  const moodboard = MOODBOARDS[0];

  listings.forEach((listing, i) => {
    units.push({ type: 'listing', id: `listing-${listing.id}`, listing });
    if (i === 5 && look) {
      units.push({
        type: 'look',
        id: `look-${look.id}`,
        lookId: look.id,
        coverImageUri: look.coverImageUri,
        coverAspectRatio: look.coverAspectRatio,
        creatorUsername: userById(look.creatorId)?.username ?? null,
        creatorAvatarUri: userById(look.creatorId)?.avatar ?? null,
        itemCount: look.itemIds.length,
      });
    }
    if (i === 11 && poster) {
      units.push({
        type: 'poster',
        id: `poster-${poster.id}`,
        storyId: poster.id,
        coverUri: poster.coverUri,
        aspectRatio: poster.aspectRatio,
        authorUsername: userById(poster.authorId)?.username ?? null,
        authorAvatarUri: userById(poster.authorId)?.avatar ?? null,
      });
    }
    if (i === 17 && moodboard) {
      units.push({
        type: 'moodboard',
        id: `mb-${moodboard.id}`,
        moodboardId: moodboard.id,
        coverUri: moodboard.coverUri,
        aspectRatio: moodboard.aspectRatio,
        title: moodboard.title,
        ownerUsername: userById(moodboard.ownerId)?.username ?? null,
      });
    }
    if (i === 23) {
      units.push({
        type: 'editorial',
        id: 'editorial-galleria-aw',
        mediaUri:
          'https://images.unsplash.com/photo-1539109136881-3be0616acf4b?auto=format&fit=crop&w=900&q=80',
        aspectRatio: 0.75,
        headline: 'The Autumn Issue',
        kicker: 'Galleria',
        href: '/galleria',
      });
    }
    if (i === 28) {
      const picks = [...listings]
        .sort((a, b) => (b.likes ?? 0) - (a.likes ?? 0))
        .slice(0, 4);
      if (picks.length) {
        units.push({
          type: 'recommendation_break',
          id: 'rec-break-most-wanted',
          headline: 'Most wanted this week',
          listings: picks,
        });
      }
    }
  });
  // Featured rhythm — occasional double-width listing breaks the uniform
  // scan pattern (mobile FEATURED_RHYTHM parity; span lands on a media-
  // strong tile so the composition stays editorial, not promotional).
  [7, 15].forEach((idx) => {
    const unit = units[idx];
    if (unit?.type === 'listing') unit.span = 2;
  });
  return { units, nextCursor: null };
}

async function fetchFeedLive(cursor?: string, signal?: AbortSignal): Promise<FeedPage> {
  const page = await feedService.fetchHomeFeed(signal, { cursor: cursor ?? undefined });
  const units: DiscoveryFeedUnit[] = page.units
    .map((u): DiscoveryFeedUnit | null => {
      if (u.kind === 'listing' && u.listing) {
        return {
          type: 'listing' as const,
          id: `listing-${u.listing.id}`,
          listing: mapListingToDiscoverySummary(u.listing),
        };
      }
      if (u.kind === 'look' && u.look) {
        return {
          type: 'look' as const,
          id: `look-${u.look.id}`,
          lookId: u.look.id,
          coverImageUri: u.look.coverImageUri,
          coverAspectRatio: u.look.coverAspectRatio,
          creatorUsername: u.look.creatorUsername ?? null,
          creatorAvatarUri: u.look.creatorAvatar ?? null,
          itemCount: u.look.itemIds.length,
        };
      }
      if (u.kind === 'poster' && u.poster) {
        return {
          type: 'poster' as const,
          // poster.id IS the story id — the feed service resolves the
          // frame row to its parent story before it reaches here.
          id: `poster-${u.poster.id}`,
          storyId: u.poster.id,
          coverUri: u.poster.coverUri,
          aspectRatio: u.poster.aspectRatio,
          authorUsername: u.poster.authorUsername ?? null,
          authorAvatarUri: u.poster.authorAvatar ?? null,
        };
      }
      return null;
    })
    .filter((u): u is DiscoveryFeedUnit => u !== null);
  return { units, nextCursor: page.nextCursor };
}

export const data = {
  /** Catalogue retrieval — one method, two backend contracts:
   *  - a usable query (≥2 chars) → GET /search/listings (ranked, page-
   *    based; the service synthesises the cursor contract)
   *  - browse / category / facets-only / short query → GET /listings
   *    (cursor pagination, slug-tolerant category).
   *  `filters`/`sort` are forwarded server-side so refinement, ordering
   *  and the result count are truthful over the whole catalogue, not the
   *  first page. Fixture mode applies the same predicates locally. */
  async listings(
    params: {
      category?: string;
      query?: string;
      cursor?: string;
      limit?: number;
      filters?: ListingFilters;
      sort?: SortKey;
      subcategory?: string;
      signal?: AbortSignal;
    } = {},
  ): Promise<listingsService.ListingPage> {
    const { category, query, cursor, limit, signal, filters, sort, subcategory } = params;
    if (DATA_MODE === 'live') {
      const scopedCategory = category && category !== 'All' ? category : undefined;
      const q = query?.trim();
      if (q && q.length >= 2) {
        return listingsService.searchListings(
          {
            q,
            category: scopedCategory,
            categories: filters?.categories,
            conditions: filters?.conditions,
            brands: filters?.brands,
            sizes: filters?.sizes,
            priceMin: filters?.priceMin ?? undefined,
            priceMax: filters?.priceMax ?? undefined,
            includeSold: filters?.includeSold || undefined,
            sort: sort ? SEARCH_SORT_WIRE[sort] : undefined,
            cursor,
            limit,
          },
          signal,
        );
      }
      return listingsService.fetchListings(
        {
          // /listings accepts q≥1 — a one-char browse query still narrows.
          q: q || undefined,
          category: scopedCategory,
          categories: filters?.categories,
          subcategory,
          brands: filters?.brands,
          sizes: filters?.sizes,
          conditions: filters?.conditions,
          minPrice: filters?.priceMin ?? undefined,
          maxPrice: filters?.priceMax ?? undefined,
          includeSold: filters?.includeSold || undefined,
          sort: sort ? BROWSE_SORT_WIRE[sort] : undefined,
          cursor,
          limit,
        },
        signal,
      );
    }
    await tick();
    let out = LISTINGS;
    if (category && category !== 'All') {
      const c = category.toLowerCase();
      out = out.filter(
        (l) => l.category.toLowerCase() === c || l.subcategory?.toLowerCase() === c,
      );
    }
    if (query) {
      const q = query.toLowerCase();
      out = out.filter(
        (l) =>
          l.title.toLowerCase().includes(q) ||
          l.brand?.toLowerCase().includes(q) ||
          l.category.toLowerCase().includes(q) ||
          l.subcategory?.toLowerCase().includes(q),
      );
    }
    if (subcategory) {
      const s = subcategory.toLowerCase();
      out = out.filter((l) => l.subcategory?.toLowerCase() === s);
    }
    // Fixture parity with the live contract — the facet groups the server
    // narrows by are applied here too (OR within a group, AND across).
    if (filters) {
      const cats = filters.categories.map((c) => c.toLowerCase());
      const brands = filters.brands.map((b) => b.toLowerCase());
      const sizes = filters.sizes.map((s) => s.toLowerCase());
      if (!filters.includeSold) {
        out = out.filter((l) => !l.isSold && l.status !== 'sold');
      }
      if (cats.length > 0) out = out.filter((l) => cats.includes(l.category.toLowerCase()));
      if (filters.conditions.length > 0) {
        out = out.filter((l) => filters.conditions.includes(l.condition));
      }
      if (brands.length > 0) {
        out = out.filter((l) =>
          brands.some((b) => (l.brand ?? '').toLowerCase().includes(b)),
        );
      }
      if (sizes.length > 0) {
        out = out.filter((l) =>
          sizes.some((s) => (l.size ?? '').toLowerCase().includes(s)),
        );
      }
      if (filters.priceMin != null) out = out.filter((l) => l.price >= filters.priceMin!);
      if (filters.priceMax != null) out = out.filter((l) => l.price <= filters.priceMax!);
    }
    return { items: out, nextCursor: null, total: out.length };
  },

  async feed(cursor?: string, signal?: AbortSignal): Promise<FeedPage> {
    if (DATA_MODE === 'live') {
      return fetchFeedLive(cursor, signal);
    }
    return fetchFeedFixture(cursor);
  },

  async listing(id: string, signal?: AbortSignal): Promise<Listing | null> {
    if (DATA_MODE === 'live') {
      return listingsService.fetchListingById(id, signal);
    }
    await tick();
    return listingById(id) ?? null;
  },

  async sellerListings(sellerId: string, signal?: AbortSignal): Promise<Listing[]> {
    if (DATA_MODE === 'live') {
      const page = await listingsService.fetchSellerListings(sellerId, {}, signal);
      return page.items;
    }
    await tick();
    return listingsBySeller(sellerId);
  },

  async user(id: string, signal?: AbortSignal): Promise<User | null> {
    if (DATA_MODE === 'live') {
      return usersService.fetchUserProfile(id, signal);
    }
    await tick();
    return userById(id) ?? null;
  },

  async userByUsername(username: string, signal?: AbortSignal): Promise<User | null> {
    if (DATA_MODE === 'live') {
      return usersService.fetchUserByUsername(username, signal);
    }
    await tick();
    return USERS.find((u) => u.username === username) ?? null;
  },

  async reviews(
    userId: string,
    signal?: AbortSignal,
  ): Promise<usersService.UserReviewsResult> {
    if (DATA_MODE === 'live') {
      return usersService.fetchUserReviews(userId, signal);
    }
    await tick();
    return { reviews: REVIEWS.filter((r) => r.userId === userId), summary: null };
  },

  async conversations(currentUserId?: string, signal?: AbortSignal): Promise<Conversation[]> {
    if (DATA_MODE === 'live') {
      return chatService.fetchConversations(currentUserId, signal);
    }
    await tick();
    return CONVERSATIONS;
  },

  async conversation(
    id: string,
    currentUserId?: string,
    signal?: AbortSignal,
  ): Promise<Conversation | null> {
    if (DATA_MODE === 'live') {
      return chatService.fetchConversation(id, currentUserId, signal);
    }
    await tick();
    return CONVERSATIONS.find((c) => c.id === id) ?? null;
  },

  /** Badge count — the count-only endpoint; the full feed fetch is for
   *  the /notifications page, not the chrome. */
  async unreadNotificationCount(signal?: AbortSignal): Promise<number> {
    if (DATA_MODE === 'live') {
      return notificationsService.fetchUnreadNotificationCount(signal);
    }
    await tick();
    return NOTIFICATION_FEED.filter((n) => n.unread).length;
  },

  /** Story rail entries — GET /poster-stories, the same id namespace the
   *  /poster/[id] viewer resolves (feed poster units are `posters` rows,
   *  not stories — deriving the rail from them dead-ends every tap). */
  async posterStories(signal?: AbortSignal): Promise<
    { id: string; username: string; avatar: string; coverUri: string; seen?: boolean }[]
  > {
    if (DATA_MODE === 'live') {
      const stories = await socialService.fetchPosterStories(signal);
      return stories.map((s) => ({
        id: s.id,
        username: s.creator.username ?? '',
        avatar: s.creator.avatar ?? '',
        // Rail cover = first frame's media (posterUrl for video frames).
        coverUri: s.frames[0]?.posterUrl ?? s.frames[0]?.mediaUrl ?? '',
        seen: s.seenByViewer,
      }));
    }
    await tick();
    return STORY_RAIL;
  },

  async orders(signal?: AbortSignal): Promise<Order[]> {
    if (DATA_MODE === 'live') {
      const page = await commerceService.fetchOrders({}, signal);
      return page.baseOrders;
    }
    await tick();
    return ORDERS;
  },

  async myListings(signal?: AbortSignal): Promise<Listing[]> {
    if (DATA_MODE === 'live') {
      const page = await listingsService.fetchMyListings({}, signal);
      return page.items;
    }
    await tick();
    return MY_LISTINGS;
  },

  async sendMessage(
    conversationId: string,
    input: { text?: string; mediaUri?: string; mediaType?: 'image' | 'video' },
    currentUserId?: string,
  ): Promise<void> {
    if (DATA_MODE === 'live') {
      await chatService.sendChatMessage(conversationId, input, currentUserId);
      return;
    }
    await tick(60);
    const convo = CONVERSATIONS.find((c) => c.id === conversationId);
    convo?.messages.push({
      id: `local-${Date.now()}`,
      senderId: 'me',
      sender: 'me',
      text: input.text,
      mediaUri: input.mediaUri,
      mediaType: input.mediaType,
      type: input.mediaUri ? 'media' : 'text',
      timestamp: new Date().toISOString(),
      readStatus: 'sent',
    });
  },
};

export { LOOKS, POSTERS, MOODBOARDS };
