'use client';

/**
 * OfferToLikers — the owner's "offer to likers" affordance on their own
 * PDP (mobile ManageListing row + OfferToLikersSheet). Renders only for
 * active listings with real likers — never a fabricated audience. On send,
 * the fixture session store records the batch and the row flips to an
 * honest sent state for the rest of the session.
 */

import { useEffect, useState } from 'react';
import type { Listing } from '@/lib/contracts/domain';
import { likerOfferFor, recordLikerOffer } from '@/lib/data/fixtures';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { useToast } from '@/components/ui/Toast';
import { formatPrice } from '@/lib/utils/format';
import { OfferToLikersSheet, type OfferToLikersSendParams } from './OfferToLikersSheet';

interface OfferToLikersProps {
  listing: Listing;
}

export function OfferToLikers({ listing }: OfferToLikersProps) {
  const { show } = useToast();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sent, setSent] = useState(() => likerOfferFor(listing.id));

  // The [id] route stays mounted across param changes — re-read the
  // session flag when a different listing slides into the same view.
  useEffect(() => {
    setSent(likerOfferFor(listing.id));
    setSheetOpen(false);
  }, [listing.id]);

  const likerCount = listing.likes ?? 0;
  const isActive =
    !listing.isSold && (listing.status ?? 'active') === 'active';

  // Same gate as mobile ManageListing: sellable listing + real likers.
  if (!isActive || likerCount === 0) return null;

  const handleSend = (params: OfferToLikersSendParams) => {
    const offer = recordLikerOffer({
      listingId: params.listingId,
      discountPercent: params.discountPercent,
      offerPrice: params.offerPrice,
      includeFreeShipping: params.includeFreeShipping,
      expiryHours: params.expiryHours,
      likerCount: params.likerCount,
    });
    setSent(offer);
    setSheetOpen(false);
    show(
      `Offer sent to ${params.likerCount} ${params.likerCount === 1 ? 'liker' : 'likers'}`,
      'success',
    );
  };

  if (sent) {
    return (
      <div className="flex items-start gap-2.5 rounded-lg bg-success-subtle px-3.5 py-3">
        <Icon name="check" filled size={16} className="mt-0.5 shrink-0 text-success-text" />
        <div className="min-w-0">
          <p className="text-caption font-semibold text-text-primary">
            {sent.discountPercent > 0
              ? `${sent.discountPercent}% off`
              : formatPrice(sent.offerPrice)}{' '}
            offer sent to {sent.likerCount}{' '}
            {sent.likerCount === 1 ? 'liker' : 'likers'}
          </p>
          <p className="mt-0.5 text-meta text-text-secondary">
            Private offers expire in {sent.expiryHours}h
            {sent.includeFreeShipping ? ' · free shipping included' : ''}.
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      <Button
        variant="secondary"
        size="lg"
        fullWidth
        icon="heart"
        onClick={() => setSheetOpen(true)}
      >
        Offer to {likerCount} {likerCount === 1 ? 'liker' : 'likers'}
      </Button>
      <OfferToLikersSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        listing={listing}
        onSend={handleSend}
      />
    </>
  );
}
