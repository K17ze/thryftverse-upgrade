'use client';

/**
 * AuctionConfirmSheet — explicit pre-hammer confirmation modal with
 * binding commitment disclosures, anti-sniping notices, and idempotency key.
 */

import { Sheet } from '@/components/ui/Sheet';
import { Button } from '@/components/ui/Button';
import { AppImage } from '@/components/ui/AppImage';
import { Icon } from '@/components/ui/Icon';
import type { AuctionViewModel } from '@/lib/contracts/auction';
import {
  ANTI_SNIPING_EXTENSION_MS,
  ANTI_SNIPING_WINDOW_MS,
} from '@/lib/contracts/auction';
import { formatPrice } from '@/lib/utils/format';

interface AuctionConfirmSheetProps {
  open: boolean;
  onClose: () => void;
  auction: AuctionViewModel;
  confirming: {
    amount: number;
    maxBid?: number;
    idempotencyKey: string;
  } | null;
  minimum: number;
  pending: boolean;
  onConfirm: (confirmed: { amount: number; maxBid?: number; idempotencyKey: string }) => void;
}

export function AuctionConfirmSheet({
  open,
  onClose,
  auction,
  confirming,
  minimum,
  pending,
  onConfirm,
}: AuctionConfirmSheetProps) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Confirm your bid"
      maxWidth={440}
    >
      <div className="flex flex-col gap-5 p-5">
        <div className="flex items-center gap-3">
          <span className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-surface-alt">
            <AppImage
              src={auction.image}
              alt={auction.title}
              fill
              sizes="56px"
              className="h-full w-full"
            />
          </span>
          <div className="min-w-0">
            <p className="clamp-1 text-body-emphasis font-medium text-text-primary">
              {auction.title}
            </p>
            <p className="tnum mt-0.5 text-caption text-text-secondary">
              Current bid {formatPrice(auction.currentBid)} · {auction.bidCount}{' '}
              {auction.bidCount === 1 ? 'bid' : 'bids'}
            </p>
          </div>
        </div>

        <div className="border-y border-border-subtle py-4">
          <p className="text-meta font-semibold uppercase tracking-wide text-text-muted">
            Your bid
          </p>
          <p className="tnum mt-1 text-price-hero font-bold text-text-primary">
            {formatPrice(confirming?.amount ?? minimum)}
          </p>
          {confirming?.maxBid != null ? (
            <p className="tnum mt-2 text-caption text-text-secondary">
              Maximum bid{' '}
              <span className="font-semibold text-text-primary">
                {formatPrice(confirming.maxBid)}
              </span>
            </p>
          ) : null}
        </div>

        <p className="text-caption text-text-secondary">
          {auction.lifecycle === 'live'
            ? Date.parse(auction.endsAt) - Date.now() < ANTI_SNIPING_WINDOW_MS
              ? `Inside the final ${Math.round(ANTI_SNIPING_WINDOW_MS / 60_000)} minutes — your bid extends the close by ${Math.round(ANTI_SNIPING_EXTENSION_MS / 60_000)}m.`
              : confirming?.maxBid != null
                ? `We place ${formatPrice(confirming.amount)} now and bid the lowest amount needed to keep you in the lead — up to ${formatPrice(confirming.maxBid)}.`
                : `You become the top bidder unless someone passes ${formatPrice(confirming?.amount ?? minimum)}.`
            : 'Bidding opens when the auction goes live.'}
        </p>

        {/* Binding-bid disclosure — legal commitment block */}
        <ul className="flex flex-col gap-1.5">
          <li className="flex items-start gap-2 text-caption text-text-secondary">
            <Icon name="info" size={13} className="mt-0.5 shrink-0" />
            Bids are binding once accepted.
          </li>
          <li className="flex items-start gap-2 text-caption text-text-secondary">
            <Icon name="clock" size={13} className="mt-0.5 shrink-0" />
            If you win, payment is due promptly after the auction ends.
          </li>
          <li className="flex items-start gap-2 text-caption text-text-secondary">
            <Icon name="lock" size={13} className="mt-0.5 shrink-0" />
            You cannot cancel a bid after it is submitted.
          </li>
        </ul>

        <div className="flex flex-col gap-2">
          <Button
            size="lg"
            fullWidth
            disabled={pending || !confirming}
            onClick={() => confirming != null && onConfirm(confirming)}
          >
            {pending
              ? 'Placing bid…'
              : confirming?.maxBid != null
                ? `Place proxy bid · ${formatPrice(confirming.amount)}`
                : `Place bid · ${formatPrice(confirming?.amount ?? minimum)}`}
          </Button>
          <Button variant="quiet" size="md" fullWidth onClick={onClose}>
            Keep editing
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
