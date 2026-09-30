'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import type { CoOwnBuyoutOffer } from '@/lib/contracts/coown';
import { gbp } from '../format';
import { FIELD, Row, dateTime } from './BuyoutPrimitives';

interface BuyoutOfferCardProps {
  offer: CoOwnBuyoutOffer;
  referencePriceGbp: number;
  viewerUnits: number;
  accepting: boolean;
  onAccept: (offerId: string, units: number) => void;
}

export function BuyoutOfferCard({
  offer,
  referencePriceGbp,
  viewerUnits,
  accepting,
  onAccept,
}: BuyoutOfferCardProps) {
  const [unitsRaw, setUnitsRaw] = useState('');

  const expired = Date.parse(offer.expiresAt) <= Date.now();
  const filled = offer.status === 'filled';
  const live = offer.status === 'open' && !expired;
  const remainingTarget = Math.max(0, offer.targetUnits - offer.acceptedUnits);
  const maxAccept = Math.min(viewerUnits, remainingTarget);
  const canAccept = live && !offer.mine && maxAccept > 0;

  const units = unitsRaw.trim() ? Math.floor(Number(unitsRaw)) : maxAccept;
  const unitsValid = Number.isFinite(units) && units >= 1 && units <= maxAccept;
  const receiveGbp = unitsValid ? offer.offerPriceGbp * units : null;

  const premiumPct =
    referencePriceGbp > 0
      ? ((offer.offerPriceGbp - referencePriceGbp) / referencePriceGbp) * 100
      : null;

  return (
    <li className="rounded-lg border border-border-subtle p-4">
      <div className="flex items-baseline justify-between gap-3 border-b border-border-subtle pb-3">
        <div className="min-w-0">
          <p className="text-body font-semibold text-text-primary tnum">
            {gbp(offer.offerPriceGbp)} per unit
          </p>
          {premiumPct != null ? (
            <p
              className={`mt-0.5 text-meta tnum ${
                premiumPct >= 0 ? 'text-coown-up' : 'text-danger-text'
              }`}
            >
              {premiumPct >= 0 ? '+' : '−'}
              {Math.abs(premiumPct).toFixed(1)}% vs reference
            </p>
          ) : null}
        </div>
        <span
          className={`shrink-0 text-meta font-semibold ${
            live ? 'text-coown-up' : 'text-text-muted'
          }`}
        >
          {filled ? 'Filled' : expired ? 'Expired' : offer.status === 'withdrawn' ? 'Withdrawn' : 'Open'}
        </span>
      </div>

      <div>
        <Row label="Bidder" value={`@${offer.bidderUsername}`} />
        <Row label="Target" value={`${offer.targetUnits.toLocaleString()} units`} />
        <Row
          label="Accepted"
          value={`${offer.acceptedUnits.toLocaleString()} / ${offer.targetUnits.toLocaleString()} units`}
        />
        <Row label="Remaining" value={`${remainingTarget.toLocaleString()} units`} />
        <Row label="Expires" value={dateTime(offer.expiresAt)} last />
      </div>

      {offer.mine ? (
        <p className="mt-3 text-meta text-text-muted">This is your offer.</p>
      ) : canAccept ? (
        <div className="mt-4">
          <label htmlFor={`accept-${offer.id}`} className="text-meta text-text-secondary">
            Units to accept — max {maxAccept.toLocaleString()}
          </label>
          <input
            id={`accept-${offer.id}`}
            type="number"
            inputMode="numeric"
            min={1}
            max={maxAccept}
            step={1}
            value={unitsRaw}
            onChange={(e) => setUnitsRaw(e.target.value)}
            placeholder={String(maxAccept)}
            className={`mt-1.5 ${FIELD}`}
          />
          <p className="mt-1.5 text-meta text-text-muted">
            {receiveGbp != null
              ? `You receive ${gbp(receiveGbp)} for ${units.toLocaleString()} units.`
              : `Enter 1–${maxAccept.toLocaleString()} units, or leave blank for the maximum.`}
          </p>
          <Button
            size="md"
            className="mt-3 w-full"
            disabled={accepting || (unitsRaw.trim() !== '' && !unitsValid)}
            onClick={() => onAccept(offer.id, units)}
          >
            {accepting ? 'Accepting…' : 'Accept offer'}
          </Button>
        </div>
      ) : live ? (
        <p className="mt-3 text-meta text-text-muted">
          {viewerUnits <= 0
            ? 'You hold no units to accept this offer.'
            : 'You cannot accept this offer.'}
        </p>
      ) : null}
    </li>
  );
}
