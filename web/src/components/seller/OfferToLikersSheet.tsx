'use client';

/**
 * OfferToLikersSheet — mobile OfferToLikersSheet parity. The seller picks
 * a discounted price (preset % or custom), an expiry, and whether postage
 * is on them; the fan-out goes through POST /listings/:id/offers-to-likers
 * (live) or the session-local batch record (demo — disclosed).
 */

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { Sheet } from '@/components/ui/Sheet';
import {
  useSendOfferToLikers,
  type OfferToLikersOutcome,
} from '@/lib/hooks/seller-queries';
import { formatPrice } from '@/lib/utils/format';
import type { Listing } from '@/lib/contracts/domain';

const DISCOUNTS = [10, 15, 20, 25];
const EXPIRIES = [24, 48, 72];

const round2 = (v: number) => Math.round(v * 100) / 100;

interface OfferToLikersSheetProps {
  open: boolean;
  listing: Listing | null;
  likerCount: number;
  onClose: () => void;
}

export function OfferToLikersSheet({
  open,
  listing,
  likerCount,
  onClose,
}: OfferToLikersSheetProps) {
  const send = useSendOfferToLikers();
  const [discount, setDiscount] = useState<number | null>(15);
  const [custom, setCustom] = useState('');
  const [freeShipping, setFreeShipping] = useState(false);
  const [expiryHours, setExpiryHours] = useState(48);
  const [outcome, setOutcome] = useState<OfferToLikersOutcome | null>(null);

  useEffect(() => {
    if (open) {
      setDiscount(15);
      setCustom('');
      setFreeShipping(false);
      setExpiryHours(48);
      setOutcome(null);
    }
  }, [open]);

  const price = listing?.price ?? 0;
  const customPrice = Number(custom.replace(/[^0-9.]/g, ''));
  const usingCustom = custom.trim() !== '';

  /** The offer price is the canonical figure — discount chips are just a
   *  shorthand for it (the API carries offerPriceGbp). */
  const offerPrice = useMemo(() => {
    if (usingCustom) return Number.isFinite(customPrice) ? round2(customPrice) : null;
    if (discount != null) return round2(price * (1 - discount / 100));
    return null;
  }, [usingCustom, customPrice, discount, price]);

  const offerValid =
    offerPrice != null && offerPrice >= 0.5 && offerPrice < price;
  const computedDiscountPct =
    offerPrice != null && price > 0
      ? Math.max(0, Math.round((1 - offerPrice / price) * 100))
      : null;

  const submit = () => {
    if (!listing || offerPrice == null || !offerValid) return;
    send.mutate(
      {
        listingId: listing.id,
        listingTitle: listing.title,
        offerPriceGbp: offerPrice,
        discountPct: computedDiscountPct,
        likerCount,
        includeFreeShipping: freeShipping,
        expiryHours,
      },
      { onSuccess: setOutcome },
    );
  };

  return (
    <Sheet open={open} onClose={onClose} title="Send an offer to likers" maxWidth={480}>
      <div className="px-5 pb-6 pt-1">
        {outcome ? (
          <>
            <p className="text-body text-text-primary">
              {outcome.created > 0
                ? `Offer sent to ${outcome.created} of ${outcome.likerCount} liker${outcome.likerCount === 1 ? '' : 's'}.`
                : `No likers could be reached — ${outcome.skipped} skipped.`}
            </p>
            {outcome.demo ? (
              <p className="mt-2 text-meta text-text-muted">
                Demo mode — the batch is recorded on this device; no offers were sent.
              </p>
            ) : null}
            <div className="mt-6 flex justify-end">
              <Button variant="primary" size="md" onClick={onClose}>
                Done
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="text-body text-text-secondary">
              {likerCount > 0
                ? `${likerCount} ${likerCount === 1 ? 'person has' : 'people have'} liked “${listing?.title}”. They'll get a private offer at your chosen price.`
                : `Everyone who liked “${listing?.title}” gets a private offer at your chosen price.`}
            </p>

            <span className="mt-5 block text-caption font-medium text-text-secondary">
              Offer price
            </span>
            <div className="mt-1.5 flex flex-wrap gap-1.5" role="group" aria-label="Discount">
              {DISCOUNTS.map((d) => (
                <Chip
                  key={d}
                  selected={!usingCustom && discount === d}
                  onClick={() => {
                    setDiscount(d);
                    setCustom('');
                  }}
                >
                  {d}% off
                </Chip>
              ))}
            </div>
            <div className="relative mt-3 max-w-[180px]">
              <span className="tnum pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-body text-text-muted">
                £
              </span>
              <input
                type="text"
                inputMode="decimal"
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                placeholder="Or enter a price"
                aria-label="Custom offer price"
                className="tnum h-11 w-full rounded-md border border-border bg-surface pl-7 pr-3 text-body text-text-primary placeholder:text-text-muted focus:border-text-muted focus:outline-none"
              />
            </div>
            {offerPrice != null ? (
              <p className="tnum mt-2 text-body text-text-primary">
                {formatPrice(offerPrice)}
                {computedDiscountPct != null && computedDiscountPct > 0 ? (
                  <span className="text-meta text-text-muted">
                    {' '}
                    · {computedDiscountPct}% below {formatPrice(price)}
                  </span>
                ) : null}
              </p>
            ) : null}
            {usingCustom && offerPrice != null && !offerValid ? (
              <p className="mt-1.5 text-caption font-medium text-danger-text" role="alert">
                Offer must be between £0.50 and below {formatPrice(price)}
              </p>
            ) : null}

            <span className="mt-5 block text-caption font-medium text-text-secondary">
              Expires
            </span>
            <div className="mt-1.5 flex gap-1.5" role="group" aria-label="Offer expiry">
              {EXPIRIES.map((h) => (
                <Chip key={h} selected={expiryHours === h} onClick={() => setExpiryHours(h)}>
                  {h}h
                </Chip>
              ))}
            </div>

            <button
              type="button"
              role="switch"
              aria-checked={freeShipping}
              onClick={() => setFreeShipping((v) => !v)}
              className="pressable mt-5 flex w-full items-center justify-between rounded-md py-1 text-left"
            >
              <span>
                <span className="block text-body text-text-primary">Include free shipping</span>
                <span className="mt-0.5 block text-meta text-text-muted">
                  Postage comes out of your payout on accepted offers
                </span>
              </span>
              <span
                aria-hidden
                className={`relative h-6 w-11 rounded-full transition-colors ${
                  freeShipping ? 'bg-brand' : 'bg-surface-raised'
                }`}
              >
                <span
                  className={`absolute top-0.5 h-5 w-5 rounded-full bg-surface transition-transform ${
                    freeShipping ? 'translate-x-[22px]' : 'translate-x-0.5'
                  }`}
                />
              </span>
            </button>

            <div className="mt-6 flex justify-end gap-2">
              <Button variant="quiet" size="md" onClick={onClose} disabled={send.isPending}>
                Cancel
              </Button>
              <Button
                variant="primary"
                size="md"
                onClick={submit}
                disabled={!offerValid || likerCount === 0 || send.isPending}
                aria-busy={send.isPending}
              >
                {send.isPending
                  ? 'Sending…'
                  : `Send to ${likerCount} liker${likerCount === 1 ? '' : 's'}`}
              </Button>
            </div>
          </>
        )}
      </div>
    </Sheet>
  );
}
