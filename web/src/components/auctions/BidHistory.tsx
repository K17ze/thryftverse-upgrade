'use client';

/**
 * BidHistory — the auction's ledger, eBay grammar. Bidders are masked to
 * first name + initial ("Marie F.") — the ledger proves activity without
 * doxxing participants, so no avatars here either (a face unmasks the bid).
 * Newest first (a fresh bid lands on top), viewer's own rows marked "You",
 * top bid carries the emphasis. The contract carries no proxy/auto-bid
 * flags, so none are shown — nothing fabricated. Fixtures are authored
 * ascending; the surface renders them descending.
 */

import type { AuctionBid } from '@/lib/contracts/auction';
import { Skeleton } from '@/components/ui/Skeleton';
import { userById } from '@/lib/data/fixtures';
import { formatPrice, timeAgo } from '@/lib/utils/format';

/**
 * "mariefullery" → "Marie F." · "scott_art" → "Scott A." · "ellawears" →
 * "Ella W.". Deterministic from the username: split on separators/digits,
 * keep the first name and the second token's initial; a single compound
 * token keeps its first run as the given name and the rest becomes the
 * initial. Never renders enough to identify the member.
 */
export function maskBidder(username: string): string {
  const tokens = username.split(/[^a-zA-Z]+/).filter(Boolean);
  if (tokens.length >= 2) {
    return `${cap(tokens[0])} ${tokens[1].charAt(0).toUpperCase()}.`;
  }
  const word = tokens[0] ?? username;
  if (word.length <= 3) return cap(word);
  return `${cap(word.slice(0, 4))} ${word.charAt(word.length - 1).toUpperCase()}.`;
}

function cap(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

interface BidHistoryProps {
  bids: AuctionBid[];
  viewerId: string;
  isLoading?: boolean;
}

export function BidHistory({ bids, viewerId, isLoading }: BidHistoryProps) {
  if (isLoading) {
    return (
      <div className="flex flex-col gap-3" aria-busy aria-label="Loading bid history">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 py-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="h-4 w-16" />
          </div>
        ))}
      </div>
    );
  }

  if (bids.length === 0) {
    return (
      <p className="text-body text-text-secondary">
        No bids yet — the opening bid sets the pace.
      </p>
    );
  }

  const ordered = [...bids].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));

  return (
    <table className="w-full border-collapse text-left">
      <thead>
        <tr className="border-b border-border-subtle">
          <th scope="col" className="py-2 pr-3 text-left text-label text-text-muted">
            Bidder
          </th>
          <th scope="col" className="py-2 pr-3 text-right text-label text-text-muted">
            Bid
          </th>
          <th scope="col" className="py-2 text-right text-label text-text-muted">
            Time
          </th>
        </tr>
      </thead>
      <tbody>
        {ordered.map((bid, index) => {
          const mine = bid.bidderId === viewerId;
          const username = userById(bid.bidderId)?.username ?? bid.bidderName;
          return (
            <tr
              key={bid.id}
              className="border-b border-border-subtle last:border-b-0"
              aria-live={index === 0 ? 'polite' : undefined}
            >
              <td className="py-2.5 pr-3 text-body font-medium text-text-primary">
                {mine ? 'You' : maskBidder(username)}
              </td>
              <td
                className={`tnum py-2.5 pr-3 text-right text-body-emphasis font-bold ${
                  index === 0 ? 'text-text-primary' : 'text-text-secondary'
                }`}
              >
                {formatPrice(bid.amount)}
              </td>
              <td className="tnum py-2.5 text-right text-meta text-text-muted">
                {timeAgo(bid.createdAt)}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
