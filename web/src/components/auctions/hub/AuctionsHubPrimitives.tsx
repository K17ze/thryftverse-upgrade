import type { AuctionLifecycle } from '@/lib/contracts/auction';
import type { AttentionKind } from '@/components/auctions';

export type AuctionScope = AuctionLifecycle | 'watching';

export const AUCTION_SCOPES: { value: AuctionScope; label: string }[] = [
  { value: 'live', label: 'Live' },
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'ended', label: 'Results' },
  { value: 'watching', label: 'Watching' },
];

export const AUCTION_EMPTY_COPY: Record<AuctionScope, { title: string; subtitle: string }> = {
  live: {
    title: 'Nothing on the block',
    subtitle: 'Live auctions land here the moment they open.',
  },
  upcoming: {
    title: 'Nothing scheduled',
    subtitle: 'Auctions surface here ahead of their opening bid.',
  },
  ended: {
    title: 'No closed auctions',
    subtitle: 'Closed hammers and their results settle here.',
  },
  watching: {
    title: 'Not watching anything',
    subtitle: 'Watch an auction from its page and it stays pinned here.',
  },
};

/** Server attention reasons that carry personal state — a null reason is
 *  a market highlight, which the personal strip must not impersonate, so
 *  it falls through to the local derivation. */
export const ATTENTION_REASON_KIND: Record<string, AttentionKind> = {
  won_action: 'won',
  outbid: 'outbid',
  leading_ending: 'leading',
  leading: 'leading',
  watching_ending: 'watching',
};
