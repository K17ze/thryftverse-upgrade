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
  AppNotification,
  Conversation,
  DiscoveryFeedUnit,
  Listing,
  Order,
  User,
  Review,
} from '@/lib/contracts/domain';
import { mapListingToDiscoverySummary } from '@/lib/contracts/domain';
import {
  CONVERSATIONS,
  LISTINGS,
  MY_LISTINGS,
  NOTIFICATIONS,
  ORDERS,
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
import * as feedService from './services/feed';
import * as usersService from './services/users';
import * as chatService from './services/chat';
import * as notificationsService from './services/notifications';
import * as commerceService from './services/commerce';

export const DATA_MODE =
  (process.env.NEXT_PUBLIC_DATA_MODE ?? 'fixture') as 'fixture' | 'live';

// Fixture latency — keeps skeleton states honest without feeling slow.
const tick = (ms = 120) => new Promise((r) => setTimeout(r, ms));

export interface FeedPage {
  units: DiscoveryFeedUnit[];
  nextCursor: string | null;
}

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
  });
  return { units, nextCursor: null };
}

async function fetchFeedLive(cursor?: string): Promise<FeedPage> {
  const page = await feedService.fetchHomeFeed(undefined, { cursor: cursor ?? undefined });
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
          creatorUsername: null,
          creatorAvatarUri: null,
          itemCount: u.look.itemIds.length,
        };
      }
      if (u.kind === 'poster' && u.poster) {
        return {
          type: 'poster' as const,
          id: `poster-${u.poster.id}`,
          storyId: u.poster.id,
          coverUri: u.poster.coverUri,
          aspectRatio: u.poster.aspectRatio,
          authorUsername: null,
          authorAvatarUri: null,
        };
      }
      return null;
    })
    .filter((u): u is DiscoveryFeedUnit => u !== null);
  return { units, nextCursor: page.nextCursor };
}

export const data = {
  async listings(category?: string, query?: string): Promise<Listing[]> {
    if (DATA_MODE === 'live') {
      const page = await listingsService.searchListings({
        category: category && category !== 'All' ? category : undefined,
        q: query,
      });
      return page.items;
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
    return out;
  },

  async feed(cursor?: string): Promise<FeedPage> {
    if (DATA_MODE === 'live') {
      return fetchFeedLive(cursor);
    }
    return fetchFeedFixture(cursor);
  },

  async listing(id: string): Promise<Listing | null> {
    if (DATA_MODE === 'live') {
      return listingsService.fetchListingById(id);
    }
    await tick();
    return listingById(id) ?? null;
  },

  async sellerListings(sellerId: string): Promise<Listing[]> {
    if (DATA_MODE === 'live') {
      const page = await listingsService.fetchSellerListings(sellerId);
      return page.items;
    }
    await tick();
    return listingsBySeller(sellerId);
  },

  async user(id: string): Promise<User | null> {
    if (DATA_MODE === 'live') {
      return usersService.fetchUserProfile(id);
    }
    await tick();
    return userById(id) ?? null;
  },

  async userByUsername(username: string): Promise<User | null> {
    if (DATA_MODE === 'live') {
      return usersService.fetchUserByUsername(username);
    }
    await tick();
    return USERS.find((u) => u.username === username) ?? null;
  },

  async reviews(userId: string): Promise<Review[]> {
    if (DATA_MODE === 'live') {
      return usersService.fetchUserReviews(userId);
    }
    await tick();
    return REVIEWS.filter((r) => r.userId === userId);
  },

  async conversations(currentUserId?: string): Promise<Conversation[]> {
    if (DATA_MODE === 'live') {
      return chatService.fetchConversations(currentUserId);
    }
    await tick();
    return CONVERSATIONS;
  },

  async conversation(id: string, currentUserId?: string): Promise<Conversation | null> {
    if (DATA_MODE === 'live') {
      return chatService.fetchConversation(id, currentUserId);
    }
    await tick();
    return CONVERSATIONS.find((c) => c.id === id) ?? null;
  },

  async notifications(): Promise<AppNotification[]> {
    if (DATA_MODE === 'live') {
      const page = await notificationsService.fetchNotificationEvents();
      return page.items;
    }
    await tick();
    return NOTIFICATIONS;
  },

  async orders(): Promise<Order[]> {
    if (DATA_MODE === 'live') {
      const page = await commerceService.fetchOrders();
      return page.baseOrders;
    }
    await tick();
    return ORDERS;
  },

  async myListings(): Promise<Listing[]> {
    if (DATA_MODE === 'live') {
      const page = await listingsService.fetchMyListings();
      return page.items;
    }
    await tick();
    return MY_LISTINGS;
  },

  async sendMessage(conversationId: string, text: string, currentUserId?: string): Promise<void> {
    if (DATA_MODE === 'live') {
      await chatService.sendChatMessage(conversationId, text, currentUserId);
      return;
    }
    await tick(60);
    const convo = CONVERSATIONS.find((c) => c.id === conversationId);
    convo?.messages.push({
      id: `local-${Date.now()}`,
      senderId: 'me',
      sender: 'me',
      text,
      timestamp: new Date().toISOString(),
      readStatus: 'sent',
    });
  },
};

export { LOOKS, POSTERS, MOODBOARDS };
