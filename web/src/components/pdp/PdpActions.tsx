'use client';

/**
 * PdpActions — CTA actions: Buy now, Make an offer (with active offer state),
 * Add to Bag, Message seller, Offer to likers, and honest capability state copy.
 */

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { Listing } from '@/lib/contracts/domain';
import type { UseMutationResult } from '@tanstack/react-query';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { Skeleton } from '@/components/ui/Skeleton';
import { OfferToLikers } from './OfferToLikers';
import { formatPrice, timeAgo } from '@/lib/utils/format';

interface PdpActionsProps {
  listing: Listing;
  isOwner: boolean;
  isSold: boolean;
  sellerTrustPending: boolean;
  effectiveStateCopy: { label: string; subtitle: string } | null;
  canMessage: boolean;
  sellerBlocked: boolean;
  activeOffer?: { id: string; amount: number; status: string } | null;
  inBag: boolean;
  onBuyNow: () => void;
  onMakeOffer: () => void;
  onAddToBag: () => void;
  onMessage: () => void;
  withdrawOffer: UseMutationResult<unknown, unknown, string, unknown>;
  showToast: (msg: string, variant?: 'success' | 'error' | 'info') => void;
}

export function PdpActions({
  listing,
  isOwner,
  isSold,
  sellerTrustPending,
  effectiveStateCopy,
  canMessage,
  sellerBlocked,
  activeOffer,
  inBag,
  onBuyNow,
  onMakeOffer,
  onAddToBag,
  onMessage,
  withdrawOffer,
  showToast,
}: PdpActionsProps) {
  const router = useRouter();

  if (isOwner) {
    return (
      <div className="mt-5 flex flex-col gap-2">
        <Badge variant="neutral" icon="pricetag" className="self-start">
          This is your listing
        </Badge>
        <Button variant="secondary" size="lg" fullWidth icon="edit" onClick={() => router.push('/sell')}>
          Manage listing
        </Button>
        <OfferToLikers listing={listing} />
      </div>
    );
  }

  if (isSold) {
    return (
      <div className="mt-5 flex flex-col gap-2">
        <Badge variant="neutral" className="self-start">
          Sold {timeAgo(listing.createdAt) ? `· listed ${timeAgo(listing.createdAt)}` : ''}
        </Badge>
        <p className="text-caption text-text-secondary">
          This item has sold — similar pieces are below.
        </p>
        <Button variant="secondary" size="lg" fullWidth onClick={() => router.push('/explore')}>
          Browse similar items
        </Button>
      </div>
    );
  }

  if (sellerTrustPending) {
    return (
      <div className="mt-5 flex flex-col gap-2" aria-busy aria-label="Checking availability">
        <Skeleton className="h-12 w-full rounded-md" />
        <Skeleton className="h-12 w-full rounded-md" />
      </div>
    );
  }

  if (effectiveStateCopy) {
    return (
      <div className="mt-5 flex flex-col gap-2">
        <Badge
          variant="neutral"
          icon={effectiveStateCopy.label === 'Blocked' ? 'ban' : undefined}
          className="self-start"
        >
          {effectiveStateCopy.label}
        </Badge>
        <p className="text-caption text-text-secondary">{effectiveStateCopy.subtitle}</p>
        <Button variant="secondary" size="lg" fullWidth onClick={() => router.push('/explore')}>
          Browse similar items
        </Button>
        {canMessage && !sellerBlocked ? (
          <Button
            variant="quiet"
            size="sm"
            icon="chat"
            onClick={onMessage}
            className="self-center"
          >
            Message seller
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="mt-5 flex flex-col gap-2">
      <Button
        variant="primary"
        size="lg"
        fullWidth
        onClick={onBuyNow}
      >
        Buy now
      </Button>

      <div className="flex gap-2">
        {activeOffer ? (
          <div className="flex min-w-0 flex-1 items-center gap-2 rounded-md border border-border-subtle px-3 py-2">
            <div className="min-w-0 flex-1">
              <p className="tnum text-body font-semibold text-text-primary">
                Your offer · {formatPrice(activeOffer.amount)}
              </p>
              <p className="clamp-1 text-meta text-text-secondary">
                {activeOffer.status === 'countered'
                  ? 'Countered — reply in Offers'
                  : 'Waiting for the seller'}
              </p>
            </div>
            <Link
              href="/offers"
              className="pressable shrink-0 rounded-md px-2 py-1.5 text-caption font-semibold text-text-secondary hover:text-text-primary"
            >
              Offers
            </Link>
            <button
              type="button"
              disabled={withdrawOffer.isPending}
              onClick={() => {
                withdrawOffer.mutate(activeOffer.id, {
                  onSuccess: () => showToast('Offer withdrawn', 'info'),
                  onError: () => showToast('Could not withdraw the offer — try again.', 'error'),
                });
              }}
              className="pressable shrink-0 rounded-md px-2 py-1.5 text-caption font-semibold text-text-secondary hover:text-danger-text disabled:opacity-40"
            >
              {withdrawOffer.isPending ? 'Withdrawing…' : 'Withdraw'}
            </button>
          </div>
        ) : (
          <Button
            variant="secondary"
            size="md"
            fullWidth
            icon="offer"
            onClick={onMakeOffer}
          >
            Make an offer
          </Button>
        )}
        <IconButton
          name="bag"
          aria-label={inBag ? 'View bag' : 'Add to bag'}
          contained
          onClick={onAddToBag}
        />
      </div>

      <Button variant="quiet" size="sm" icon="chat" onClick={onMessage} className="self-center">
        Message seller
      </Button>
    </div>
  );
}
