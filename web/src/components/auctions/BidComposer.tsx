'use client';

/**
 * BidComposer — the auction bidding form: increment ladder, minimum
 * validation, optional proxy maximum bid field, and honest state handling.
 */

import { useState } from 'react';
import type { AuctionViewModel } from '@/lib/contracts/auction';
import { BID_INCREMENT_RATE } from '@/lib/contracts/auction';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { DATA_MODE } from '@/lib/api/client';
import { formatPrice } from '@/lib/utils/format';

const INCREMENT_PCT = Math.round(BID_INCREMENT_RATE * 100);
const stepFrom = (amount: number) => Math.ceil(amount * (1 + BID_INCREMENT_RATE));

interface BidComposerProps {
  auction: AuctionViewModel;
  minimum: number;
  ladder: number[];
  isGuest: boolean;
  pending: boolean;
  submitVariant: 'primary' | 'secondary';
  leading: boolean;
  outbid: boolean;
  proxyMax: number | null;
  input: string;
  onInput: (value: string) => void;
  onQuickBid: (amount: number) => void;
  onSubmit: (event: React.FormEvent, maxBid?: number) => void;
}

export function BidComposer({
  auction,
  minimum,
  ladder,
  isGuest,
  pending,
  submitVariant,
  leading,
  outbid,
  proxyMax,
  input,
  onInput,
  onQuickBid,
  onSubmit,
}: BidComposerProps) {
  const upcoming = auction.lifecycle === 'upcoming';
  const [maxBidOn, setMaxBidOn] = useState(false);
  const [maxBidInput, setMaxBidInput] = useState('');
  const parsed = Number(input.replace(/[^0-9.]/g, ''));
  const invalid = input.trim() !== '' && (!Number.isFinite(parsed) || parsed < minimum);
  const intent = !invalid && input.trim() !== '' && Number.isFinite(parsed) ? parsed : minimum;

  const maxParsed = Number(maxBidInput.replace(/[^0-9.]/g, ''));
  const maxEmpty = maxBidInput.trim() === '';
  const maxInvalid =
    maxBidOn &&
    !maxEmpty &&
    (!Number.isFinite(maxParsed) || maxParsed <= (intent || minimum));
  const maxBid = maxBidOn && !maxEmpty && !maxInvalid ? maxParsed : undefined;

  return (
    <div className="flex flex-col gap-2.5">
      {leading ? (
        <div
          role="status"
          className="flex items-center gap-3 rounded-lg border border-border-subtle bg-success-subtle p-3"
        >
          <Icon name="check" size={18} className="shrink-0 text-success-text" />
          <div className="min-w-0 flex-1">
            <p className="text-caption font-semibold text-success-text">You&apos;re leading</p>
            <p className="tnum text-caption text-text-secondary">
              Top bid {formatPrice(auction.currentBid)}
              {proxyMax != null ? ` · Automatic bidding to ${formatPrice(proxyMax)}` : ''}
            </p>
          </div>
        </div>
      ) : null}

      {outbid ? (
        <div
          role="status"
          className="flex items-center gap-3 rounded-lg border border-danger-border bg-danger-subtle p-3"
        >
          <Icon name="alert" size={18} className="shrink-0 text-danger-text" />
          <div className="min-w-0 flex-1">
            <p className="text-caption font-semibold text-danger-text">You&apos;ve been outbid</p>
            <p className="tnum text-caption text-text-secondary">
              Top bid {formatPrice(auction.currentBid)}
            </p>
          </div>
          <button
            type="button"
            disabled={upcoming}
            onClick={() => onQuickBid(minimum)}
            className="pressable h-9 shrink-0 rounded-md bg-danger px-3 text-caption font-semibold text-scrim-text-primary disabled:opacity-50"
          >
            Re-bid {formatPrice(minimum)}
          </button>
        </div>
      ) : null}

      <p className="text-meta text-text-muted">
        Next bid{' '}
        <span className="tnum font-semibold text-text-primary">{formatPrice(minimum)}</span>{' '}
        or more · {INCREMENT_PCT}% increments
      </p>

      <form
        id="bid"
        onSubmit={(event) => onSubmit(event, maxBid)}
        className="flex scroll-mt-24 flex-col gap-2.5"
      >
        <div className="relative">
          <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-body-large text-text-muted">
            £
          </span>
          <input
            value={input}
            onChange={(event) => onInput(event.target.value)}
            inputMode="decimal"
            placeholder={String(minimum)}
            aria-label="Your bid in pounds"
            aria-invalid={invalid}
            disabled={upcoming}
            className="h-12 w-full rounded-lg border border-border bg-input pl-9 pr-4 text-body-large tnum text-input-text outline-none placeholder:text-text-muted focus:border-text-muted disabled:opacity-50"
          />
        </div>

        {invalid ? (
          <p className="text-caption text-danger-text">
            Bid at least {formatPrice(minimum)} — the current bid plus {INCREMENT_PCT}%.
          </p>
        ) : null}

        {DATA_MODE === 'live' ? (
          <div className="flex flex-col gap-1 self-start">
            <button
              type="button"
              role="switch"
              aria-checked={false}
              disabled
              className="flex h-10 items-center gap-2.5 text-caption font-medium text-text-muted opacity-60"
            >
              <span className="flex h-5 w-5 items-center justify-center rounded-sm border border-border" />
              Set maximum bid
            </button>
            <p className="text-meta text-text-muted">
              Automatic maximum bidding isn&apos;t supported on web yet — your bid commits at the amount you enter.
            </p>
          </div>
        ) : (
          <>
            <button
              type="button"
              role="switch"
              aria-checked={maxBidOn}
              onClick={() => {
                setMaxBidOn((on) => !on);
                if (maxBidOn) setMaxBidInput('');
              }}
              disabled={upcoming}
              className="pressable flex h-10 items-center gap-2.5 self-start text-caption font-medium text-text-primary disabled:opacity-50"
            >
              <span
                className={`flex h-5 w-5 items-center justify-center rounded-sm border ${
                  maxBidOn ? 'border-brand bg-brand text-text-inverse' : 'border-border'
                }`}
              >
                {maxBidOn ? <Icon name="check" size={13} /> : null}
              </span>
              Set maximum bid
              <span className="text-meta font-normal text-text-muted">optional</span>
            </button>
            {maxBidOn ? (
              <>
                <div className="relative">
                  <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-body-large text-text-muted">
                    £
                  </span>
                  <input
                    value={maxBidInput}
                    onChange={(event) => setMaxBidInput(event.target.value)}
                    inputMode="decimal"
                    placeholder={String(stepFrom(intent || minimum))}
                    aria-label="Maximum bid in pounds (optional)"
                    aria-invalid={maxInvalid}
                    disabled={upcoming}
                    className="h-12 w-full rounded-lg border border-border bg-input pl-9 pr-4 text-body-large tnum text-input-text outline-none placeholder:text-text-muted focus:border-text-muted disabled:opacity-50"
                  />
                </div>
                {maxInvalid ? (
                  <p className="text-caption text-danger-text" role="alert">
                    Your maximum must be above the bid you&apos;re placing.
                  </p>
                ) : (
                  <p className="text-meta text-text-muted">
                    We&apos;ll bid the lowest amount needed to keep you in the lead — up to this maximum. Other bidders can&apos;t see it.
                  </p>
                )}
              </>
            ) : null}
          </>
        )}

        <Button
          type="submit"
          variant={submitVariant}
          size="lg"
          fullWidth
          disabled={upcoming || pending || maxInvalid}
        >
          {isGuest
            ? 'Sign in to bid'
            : pending
              ? 'Placing bid…'
              : `Place bid · ${formatPrice(intent)}`}
        </Button>

        {upcoming ? (
          <p className="text-caption text-text-secondary">
            Bidding opens when the auction goes live.
          </p>
        ) : null}
      </form>

      {!upcoming ? (
        <div>
          <p className="mb-2 text-label text-text-muted">Quick bid</p>
          <div className="flex gap-2">
            {ladder.map((amount, index) => (
              <button
                key={amount}
                type="button"
                disabled={upcoming || pending}
                onClick={() => onQuickBid(amount)}
                aria-label={`Bid ${formatPrice(amount)}`}
                className={`pressable h-9 flex-1 rounded-md text-caption font-semibold tnum ${
                  index === 0
                    ? 'bg-brand-subtle text-text-primary hover:bg-brand hover:text-text-inverse'
                    : 'bg-surface-alt text-text-primary hover:bg-surface-raised'
                } disabled:opacity-50`}
              >
                {formatPrice(amount)}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
