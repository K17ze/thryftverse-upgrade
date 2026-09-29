'use client';

/**
 * OfferSheet — make/counter an offer. Item summary, £ price input, quick
 * suggestion chips, an expiry selector (24/48/72h — the same options the
 * mobile MakeOfferScreen sends as expiryHours), then a review step that
 * confirms amount + protection + expiry before the write. Reused by the
 * Offers surface and the chat thread for counter-offers.
 */

import { useEffect, useMemo, useState } from 'react';
import { Sheet } from '@/components/ui/Sheet';
import { AppImage } from '@/components/ui/AppImage';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { Icon } from '@/components/ui/Icon';
import type { Listing } from '@/lib/contracts/domain';
import { MAX_OFFER_DISCOUNT_PCT, minOfferAmount } from '@/lib/commerce/offerRules';
import { protectionFeeFor } from '@/lib/data/fixtures-commerce';
import { formatPrice } from '@/lib/utils/format';
import { getListingCoverUri } from '@/lib/utils/media';

/** The expiry grammar the create/counter endpoints accept — mobile
 *  MakeOfferExpirySection's exact option set. */
const EXPIRY_OPTIONS = [24, 48, 72] as const;
const DEFAULT_EXPIRY_HOURS = 48;

interface OfferSheetProps {
  open: boolean;
  onClose: () => void;
  listing: Pick<Listing, 'id' | 'title' | 'price' | 'images' | 'priceWithProtection'>;
  /** Counter mode — the standing offer you're answering. */
  counterTo?: { amount: number; label?: string } | null;
  /** amount + the chosen expiry — callers thread both into the
   *  create/counter payload (expiryHours is a real contract field). */
  onSend: (amount: number, expiryHours: number) => void;
}

export function OfferSheet({ open, onClose, listing, counterTo, onSend }: OfferSheetProps) {
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const [expiryHours, setExpiryHours] = useState<number>(DEFAULT_EXPIRY_HOURS);
  const [reviewing, setReviewing] = useState(false);

  useEffect(() => {
    if (open) {
      setValue('');
      setError('');
      setExpiryHours(DEFAULT_EXPIRY_HOURS);
      setReviewing(false);
    }
  }, [open]);

  const numeric = useMemo(() => {
    const n = Number.parseFloat(value.replace(',', '.'));
    return Number.isFinite(n) ? n : NaN;
  }, [value]);

  const valid = Number.isFinite(numeric) && numeric > 0;
  const discountPct = valid ? Math.round(((listing.price - numeric) / listing.price) * 100) : 0;
  /** Offer floor — first offers can't undercut the ask by more than
   *  MAX_OFFER_DISCOUNT_PCT (marketplace −40% norm, lib/commerce/offerRules).
   *  Counters are exempt: once a thread exists the floor is between the
   *  two parties and the server. */
  const floor = minOfferAmount(listing.price);
  const belowFloor = !counterTo && valid && numeric < floor;
  // Buyer Protection scales with the AGREED amount — the fee is computed
  // on the offer, never the ask, so "You pay if accepted" stays honest.
  const offerFee = valid ? protectionFeeFor({ price: numeric }) : 0;
  const total = valid ? numeric + offerFee : 0;

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

  /** Compose → review. Validation happens on the compose step; the review
   *  step is the last confirmation before the write. */
  const toReview = () => {
    if (!valid) {
      setError('Enter an amount above £0.');
      return;
    }
    if (numeric >= listing.price && !counterTo) {
      setError(`At ${formatPrice(listing.price)} or more, Buy now is the better route.`);
      return;
    }
    if (belowFloor) {
      setError(
        `The lowest offer we can send is ${formatPrice(floor)} — offers can be up to ${MAX_OFFER_DISCOUNT_PCT}% below asking.`,
      );
      return;
    }
    setReviewing(true);
  };

  const itemRow = (
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
  );

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={
        reviewing
          ? counterTo
            ? 'Review counter-offer'
            : 'Review your offer'
          : counterTo
            ? 'Counter offer'
            : 'Make an offer'
      }
      maxWidth={440}
    >
      {reviewing ? (
        /* ── Review step (mobile MakeOfferReviewSheet) — the offer amount
             leads, the counter comparison and expiry sit under it, then the
             honest total and the commitment disclosure. ── */
        <div className="flex flex-col gap-5 px-5 py-5">
          {itemRow}

          <div className="rounded-lg bg-surface-alt px-4 py-3.5">
            <p className="text-label text-text-muted">
              {counterTo ? 'Counter-offer amount' : 'Offer amount'}
            </p>
            <p className="tnum mt-1 text-screen-title text-text-primary">
              {formatPrice(numeric)}
            </p>
            {counterTo ? (
              <p className="mt-2 flex items-center gap-2 border-t border-border-subtle pt-2 text-caption text-text-secondary">
                <span className="tnum">{formatPrice(counterTo.amount)}</span>
                <Icon name="forward" size={13} className="text-text-muted" />
                <span className="tnum font-semibold text-text-primary">
                  {formatPrice(numeric)}
                </span>
              </p>
            ) : null}
            <p className="mt-2 text-caption text-text-muted">
              Valid for {expiryHours} hours — the seller must respond before it expires.
            </p>
          </div>

          <dl className="flex flex-col gap-1.5 border-b border-border-subtle pb-4">
            <div className="flex justify-between text-body text-text-secondary">
              <dt>Buyer Protection</dt>
              <dd className="tnum">{formatPrice(offerFee)}</dd>
            </div>
            <div className="flex justify-between text-body-emphasis text-text-primary">
              <dt>Total</dt>
              <dd className="tnum font-bold">{formatPrice(total)}</dd>
            </div>
          </dl>

          {/* Commitment disclosure — sending an offer is non-binding; a
              payment method is only charged if the seller accepts. */}
          <p className="text-caption text-text-muted">
            Sending an offer takes no payment. If accepted, you&apos;ll be asked to complete
            checkout — your payment method is only charged then.
          </p>

          <div className="flex gap-2">
            <Button variant="secondary" size="lg" onClick={() => setReviewing(false)}>
              Back
            </Button>
            <Button
              variant="primary"
              size="lg"
              className="flex-1"
              onClick={() => onSend(Math.round(numeric * 100) / 100, expiryHours)}
            >
              Confirm {counterTo ? 'counter' : 'offer'} ·{' '}
              <span className="tnum">{formatPrice(numeric)}</span>
            </Button>
          </div>
        </div>
      ) : (
        /* ── Compose step ── */
        <div className="flex flex-col gap-5 px-5 py-5">
          {itemRow}

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
            <label htmlFor="offer-amount" className="text-label text-text-secondary">
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
                  if (e.key === 'Enter') toReview();
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
              <p className="tnum mt-1.5 text-caption text-danger-text" role="alert">
                {error}
              </p>
            ) : belowFloor ? (
              /* Live floor feedback as they type — stated once, no nag. */
              <p className="tnum mt-1.5 text-caption text-text-secondary">
                Lowest we can send is {formatPrice(floor)}.
              </p>
            ) : null}
            {!counterTo ? (
              <p className="mt-1.5 text-meta text-text-muted">
                Offers can be up to {MAX_OFFER_DISCOUNT_PCT}% below asking.
              </p>
            ) : null}
            <div className="mt-2.5 flex gap-1.5">
              {suggestions.map((s) => (
                <Chip key={s.label} onClick={() => { setValue(String(s.amount)); setError(''); }}>
                  {s.label} · <span className="tnum">{formatPrice(s.amount)}</span>
                </Chip>
              ))}
            </div>
          </div>

          {/* Expiry — mobile MakeOfferExpirySection parity: 24/48/72h chips,
              the chosen value feeds expiryHours on the create/counter call. */}
          <div>
            <p className="text-label text-text-secondary">
              Valid for
            </p>
            <div className="mt-2 flex gap-1.5" role="group" aria-label="Offer expiry">
              {EXPIRY_OPTIONS.map((hours) => (
                <Chip
                  key={hours}
                  selected={expiryHours === hours}
                  onClick={() => setExpiryHours(hours)}
                  aria-label={`Offer valid for ${hours} hours`}
                >
                  {hours}h
                </Chip>
              ))}
            </div>
            <p className="mt-1.5 text-meta text-text-muted">
              The seller has {expiryHours} hours to respond.
            </p>
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
                <dd className="tnum">{formatPrice(offerFee)}</dd>
              </div>
              <div className="flex justify-between text-body-emphasis text-text-primary">
                <dt>You pay if accepted</dt>
                <dd className="tnum font-bold">{formatPrice(total)}</dd>
              </div>
            </dl>
          ) : null}

          <p className="text-caption text-text-muted">
            The seller has {expiryHours} hours to respond. Your payment method is only charged
            if they accept.
          </p>

          <Button variant="primary" size="lg" fullWidth disabled={!valid} onClick={toReview}>
            {valid ? (
              <>Review offer · <span className="tnum">{formatPrice(numeric)}</span></>
            ) : (
              'Review offer'
            )}
          </Button>
        </div>
      )}
    </Sheet>
  );
}
