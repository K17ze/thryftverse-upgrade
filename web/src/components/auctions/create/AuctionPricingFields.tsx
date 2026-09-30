'use client';

import { Icon } from '@/components/ui/Icon';
import type { FormErrors } from './CreateAuctionPrimitives';

interface AuctionPricingFieldsProps {
  startingBid: string;
  onStartingBidChange: (value: string) => void;
  buyNowOn: boolean;
  onToggleBuyNow: () => void;
  buyNowInput: string;
  onBuyNowInputChange: (value: string) => void;
  reserveOn: boolean;
  onToggleReserve: () => void;
  reserveInput: string;
  onReserveInputChange: (value: string) => void;
  liveMode: boolean;
  errors: FormErrors;
}

export function AuctionPricingFields({
  startingBid,
  onStartingBidChange,
  buyNowOn,
  onToggleBuyNow,
  buyNowInput,
  onBuyNowInputChange,
  reserveOn,
  onToggleReserve,
  reserveInput,
  onReserveInputChange,
  liveMode,
  errors,
}: AuctionPricingFieldsProps) {
  return (
    <>
      {/* Starting bid */}
      <div className="flex flex-col gap-2">
        <label htmlFor="starting-bid" className="text-label text-text-secondary">
          Starting bid
        </label>
        <div className="relative">
          <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-body-large text-text-muted">
            £
          </span>
          <input
            id="starting-bid"
            value={startingBid}
            onChange={(event) => onStartingBidChange(event.target.value)}
            inputMode="decimal"
            placeholder="0"
            aria-invalid={!!errors.startingBid}
            className="h-12 w-full rounded-lg border border-border bg-input pl-9 pr-4 text-body-large tnum text-input-text outline-none placeholder:text-text-muted focus:border-text-muted"
          />
        </div>
        {errors.startingBid ? (
          <p role="alert" className="text-caption text-danger-text">{errors.startingBid}</p>
        ) : (
          <p className="text-meta text-text-muted">
            Bids step up in 5% increments from your opening number.
          </p>
        )}
      </div>

      {/* Buy now */}
      <div className="flex flex-col gap-2">
        <button
          type="button"
          aria-pressed={buyNowOn}
          onClick={onToggleBuyNow}
          className="pressable flex h-11 items-center gap-2.5 self-start text-body-emphasis font-medium text-text-primary"
        >
          <span
            className={`flex h-5 w-5 items-center justify-center rounded-sm border ${
              buyNowOn ? 'border-brand bg-brand text-text-inverse' : 'border-border'
            }`}
          >
            {buyNowOn ? <Icon name="check" size={13} /> : null}
          </span>
          Buy now price
          <span className="text-meta font-normal text-text-muted">optional</span>
        </button>
        {buyNowOn ? (
          <div className="relative">
            <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-body-large text-text-muted">
              £
            </span>
            <input
              value={buyNowInput}
              onChange={(event) => onBuyNowInputChange(event.target.value)}
              inputMode="decimal"
              placeholder="0"
              aria-label="Buy now price in pounds"
              aria-invalid={!!errors.buyNow}
              className="h-12 w-full rounded-lg border border-border bg-input pl-9 pr-4 text-body-large tnum text-input-text outline-none placeholder:text-text-muted focus:border-text-muted"
            />
          </div>
        ) : null}
        {errors.buyNow ? (
          <p role="alert" className="text-caption text-danger-text">{errors.buyNow}</p>
        ) : null}
      </div>

      {/* Reserve price */}
      <div className="flex flex-col gap-2">
        <button
          type="button"
          aria-pressed={reserveOn}
          onClick={onToggleReserve}
          disabled={liveMode}
          aria-disabled={liveMode}
          className="pressable flex h-11 items-center gap-2.5 self-start text-body-emphasis font-medium text-text-primary disabled:cursor-not-allowed disabled:opacity-60"
        >
          <span
            className={`flex h-5 w-5 items-center justify-center rounded-sm border ${
              reserveOn ? 'border-brand bg-brand text-text-inverse' : 'border-border'
            }`}
          >
            {reserveOn ? <Icon name="check" size={13} /> : null}
          </span>
          Reserve price
          <span className="text-meta font-normal text-text-muted">optional</span>
        </button>
        {liveMode ? (
          <p className="text-meta text-text-muted">
            Reserve pricing isn&apos;t supported on web yet — the auction sells
            to the highest bidder.
          </p>
        ) : null}
        {reserveOn ? (
          <div className="relative">
            <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-body-large text-text-muted">
              £
            </span>
            <input
              value={reserveInput}
              onChange={(event) => onReserveInputChange(event.target.value)}
              inputMode="decimal"
              placeholder="0"
              aria-label="Reserve price in pounds"
              aria-invalid={!!errors.reserve}
              className="h-12 w-full rounded-lg border border-border bg-input pl-9 pr-4 text-body-large tnum text-input-text outline-none placeholder:text-text-muted focus:border-text-muted"
            />
          </div>
        ) : null}
        {errors.reserve ? (
          <p role="alert" className="text-caption text-danger-text">{errors.reserve}</p>
        ) : reserveOn ? (
          <p className="text-meta text-text-muted">
            The lowest hammer you&apos;ll accept — bidders only see whether the
            reserve is met, never the number.
          </p>
        ) : null}
      </div>
    </>
  );
}
