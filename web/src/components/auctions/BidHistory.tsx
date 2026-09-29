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
import { Icon } from '@/components/ui/Icon';
import { Skeleton } from '@/components/ui/Skeleton';
import { userById } from '@/lib/data/fixtures';
import { DATA_MODE } from '@/lib/api/client';
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
  /** null for guests — no row may claim "You" without a real identity. */
  viewerId: string | null | undefined;
  isLoading?: boolean;
  /** Ledger fetch failed — an errored ledger is not an empty one. */
  isError?: boolean;
  onRetry?: () => void;
}

export function BidHistory({ bids, viewerId, isLoading, isError, onRetry }: BidHistoryProps) {
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

  if (isError) {
    return (
      <div className="flex items-center gap-2 py-2" role="alert">
        <Icon name="alert" size={14} className="shrink-0 text-warning-text" />
        <span className="min-w-0 flex-1 text-body text-text-secondary">
          Couldn&apos;t load bids.
        </span>
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className="pressable shrink-0 text-caption font-semibold text-text-primary underline-offset-4 hover:underline"
          >
            Try again
          </button>
        ) : null}
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
          const mine = viewerId != null && bid.bidderId === viewerId;
          // The wire's bidderName is the identity truth — fixture
          // enrichment only for fixture ids (a live-id collision would
          // attribute the bid to the wrong member).
          const username =
            DATA_MODE === 'fixture'
              ? (userById(bid.bidderId)?.username ?? bid.bidderName)
              : bid.bidderName;
          const exact = new Date(bid.createdAt).toLocaleString('en-GB', {
            day: 'numeric',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit',
          });
          return (
            <tr
              key={bid.id}
              className="border-b border-border-subtle last:border-b-0"
              aria-live={index === 0 ? 'polite' : undefined}
            >
              <td className="py-2.5 pr-3 text-body font-medium text-text-primary">
                {mine ? 'You' : maskBidder(username)}
                {index === 0 ? (
                  <span className="ml-2 text-meta font-semibold uppercase tracking-wide text-success-text">
                    Top bid
                  </span>
                ) : null}
              </td>
              <td
                className={`tnum py-2.5 pr-3 text-right text-body-emphasis font-bold ${
                  index === 0 ? 'text-text-primary' : 'text-text-secondary'
                }`}
              >
                {formatPrice(bid.amount)}
              </td>
              <td
                className="tnum py-2.5 text-right text-meta text-text-muted"
                title={exact}
              >
                <time dateTime={bid.createdAt}>{timeAgo(bid.createdAt)}</time>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
