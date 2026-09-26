'use client';

/**
 * OfferSheet — make/counter an offer. Item summary, £ price input, quick
 * suggestion chips, protection-inclusive total, single Send action.
 * Reused by the Offers surface for counter-offers.
 */

import { useEffect, useMemo, useState } from 'react';
import { Sheet } from '@/components/ui/Sheet';
import { AppImage } from '@/components/ui/AppImage';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import type { Listing } from '@/lib/contracts/domain';
import { protectionFeeFor } from '@/lib/data/fixtures-commerce';
import { formatPrice } from '@/lib/utils/format';
import { getListingCoverUri } from '@/lib/utils/media';

interface OfferSheetProps {
  open: boolean;
  onClose: () => void;
  listing: Pick<Listing, 'id' | 'title' | 'price' | 'images' | 'priceWithProtection'>;
  /** Counter mode — the standing offer you're answering. */
  counterTo?: { amount: number; label?: string } | null;
  onSend: (amount: number) => void;
}

export function OfferSheet({ open, onClose, listing, counterTo, onSend }: OfferSheetProps) {
  const [value, setValue] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setValue('');
      setError('');
    }
  }, [open]);

  const numeric = useMemo(() => {
    const n = Number.parseFloat(value.replace(',', '.'));
    return Number.isFinite(n) ? n : NaN;
  }, [value]);

  const valid = Number.isFinite(numeric) && numeric > 0;
  const discountPct = valid ? Math.round(((listing.price - numeric) / listing.price) * 100) : 0;
  const total = valid ? numeric + protectionFeeFor(listing) : 0;

  const suggestions = useMemo(() => {
    const base = counterTo?.amount ?? listing.price;
    const defs = [
      { label: '-10%', pct: 0.1 },
      { label: '-20%', pct: 0.2 },
      { label: '-30%', pct: 0.3 },
    ];
    return defs
      .map((d) => ({ label: d.label, amount: Math.round(base * (1 - d.pct)) }))
      .filter((s) => s.amount > 0 && s.amount < base);
  }, [listing.price, counterTo]);

  const submit = () => {
    if (!valid) {
      setError('Enter an amount above £0.');
      return;
    }
    if (numeric >= listing.price && !counterTo) {
      setError(`At ${formatPrice(listing.price)} or more, Buy now is the better route.`);
      return;
    }
    onSend(Math.round(numeric * 100) / 100);
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={counterTo ? 'Counter offer' : 'Make an offer'}
      maxWidth={440}
    >
      <div className="flex flex-col gap-5 px-5 py-5">
        {/* Item summary */}
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
            <p className="mt-0.5 tnum text-body-emphasis text-text-primary">
              {formatPrice(listing.price)}
            </p>
          </div>
        </div>

        {counterTo ? (
          <p className="text-caption text-text-secondary">
            {counterTo.label ?? 'Their offer'}:{' '}
            <span className="tnum font-semibold text-text-primary">
              {formatPrice(counterTo.amount)}
            </span>
          </p>
        ) : null}

        {/* Price input */}
        <div>
          <label htmlFor="offer-amount" className="text-label font-semibold uppercase tracking-wide text-text-secondary">
            Your offer
          </label>
          <div className="mt-2 flex h-12 items-center rounded-lg border border-border bg-input px-4 focus-within:border-text-muted">
            <span className="tnum text-body-large font-semibold text-text-secondary">£</span>
            <input
              id="offer-amount"
              type="text"
              inputMode="decimal"
              autoComplete="off"
              value={value}
              onChange={(e) => {
                setValue(e.target.value.replace(/[^0-9.,]/g, ''));
                setError('');
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submit();
              }}
              placeholder="0.00"
              aria-invalid={!!error}
              className="tnum ml-1.5 w-full bg-transparent text-body-large font-semibold text-input-text placeholder:text-text-muted focus:outline-none"
            />
            {valid && discountPct > 0 ? (
              <span className="tnum shrink-0 text-caption font-medium text-success-text">
                -{discountPct}%
              </span>
            ) : null}
          </div>
          {error ? (
            <p className="mt-1.5 text-caption text-danger-text" role="alert">
              {error}
            </p>
          ) : null}
          <div className="mt-2.5 flex gap-1.5">
            {suggestions.map((s) => (
              <Chip key={s.label} onClick={() => { setValue(String(s.amount)); setError(''); }}>
                {s.label} · {formatPrice(s.amount)}
              </Chip>
            ))}
          </div>
        </div>

        {/* Total — protection-inclusive, honest about what they'd pay */}
        {valid ? (
          <dl className="flex flex-col gap-1.5 border-t border-border-subtle pt-4">
            <div className="flex justify-between text-body text-text-secondary">
              <dt>Your offer</dt>
              <dd className="tnum">{formatPrice(numeric)}</dd>
            </div>
            <div className="flex justify-between text-body text-text-secondary">
              <dt>Buyer Protection</dt>
              <dd className="tnum">{formatPrice(protectionFeeFor(listing))}</dd>
            </div>
            <div className="flex justify-between text-body-emphasis text-text-primary">
              <dt>You pay if accepted</dt>
              <dd className="tnum font-bold">{formatPrice(total)}</dd>
            </div>
          </dl>
        ) : null}

        <p className="text-caption text-text-muted">
          The seller has 48 hours to respond. Your payment method is only charged if they accept.
        </p>

        <Button variant="primary" size="lg" fullWidth disabled={!valid} onClick={submit}>
          {valid ? `Send offer · ${formatPrice(numeric)}` : 'Send offer'}
        </Button>
      </div>
    </Sheet>
  );
}
