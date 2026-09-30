'use client';

import { Button } from '@/components/ui/Button';
import { Sheet } from '@/components/ui/Sheet';
import { DATA_MODE } from '@/lib/api/client';
import type { CoOwnAsset } from '@/lib/contracts/coown';
import { coOwnMarkGbp } from '@/lib/contracts/coown';
import { gbp } from '../format';
import { FIELD, Row, dateTime } from './BuyoutPrimitives';

interface BuyoutFormSectionProps {
  asset: CoOwnAsset;
  remainingUnits: number;
  priceRaw: string;
  onPriceChange: (val: string) => void;
  unitsRaw: string;
  onUnitsChange: (val: string) => void;
  priceNum: number;
  effectiveUnits: number;
  totalGbp: number | null;
  expiresAt: Date;
  canSubmit: boolean;
  onSubmitClick: () => void;
  confirmOpen: boolean;
  onCloseConfirm: () => void;
  submitting: boolean;
  onConfirmSubmit: () => void;
}

export function BuyoutFormSection({
  asset,
  remainingUnits,
  priceRaw,
  onPriceChange,
  unitsRaw,
  onUnitsChange,
  priceNum,
  effectiveUnits,
  totalGbp,
  expiresAt,
  canSubmit,
  onSubmitClick,
  confirmOpen,
  onCloseConfirm,
  submitting,
  onConfirmSubmit,
}: BuyoutFormSectionProps) {
  return (
    <>
      <section
        aria-labelledby="buyout-form"
        className="mt-8 border-t border-border-subtle pt-6 lg:mt-0 lg:border-t-0 lg:pt-0"
      >
        <h2
          id="buyout-form"
          className="text-micro font-semibold uppercase tracking-[0.08em] text-text-muted"
        >
          Make a buyout offer
        </h2>
        <p className="mt-2 text-body text-text-secondary">
          Submit an offer for the remaining {remainingUnits.toLocaleString()} units. Holders are
          notified and can accept or decline.
        </p>

        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          <div>
            <label htmlFor="buyout-price" className="text-label text-text-muted">
              Offer price (GBP)
            </label>
            <input
              id="buyout-price"
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              value={priceRaw}
              onChange={(e) => onPriceChange(e.target.value)}
              placeholder={`e.g. ${coOwnMarkGbp(asset).toFixed(2)}`}
              className={`mt-2 ${FIELD}`}
            />
          </div>
          <div>
            <label htmlFor="buyout-units" className="text-label text-text-muted">
              Target units
            </label>
            <input
              id="buyout-units"
              type="number"
              inputMode="numeric"
              min={1}
              step={1}
              value={unitsRaw}
              onChange={(e) => onUnitsChange(e.target.value)}
              placeholder={`All remaining (${remainingUnits.toLocaleString()})`}
              className={`mt-2 ${FIELD}`}
            />
            <p className="mt-1.5 text-meta text-text-muted">
              Leave blank to offer on all remaining units.
            </p>
          </div>
        </div>

        {totalGbp != null ? (
          <div className="mt-5 border-t border-border-subtle pt-4">
            <p className="text-body font-semibold text-text-primary tnum">
              {gbp(priceNum)} per unit × {effectiveUnits.toLocaleString()} units ={' '}
              {gbp(totalGbp)} commitment
            </p>
            <div className="mt-1">
              <Row label="Target" value={`${effectiveUnits.toLocaleString()} units`} />
              <Row label="Expires" value={dateTime(expiresAt.toISOString())} />
              <Row label="Settlement" value="1ZE" last />
            </div>
          </div>
        ) : null}

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <p className="text-meta text-text-muted">
            {DATA_MODE === 'live'
              ? 'Offers post to your account — holders are notified and can accept.'
              : 'Preview build — offers are stored on this device only.'}
          </p>
          <Button size="lg" disabled={!canSubmit} onClick={onSubmitClick}>
            Submit offer
          </Button>
        </div>
      </section>

      <Sheet
        open={confirmOpen}
        onClose={onCloseConfirm}
        title="Submit buyout offer?"
        maxWidth={440}
      >
        <div className="p-5">
          {totalGbp != null ? (
            <p className="text-body font-semibold text-text-primary tnum">
              {gbp(priceNum)} per unit × {effectiveUnits.toLocaleString()} units = {gbp(totalGbp)}{' '}
              commitment
            </p>
          ) : null}
          <div className="mt-3">
            <Row label="Target" value={`${effectiveUnits.toLocaleString()} units`} />
            <Row label="Expires" value={dateTime(expiresAt.toISOString())} />
            <Row label="Settlement" value="1ZE" last />
          </div>
          <p className="mt-4 text-meta text-text-muted">
            Holders are notified and can accept or decline. The offer lapses after 24 hours.
          </p>
          <div className="mt-6 flex justify-end gap-3">
            <Button
              variant="secondary"
              size="md"
              disabled={submitting}
              onClick={onCloseConfirm}
            >
              Cancel
            </Button>
            <Button size="md" disabled={submitting} onClick={onConfirmSubmit}>
              {submitting ? 'Submitting…' : 'Submit offer'}
            </Button>
          </div>
        </div>
      </Sheet>
    </>
  );
}
