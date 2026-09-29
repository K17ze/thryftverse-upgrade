/**
 * Pulse feed model — ports the mobile PulseFeedScreen event model to the
 * web's full-bleed short-form cards.
 *
 * Fixture mode derives cards from the bundled dataset: live auctions
 * (AUCTIONS via toViewModel), fresh drops (newest listings), price drops
 * (originalPrice > price) and authored creator posts (PULSE_POSTS).
 *
 * Live mode (buildPulseFeedLive) composes the same event kinds from the
 * real backend: GET /auctions?status=live plus GET /listings?sort=newest —
 * the same sources the mobile screen reads through useBackendData.
 * Mobile Pulse has no creator-post source, so live mode emits none.
 *
 * Creator and shoppable-item facts are resolved at build time and carried
 * on the card — the renderer never re-derives them from fixtures, so a
 * live-mode card can't silently miss a fixture lookup.
 */

import { LISTINGS, PULSE_POSTS, listingById, userById } from '@/lib/data/fixtures';
import { AUCTIONS, formatDuration, toViewModel } from '@/lib/data/fixtures-auctions';
import { fetchAuctionBoard } from '@/lib/api/services/auctions';
import { fetchListings } from '@/lib/api/services/listings';
import type { AuctionMarketItem } from '@/lib/contracts/auction';
import type { Listing } from '@/lib/contracts/domain';
import { formatPrice } from '@/lib/utils/format';

export type PulseKind = 'creator' | 'auction_live' | 'fresh_drop' | 'price_drop';

/** Resolved creator facts — embedded at build time so the card works
 *  identically whether the source was fixtures or the live API. */
export interface PulseCreator {
  id: string;
  username: string | null;
  avatar: string | null;
  isVerified: boolean;
}

/** Resolved shoppable attachment — id, title, price and a real image. */
export interface PulseShoppableItem {
  id: string;
  title: string;
  price: number;
  image: string | null;
}

export interface PulseCardModel {
  id: string;
  kind: PulseKind;
  /** User id of the creator/seller — drives the follow edge. */
  creatorId: string;
  /** Resolved creator — fixture or live, always populated when known. */
  creator: PulseCreator | null;
  mediaUri: string;
  caption: string;
  /** Canonical deep link — the auction room, the listing, or the member
   *  profile. Every card lands somewhere real (mobile routes event taps
   *  the same way). */
  href: string;
  /** Short status line — countdown, price or drop percentage. */
  meta?: string;
  /** Auction end (ms epoch) — auction_live only; the card ticks the
   *  countdown off this rather than freezing the build-time string. */
  endsAt?: number;
  /** Current bid — auction_live only; paired with endsAt in the meta. */
  currentBid?: number;
  /** Standing bid count — auction_live only; a real contract field
   *  (AuctionMarketItem.bidCount), rendered as "N bids". */
  bidCount?: number;
  /** One line of real listing context — "Levi's · W32 · Very good" —
   *  built from the subject listing's brand/size/condition. Absent when
   *  the card has no listing subject or the fields didn't resolve. */
  context?: string;
  /** Resolved shoppable attachments (in display order). */
  items: PulseShoppableItem[];
  /** Shoppable ids — kept for wishlist/save writes. */
  itemIds: string[];
  /** Real like/wishlist count for the card's subject. Absent — not
   *  zero — when the source has no such field (live-mode auction rows
   *  carry no likes), so the card renders no count rather than a
   *  fabricated number. */
  likeCount?: number;
  /** Sort key — recency desc, mirrors the mobile feed. */
  timestamp: number;
  createdAt?: string;
}

/** Listing commerce context — brand · size · condition, whichever fields
 *  the contract actually carries. All real PDP facts; nothing invented. */
function listingContext(l: Listing | null | undefined): string | undefined {
  if (!l) return undefined;
  const parts = [l.brand, l.size, l.condition].filter(
    (p): p is string => typeof p === 'string' && p.length > 0,
  );
  return parts.length > 0 ? parts.join(' · ') : undefined;
}

/** Feed order — live auctions first, ending soonest (Whatnot urgency
 *  grammar and the board's own live sort), then everything else by
 *  recency. Ends-soonest beats recency only inside the live cohort —
 *  non-live cards stay strictly time-ordered. */
function sortPulseCards(cards: PulseCardModel[]): PulseCardModel[] {
  return cards.sort((a, b) => {
    const aLive = a.kind === 'auction_live';
    const bLive = b.kind === 'auction_live';
    if (aLive !== bLive) return aLive ? -1 : 1;
    if (aLive && bLive) return (a.endsAt ?? Infinity) - (b.endsAt ?? Infinity);
    return b.timestamp - a.timestamp;
  });
}

const isShoppable = (l: Listing) =>
  l.images.length > 0 && l.isSold !== true && l.status !== 'sold' && l.status !== 'draft';

const listingToItem = (l: Listing): PulseShoppableItem => ({
  id: l.id,
  title: l.title,
  price: l.price,
  image: l.images[0] ?? null,
});

const sellerToCreator = (l: Listing): PulseCreator | null =>
  l.seller
    ? {
        id: l.seller.id,
        username: l.seller.username,
        avatar: l.seller.avatar,
        isVerified: l.seller.verified === true,
      }
    : null;

const auctionSellerToCreator = (a: AuctionMarketItem): PulseCreator | null =>
  a.seller
    ? {
        id: a.seller.id,
        username: a.seller.username ?? null,
        avatar: a.seller.avatar ?? null,
        isVerified: false,
      }
    : null;

function fixtureCreator(userId: string): PulseCreator | null {
  const u = userById(userId);
  return u
    ? { id: u.id, username: u.username, avatar: u.avatar, isVerified: u.isVerified === true }
    : null;
}

function fixtureItems(ids: string[]): PulseShoppableItem[] {
  return ids
    .map(listingById)
    .filter((l): l is NonNullable<typeof l> => l != null)
    .map(listingToItem);
}

export function buildPulseFeed(now = Date.now()): PulseCardModel[] {
  const cards: PulseCardModel[] = [];

  // Live auctions — under the hammer right now.
  for (const a of AUCTIONS) {
    const vm = toViewModel(a, now);
    if (vm.lifecycle !== 'live') continue;
    cards.push({
      id: `pulse_${a.id}`,
      kind: 'auction_live',
      creatorId: a.sellerId,
      creator: fixtureCreator(a.sellerId),
      mediaUri: a.image,
      caption: a.title,
      href: `/auctions/${a.id}`,
      meta: `Ends in ${formatDuration(vm.msToEnd)} · ${formatPrice(a.currentBid)}${
        a.bidCount ? ` · ${a.bidCount} ${a.bidCount === 1 ? 'bid' : 'bids'}` : ''
      }`,
      endsAt: new Date(a.endsAt).getTime(),
      currentBid: a.currentBid,
      bidCount: a.bidCount,
      context: listingContext(listingById(a.listingId)),
      items: fixtureItems([a.listingId]),
      itemIds: [a.listingId],
      // Likes belong to the underlying listing — bidCount is auction
      // activity, reported in `meta`, not a like metric.
      likeCount: listingById(a.listingId)?.likes ?? 0,
      timestamp: new Date(a.endsAt).getTime(),
      createdAt: a.startsAt,
    });
  }

  // Fresh drops — newest listings first (mobile slices the same top set).
  [...LISTINGS]
    .filter(isShoppable)
    .sort((a, b) => {
      const da = a.createdAt ? Date.parse(a.createdAt) : 0;
      const db = b.createdAt ? Date.parse(b.createdAt) : 0;
      return db - da;
    })
    .slice(0, 8)
    .forEach((l) => {
      cards.push({
        id: `pulse_drop_${l.id}`,
        kind: 'fresh_drop',
        creatorId: l.sellerId,
        creator: sellerToCreator(l) ?? fixtureCreator(l.sellerId),
        mediaUri: l.images[0],
        caption: l.title,
        href: `/item/${l.id}`,
        meta: formatPrice(l.price),
        context: listingContext(l),
        items: [listingToItem(l)],
        itemIds: [l.id],
        likeCount: l.likes,
        timestamp: l.createdAt ? Date.parse(l.createdAt) : now,
        createdAt: l.createdAt,
      });
    });

  // Price drops — biggest percentage cut first (mirrors PulseTab ordering).
  LISTINGS.filter(
    (l) => isShoppable(l) && l.originalPrice != null && l.originalPrice > l.price,
  )
    .sort(
      (a, b) =>
        (b.originalPrice! - b.price) / b.originalPrice! -
        (a.originalPrice! - a.price) / a.originalPrice!,
    )
    .slice(0, 5)
    .forEach((l) => {
      const pct = Math.round(((l.originalPrice! - l.price) / l.originalPrice!) * 100);
      cards.push({
        id: `pulse_pd_${l.id}`,
        kind: 'price_drop',
        creatorId: l.sellerId,
        creator: sellerToCreator(l) ?? fixtureCreator(l.sellerId),
        mediaUri: l.images[0],
        caption: l.title,
        href: `/item/${l.id}`,
        meta: `Down ${pct}% · Now ${formatPrice(l.price)}`,
        context: listingContext(l),
        items: [listingToItem(l)],
        itemIds: [l.id],
        likeCount: l.likes,
        timestamp: now - 3_600_000, // approximate recent — same as mobile
        createdAt: l.createdAt,
      });
    });

  // Creator posts — authored media with shoppable attachments. Their
  // canonical destination is the member profile (same as the creator row).
  for (const p of PULSE_POSTS) {
    cards.push({
      id: `pulse_${p.id}`,
      kind: 'creator',
      creatorId: p.authorId,
      creator: fixtureCreator(p.authorId),
      mediaUri: p.mediaUri,
      caption: p.caption,
      href: `/u/${userById(p.authorId)?.username ?? p.authorId}`,
      items: fixtureItems(p.itemIds),
      itemIds: p.itemIds,
      likeCount: p.likeCount,
      timestamp: p.createdAt ? Date.parse(p.createdAt) : now,
      createdAt: p.createdAt,
    });
  }

  return sortPulseCards(cards);
}

/**
 * Live Pulse — the same event grammar composed from real endpoints.
 * `/auctions?status=live&sort=endingSoon` carries the seller object the
 * web's market contract already declares; `/listings?sort=newest` feeds
 * both the fresh-drop and price-drop kinds. Mobile Pulse emits no
 * creator posts (there is no posts endpoint) so live mode emits none —
 * an empty catalogue yields an honest empty feed, not fixture cards.
 */
export async function buildPulseFeedLive(
  now = Date.now(),
  signal?: AbortSignal,
): Promise<PulseCardModel[]> {
  const [auctionPage, listingPage] = await Promise.all([
    fetchAuctionBoard({ status: 'live', sort: 'endingSoon', limit: 20 }, signal),
    fetchListings({ sort: 'newest', limit: 40 }, signal),
  ]);

  const cards: PulseCardModel[] = [];

  // The auction's subject listing may already sit in the newest page —
  // resolve it for real context (brand/size/condition) and the shoppable
  // chip. When it doesn't, the card still renders; it just carries fewer
  // resolved facts rather than invented ones.
  const listingsById = new Map(listingPage.items.map((l) => [l.id, l]));

  for (const a of auctionPage.items) {
    const endsAt = Date.parse(a.endsAt);
    const startsAt = Date.parse(a.startsAt);
    // Server lifecycle wins when present; timestamps are the fallback
    // truth (same rule the board uses).
    const live =
      a.serverLifecycle !== undefined
        ? a.serverLifecycle === 'live'
        : Number.isFinite(startsAt) && Number.isFinite(endsAt) && startsAt <= now && now < endsAt;
    if (!live || !a.image) continue;
    const subject = a.listingId ? listingsById.get(a.listingId) : undefined;
    cards.push({
      id: `pulse_${a.id}`,
      kind: 'auction_live',
      creatorId: a.sellerId,
      creator: auctionSellerToCreator(a),
      mediaUri: a.image,
      caption: a.title,
      href: `/auctions/${a.id}`,
      meta: `Ends in ${formatDuration(endsAt - now)} · ${formatPrice(a.currentBid)}${
        a.bidCount ? ` · ${a.bidCount} ${a.bidCount === 1 ? 'bid' : 'bids'}` : ''
      }`,
      endsAt,
      currentBid: a.currentBid,
      bidCount: a.bidCount,
      context: listingContext(subject),
      items: subject && isShoppable(subject) ? [listingToItem(subject)] : [],
      itemIds: a.listingId ? [a.listingId] : [],
      // Auction rows carry no like metric — the count stays absent rather
      // than reading a fabricated zero under the wishlist heart. When the
      // subject listing resolved, its real like count applies (the heart
      // favourites that listing).
      ...(subject ? { likeCount: subject.likes } : {}),
      timestamp: Number.isFinite(endsAt) ? endsAt : now,
      createdAt: a.startsAt,
    });
  }

  const listings = listingPage.items.filter(isShoppable);

  // Fresh drops — the board's own newest ordering, no re-sort.
  listings.slice(0, 8).forEach((l) => {
    cards.push({
      id: `pulse_drop_${l.id}`,
      kind: 'fresh_drop',
      creatorId: l.sellerId,
      creator: sellerToCreator(l),
      mediaUri: l.images[0],
      caption: l.title,
      href: `/item/${l.id}`,
      meta: formatPrice(l.price),
      context: listingContext(l),
      items: [listingToItem(l)],
      itemIds: [l.id],
      likeCount: l.likes,
      timestamp: l.createdAt ? Date.parse(l.createdAt) : now,
      createdAt: l.createdAt,
    });
  });

  // Price drops — biggest percentage cut first (mirrors mobile ordering).
  listings
    .filter((l) => l.originalPrice != null && l.originalPrice > l.price)
    .sort(
      (a, b) =>
        (b.originalPrice! - b.price) / b.originalPrice! -
        (a.originalPrice! - a.price) / a.originalPrice!,
    )
    .slice(0, 5)
    .forEach((l) => {
      const pct = Math.round(((l.originalPrice! - l.price) / l.originalPrice!) * 100);
      cards.push({
        id: `pulse_pd_${l.id}`,
        kind: 'price_drop',
        creatorId: l.sellerId,
        creator: sellerToCreator(l),
        mediaUri: l.images[0],
        caption: l.title,
        href: `/item/${l.id}`,
        meta: `Down ${pct}% · Now ${formatPrice(l.price)}`,
        context: listingContext(l),
        items: [listingToItem(l)],
        itemIds: [l.id],
        likeCount: l.likes,
        timestamp: now - 3_600_000, // approximate recent — same as mobile
        createdAt: l.createdAt,
      });
    });

  return sortPulseCards(cards);
}
