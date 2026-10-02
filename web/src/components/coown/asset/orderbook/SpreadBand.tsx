'use client';

import { gbp } from '../../format';

interface SpreadBandProps {
  bestBid: number | null;
  bestAsk: number | null;
  lastPrice: number | null;
}

/**
 * Spread band — best bid and best ask anchor each edge on their side's
 * tint; the neutral centre carries the spread (with bps) and the last
 * print, coloured by the tick rule (at/above ask → buy lift, at/below
 * bid → sell hit, inside → neutral).
 */
export function SpreadBand({
  bestBid,
  bestAsk,
  lastPrice,
}: SpreadBandProps) {
  const spread = bestBid != null && bestAsk != null ? bestAsk - bestBid : null;
  const mid = spread != null ? (bestBid! + bestAsk!) / 2 : null;
  const bps = spread != null && mid != null && mid > 0 ? (spread / mid) * 10_000 : null;
  const lastSide =
    lastPrice == null
      ? null
      : bestAsk != null && lastPrice >= bestAsk
        ? 'buy'
        : bestBid != null && lastPrice <= bestBid
          ? 'sell'
          : null;

  return (
    <div
      className="my-1.5 grid grid-cols-[1fr_auto_1fr] items-stretch border-y border-border-subtle"
      aria-label={`Best bid ${gbp(bestBid)}, best ask ${gbp(bestAsk)}${
        spread != null ? `, spread ${gbp(spread)}` : ''
      }`}
    >
      <div
        className={`px-1.5 py-2 ${bestBid != null ? 'bg-coown-up-subtle' : ''}`}
      >
        <p className="text-micro font-semibold uppercase tracking-[0.08em] text-text-muted">
          Bid
        </p>
        <p
          className={`text-body-emphasis font-semibold tnum ${
            bestBid != null ? 'text-coown-up' : 'text-text-muted'
          }`}
        >
          {gbp(bestBid)}
        </p>
      </div>
      <div className="flex min-w-28 flex-col items-center justify-center gap-0.5 px-3 py-2 text-center">
        <p className="text-meta text-text-muted tnum">
          Spread{' '}
          <span className="font-semibold text-text-secondary">
            {spread != null ? gbp(spread) : '—'}
            {bps != null ? ` · ${bps.toFixed(0)}bps` : ''}
          </span>
        </p>
        {lastPrice != null ? (
          <p className="text-meta text-text-muted tnum">
            Last{' '}
            <span
              className={`font-semibold ${
                lastSide === 'buy'
                  ? 'text-coown-up'
                  : lastSide === 'sell'
                    ? 'text-coown-down'
                    : 'text-text-secondary'
              }`}
            >
              {gbp(lastPrice)}
            </span>
          </p>
        ) : null}
      </div>
      <div
        className={`px-1.5 py-2 text-right ${bestAsk != null ? 'bg-coown-down-subtle' : ''}`}
      >
        <p className="text-micro font-semibold uppercase tracking-[0.08em] text-text-muted">
          Ask
        </p>
        <p
          className={`text-body-emphasis font-semibold tnum ${
            bestAsk != null ? 'text-coown-down' : 'text-text-muted'
          }`}
        >
          {gbp(bestAsk)}
        </p>
      </div>
    </div>
  );
}
