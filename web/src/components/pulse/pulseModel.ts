/**
 * Pulse feed model — ports the mobile PulseFeedScreen event model to the
 * web's full-bleed short-form cards. Cards are derived from real fixtures:
 * live auctions (AUCTIONS via toViewModel), fresh drops (newest listings)
 * and price drops (originalPrice > price), plus authored creator posts
 * (PULSE_POSTS). Sorted by recency exactly like mobile — live auctions
 * carry their endsAt timestamp, so lots about to close surface first.
 *
 * Media is images only — no video assets exist in fixture mode, so cards
 * render as stills with no fabricated playback chrome.
 */

import { LISTINGS, PULSE_POSTS, userById } from '@/lib/data/fixtures';
import { AUCTIONS, formatDuration, toViewModel } from '@/lib/data/fixtures-auctions';
import { formatPrice } from '@/lib/utils/format';

export type PulseKind = 'creator' | 'auction_live' | 'fresh_drop' | 'price_drop';

export interface PulseCardModel {
  id: string;
  kind: PulseKind;
  /** User id of the creator/seller — resolves via userById. */
  creatorId: string;
  mediaUri: string;
  caption: string;
  /** Canonical deep link — the auction room, the listing, or the member
   *  profile. Every card lands somewhere real (mobile routes event taps
   *  the same way). */
  href: string;
  /** Short status line — countdown, price or drop percentage. */
  meta?: string;
  /** Shoppable attachments — resolve via listingById. */
  itemIds: string[];
  likeCount: number;
  /** Sort key — recency desc, mirrors the mobile feed. */
  timestamp: number;
  createdAt?: string;
}

const isShoppable = (l: (typeof LISTINGS)[number]) =>
  l.images.length > 0 && l.isSold !== true && l.status !== 'sold' && l.status !== 'draft';

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
      mediaUri: a.image,
      caption: a.title,
      href: `/auctions/${a.id}`,
      meta: `Ends in ${formatDuration(vm.msToEnd)} · Current bid ${formatPrice(a.currentBid)}`,
      itemIds: [a.listingId],
      likeCount: a.bidCount,
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
        mediaUri: l.images[0],
        caption: l.title,
        href: `/item/${l.id}`,
        meta: formatPrice(l.price),
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
        mediaUri: l.images[0],
        caption: l.title,
        href: `/item/${l.id}`,
        meta: `Down ${pct}% · Now ${formatPrice(l.price)}`,
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
      mediaUri: p.mediaUri,
      caption: p.caption,
      href: `/u/${userById(p.authorId)?.username ?? p.authorId}`,
      itemIds: p.itemIds,
      likeCount: p.likeCount,
      timestamp: p.createdAt ? Date.parse(p.createdAt) : now,
      createdAt: p.createdAt,
    });
  }

  cards.sort((a, b) => b.timestamp - a.timestamp);
  return cards;
}
