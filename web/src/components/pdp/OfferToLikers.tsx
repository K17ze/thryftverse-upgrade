'use client';

/**
 * OfferToLikers — the owner's "offer to likers" affordance on their own
 * PDP (mobile ManageListing row + OfferToLikersSheet). Renders only for
 * active listings with real likers — never a fabricated audience. Live
 * mode posts POST /listings/:id/offers-to-likers and only flips to the
 * sent state on a real fan-out count; fixture mode records the batch in
 * the session store the same way recordSentOffer does.
 */

import { useEffect, useRef, useState } from 'react';
import type { Listing } from '@/lib/contracts/domain';
import { likerOfferFor, recordLikerOffer } from '@/lib/data/fixtures';
import { DATA_MODE } from '@/lib/api/client';
import * as commerceService from '@/lib/api/services/commerce';
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
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(() => likerOfferFor(listing.id));
  // Batch idempotency key — minted once per send attempt and kept across
  // retries so a replay reports the prior fan-out instead of double-sending
  // (mobile offerBatchKeyRef parity). Cleared on success, per listing.
  const batchKeyRef = useRef<string | null>(null);

  // The [id] route stays mounted across param changes — re-read the
  // session flag when a different listing slides into the same view.
  useEffect(() => {
    setSent(likerOfferFor(listing.id));
    setSheetOpen(false);
    batchKeyRef.current = null;
  }, [listing.id]);

  const likerCount = listing.likes ?? 0;
  const isActive =
    !listing.isSold && (listing.status ?? 'active') === 'active';

  // Same gate as mobile ManageListing: sellable listing + real likers.
  if (!isActive || likerCount === 0) return null;

  /** Sent state shared by both modes — the recorded batch becomes the
   *  session-truth banner; `delivered` is the real recipient count. */
  const markSent = (params: OfferToLikersSendParams, delivered: number) => {
    const offer = recordLikerOffer({
      listingId: params.listingId,
      discountPercent: params.discountPercent,
      offerPrice: params.offerPrice,
      includeFreeShipping: params.includeFreeShipping,
      expiryHours: params.expiryHours,
      likerCount: delivered,
    });
    setSent(offer);
    setSheetOpen(false);
    show(
      `Offer sent to ${delivered} ${delivered === 1 ? 'liker' : 'likers'}`,
      'success',
    );
  };

  const handleSend = (params: OfferToLikersSendParams) => {
    if (DATA_MODE === 'live') {
      if (sending) return;
      if (!batchKeyRef.current) {
        batchKeyRef.current =
          typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
            ? `likeroffer_${crypto.randomUUID()}`
            : `likeroffer_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
      }
      setSending(true);
      void commerceService
        .sendOfferToLikers({
          listingId: params.listingId,
          offerPriceGbp: params.offerPrice,
          // Informational only — a custom price above the ask yields a
          // negative percent the schema rejects; offerPriceGbp is canonical.
          discountPercent: params.discountPercent > 0 ? params.discountPercent : undefined,
          includeFreeShipping: params.includeFreeShipping,
          expiryHours: params.expiryHours,
          idempotencyKey: batchKeyRef.current,
        })
        .then((result) => {
          batchKeyRef.current = null;
          if (result.created > 0) {
            markSent(params, result.created);
          } else {
            // Honest empty outcome — every liker was already negotiating
            // or unsaved between load and send. Nothing went out; the
            // sheet closes without claiming a send.
            setSheetOpen(false);
            show('No likers could receive this offer', 'info');
          }
        })
        .catch(() => {
          // Keep the batch key — a retry replays the same idempotency key.
          show('Couldn’t send the offer — try again', 'error');
        })
        .finally(() => setSending(false));
      return;
    }
    // Fixture mode — the session store records the batch; every listed
    // liker receives it (no skip concept without a live offer ledger).
    markSent(params, params.likerCount);
  };

  if (sent) {
    return (
      <div className="flex items-start gap-2.5 rounded-lg bg-success-subtle px-3.5 py-3">
        <Icon name="check" filled size={16} className="mt-0.5 shrink-0 text-success-text" />
        <div className="min-w-0">
          <p className="text-caption font-semibold text-text-primary">
            {sent.discountPercent > 0 ? (
              <span className="tnum">{sent.discountPercent}% off</span>
            ) : (
              <span className="tnum">{formatPrice(sent.offerPrice)}</span>
            )}{' '}
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
        sending={sending}
        onSend={handleSend}
      />
    </>
  );
}
