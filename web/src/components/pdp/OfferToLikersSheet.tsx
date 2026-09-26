'use client';

/**
 * OfferToLikersSheet — the seller's private discount blast to everyone who
 * liked a listing. Port of the mobile OfferToLikersSheet: item preview,
 * discount presets, custom price, free-shipping toggle, expiry picker,
 * honest summary and a single Send action. Fixture mode hands the payload
 * back to the parent — no backend write happens here.
 */

import { useEffect, useMemo, useState } from 'react';
import { Sheet } from '@/components/ui/Sheet';
import { AppImage } from '@/components/ui/AppImage';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import type { Listing } from '@/lib/contracts/domain';
import { formatPrice } from '@/lib/utils/format';
import { getListingCoverUri } from '@/lib/utils/media';

const DISCOUNT_PRESETS = [10, 15, 20, 25];
const EXPIRY_OPTIONS = [24, 48, 72];

export interface OfferToLikersSendParams {
  listingId: string;
  /** Whole-percent discount off the asking price — derived when a custom
   *  price was authored (can be ≤ 0; offerPrice is canonical). */
  discountPercent: number;
  offerPrice: number;
  includeFreeShipping: boolean;
  expiryHours: number;
  likerCount: number;
}

interface OfferToLikersSheetProps {
  open: boolean;
  onClose: () => void;
  listing: Pick<Listing, 'id' | 'title' | 'price' | 'images' | 'likes'>;
  onSend: (params: OfferToLikersSendParams) => void;
}

export function OfferToLikersSheet({
  open,
  onClose,
  listing,
  onSend,
}: OfferToLikersSheetProps) {
  const [selectedDiscount, setSelectedDiscount] = useState(15);
  const [customPrice, setCustomPrice] = useState('');
  const [useCustomPrice, setUseCustomPrice] = useState(false);
  const [includeFreeShipping, setIncludeFreeShipping] = useState(false);
  const [expiryHours, setExpiryHours] = useState(48);

  // Reset state each time the sheet opens — mirrors the mobile effect,
  // keyed on the listing too so a param swap can't leak authored values.
  useEffect(() => {
    if (open) {
      setSelectedDiscount(15);
      setCustomPrice('');
      setUseCustomPrice(false);
      setIncludeFreeShipping(false);
      setExpiryHours(48);
    }
  }, [open, listing.id]);

  const askingPrice = listing.price;
  const likerCount = listing.likes ?? 0;

  const offerPrice = useMemo(() => {
    if (useCustomPrice) {
      const n = Number.parseFloat(customPrice.replace(',', '.'));
      return Number.isFinite(n) ? n : 0;
    }
    return askingPrice * (1 - selectedDiscount / 100);
  }, [useCustomPrice, customPrice, askingPrice, selectedDiscount]);

  const savings = askingPrice - offerPrice;
  const valid = offerPrice > 0 && likerCount > 0;

  const handleCustomPriceFocus = () => {
    setUseCustomPrice(true);
    setCustomPrice(
      (askingPrice * (1 - selectedDiscount / 100)).toFixed(2),
    );
  };

  const handleSend = () => {
    if (!valid) return;
    const discountPercent = useCustomPrice
      ? Math.round(((askingPrice - offerPrice) / askingPrice) * 100)
      : selectedDiscount;
    onSend({
      listingId: listing.id,
      discountPercent,
      offerPrice: Math.round(offerPrice * 100) / 100,
      includeFreeShipping,
      expiryHours,
      likerCount,
    });
  };

  return (
    <Sheet open={open} onClose={onClose} title="Offer to likers" maxWidth={440}>
      <div className="flex flex-col gap-5 px-5 py-5">
        <p className="text-caption text-text-secondary">
          Send a private discount to {likerCount}{' '}
          {likerCount === 1 ? 'person' : 'people'} who liked this item
        </p>

        {/* Item preview */}
        <div className="flex items-center gap-3">
          <div className="w-14 shrink-0 overflow-hidden rounded-md">
            <AppImage
              src={getListingCoverUri(listing.images)}
              alt={listing.title}
              aspectRatio={0.8}
              sizes="56px"
              className="w-full"
            />
          </div>
          <div className="min-w-0 flex-1">
            <p className="clamp-2 text-body text-text-primary">{listing.title}</p>
            <p className="mt-0.5 text-meta text-text-muted">
              Listed at{' '}
              <span className="tnum">{formatPrice(askingPrice)}</span>
            </p>
          </div>
        </div>

        {/* Discount presets */}
        <div>
          <span className="text-label font-semibold uppercase tracking-wide text-text-secondary">
            Discount
          </span>
          <div className="mt-2 grid grid-cols-2 gap-1.5">
            {DISCOUNT_PRESETS.map((pct) => {
              const active = !useCustomPrice && selectedDiscount === pct;
              const discounted = askingPrice * (1 - pct / 100);
              return (
                <button
                  key={pct}
                  type="button"
                  aria-pressed={active}
                  onClick={() => {
                    setSelectedDiscount(pct);
                    setUseCustomPrice(false);
                  }}
                  className={`pressable flex h-11 items-center justify-center rounded-md border text-caption font-medium ${
                    active
                      ? 'border-brand bg-brand-subtle text-text-primary'
                      : 'border-border bg-surface text-text-secondary hover:bg-surface-raised'
                  }`}
                >
                  {pct}% off ·{' '}
                  <span className="tnum">{formatPrice(Math.round(discounted))}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Custom price — the row swaps to an input once activated so no
            interactive element ever nests inside the button. */}
        {useCustomPrice ? (
          <div className="flex min-h-[48px] items-center justify-between rounded-md bg-surface-alt px-3.5 py-2.5">
            <span className="flex items-center gap-2 text-body text-text-primary">
              <Icon name="edit" size={16} className="text-text-secondary" />
              Custom price
            </span>
            <span className="flex items-center gap-1">
              <span className="tnum text-body text-text-secondary">£</span>
              <input
                type="text"
                inputMode="decimal"
                autoComplete="off"
                autoFocus
                value={customPrice}
                onChange={(e) =>
                  setCustomPrice(e.target.value.replace(/[^0-9.,]/g, ''))
                }
                placeholder="0.00"
                aria-label="Custom offer price"
                className="tnum w-20 bg-transparent text-body font-semibold text-input-text placeholder:text-text-muted focus:outline-none"
              />
            </span>
          </div>
        ) : (
          <button
            type="button"
            onClick={handleCustomPriceFocus}
            className="pressable flex min-h-[48px] items-center justify-between rounded-md bg-surface-alt px-3.5 py-2.5 text-left"
          >
            <span className="flex items-center gap-2 text-body text-text-primary">
              <Icon name="edit" size={16} className="text-text-secondary" />
              Custom price
            </span>
          </button>
        )}

        {/* Free shipping toggle */}
        <div className="flex min-h-[48px] items-center justify-between rounded-md bg-surface-alt px-3.5 py-2.5">
          <div className="flex items-center gap-2.5">
            <Icon
              name="box"
              size={16}
              className={includeFreeShipping ? 'text-success-text' : 'text-text-muted'}
            />
            <div>
              <p className="text-body text-text-primary">Include free shipping</p>
              <p className="text-meta text-text-muted">
                You cover postage to increase acceptance
              </p>
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={includeFreeShipping}
            aria-label="Include free shipping in offer"
            onClick={() => setIncludeFreeShipping((v) => !v)}
            className={`pressable flex h-6 w-11 shrink-0 items-center rounded-full border px-0.5 transition-colors ${
              includeFreeShipping
                ? 'justify-end border-brand bg-brand-subtle'
                : 'justify-start border-border bg-surface'
            }`}
          >
            <span
              className={`h-5 w-5 rounded-full ${
                includeFreeShipping ? 'bg-brand' : 'bg-text-muted'
              }`}
            />
          </button>
        </div>

        {/* Expiry */}
        <div>
          <span className="text-label font-semibold uppercase tracking-wide text-text-secondary">
            Offer valid for
          </span>
          <div className="mt-2 flex gap-1.5">
            {EXPIRY_OPTIONS.map((hours) => (
              <button
                key={hours}
                type="button"
                aria-pressed={expiryHours === hours}
                onClick={() => setExpiryHours(hours)}
                className={`pressable flex h-10 flex-1 items-center justify-center rounded-md border text-body font-medium ${
                  expiryHours === hours
                    ? 'border-brand bg-brand-subtle text-text-primary'
                    : 'border-border bg-surface text-text-secondary hover:bg-surface-raised'
                }`}
              >
                {hours}h
              </button>
            ))}
          </div>
          <p className="mt-2 text-meta text-text-muted">
            Likers have {expiryHours} hours to accept. After that, the offer
            expires automatically.
          </p>
        </div>

        {/* Summary */}
        <dl className="flex flex-col gap-1.5 border-t border-border-subtle pt-4">
          <div className="flex justify-between text-body text-text-secondary">
            <dt>Offer price</dt>
            <dd className="tnum">{formatPrice(offerPrice)}</dd>
          </div>
          <div className="flex justify-between text-body text-text-secondary">
            <dt>Buyer saves</dt>
            <dd className="tnum text-success-text">{formatPrice(Math.max(0, savings))}</dd>
          </div>
          {includeFreeShipping ? (
            <div className="flex justify-between text-body text-text-secondary">
              <dt>Shipping</dt>
              <dd className="text-success-text">Free</dd>
            </div>
          ) : null}
        </dl>

        <p className="flex items-start gap-1.5 text-caption text-text-muted">
          <Icon name="lock" size={13} className="mt-0.5 shrink-0" />
          Each liker receives a private offer. Only one offer per listing at a
          time.
        </p>

        <Button
          variant="primary"
          size="lg"
          fullWidth
          icon="send"
          disabled={!valid}
          onClick={handleSend}
        >
          {valid
            ? `Send to ${likerCount} ${likerCount === 1 ? 'liker' : 'likers'} · ${formatPrice(offerPrice)}`
            : `Send to ${likerCount} ${likerCount === 1 ? 'liker' : 'likers'}`}
        </Button>
      </div>
    </Sheet>
  );
}
