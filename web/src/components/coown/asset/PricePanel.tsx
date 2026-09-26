'use client';

/**
 * PricePanel — the quote surface: unit price hero in plain language,
 * signed 24h move, the TradingView-style details strip (best bid/ask,
 * spread, day range, volume), the venue disclosure, the window picker
 * and a single clean line chart with a current-price marker.
 *
 * Every figure is a real contract field: top-of-book falls back to the
 * asset snapshot when the book is absent; the day range comes from the
 * 1D candle slice; volume is the asset's 24h traded value. Fields the
 * data doesn't carry are omitted, never zeroed.
 */

import { PriceChart } from '@/components/charts';
import { SegmentedControl } from '@/components/feed/SegmentedControl';
import { Skeleton } from '@/components/ui/Skeleton';
import type {
  CandlePoint,
  CoOwnAsset,
  OrderBookSnapshot,
  PriceWindow,
} from '@/lib/contracts/coown';
import { gbp, gbpCompact, signedPct } from '../format';

const WINDOWS: { value: PriceWindow; label: string }[] = [
  { value: '1D', label: '1D' },
  { value: '1W', label: '1W' },
  { value: '1M', label: '1M' },
  { value: 'ALL', label: 'All' },
];

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'up' | 'down';
}) {
  return (
    <div className="min-w-0">
      <dt className="text-micro font-semibold uppercase tracking-[0.08em] text-text-muted">
        {label}
      </dt>
      <dd
        className={`mt-0.5 text-body tnum ${
          tone === 'up'
            ? 'text-coown-up'
            : tone === 'down'
              ? 'text-coown-down'
              : 'text-text-primary'
        }`}
      >
        {value}
      </dd>
    </div>
  );
}

export function PricePanel({
  asset,
  book,
  history,
  dayHistory,
  window: activeWindow,
  onWindowChange,
}: {
  asset: CoOwnAsset;
  book: OrderBookSnapshot | null | undefined;
  history: CandlePoint[] | undefined;
  /** The 1D candle slice — feeds the day-range stat, whatever window is on the chart. */
  dayHistory: CandlePoint[] | undefined;
  window: PriceWindow;
  onWindowChange: (w: PriceWindow) => void;
}) {
  // Top-of-book: the live snapshot first, then the asset's snapshot
  // fields — both are real contract data.
  const bestBid = book?.bids[0]?.unitPriceGbp ?? asset.bestBidGbp;
  const bestAsk = book?.asks[0]?.unitPriceGbp ?? asset.bestAskGbp;
  const spread = bestBid != null && bestAsk != null ? bestAsk - bestBid : null;

  // Day range — honest min/max over the 1D candle window.
  const dayLow =
    dayHistory != null && dayHistory.length > 0
      ? Math.min(...dayHistory.map((c) => c.l))
      : null;
  const dayHigh =
    dayHistory != null && dayHistory.length > 0
      ? Math.max(...dayHistory.map((c) => c.h))
      : null;

  const move = asset.marketMovePct24h;
  const moveFlat = move != null && Math.abs(move) < 0.05;
  const moveUp = move != null && move >= 0;

  const hasDetails =
    bestBid != null ||
    bestAsk != null ||
    (dayLow != null && dayHigh != null) ||
    asset.volume24hGbp != null;

  return (
    <section aria-label="Price and chart">
      {/* Quote hero — the unit price in natural language first. */}
      <div className="flex flex-wrap items-end gap-x-3 gap-y-1">
        <p className="text-price-hero font-semibold leading-none text-text-primary tnum">
          {gbp(asset.unitPriceGbp)}
        </p>
        <p className="pb-0.5 text-meta text-text-muted">per unit</p>
      </div>
      {move != null ? (
        <p
          className={`mt-1.5 text-body font-medium tnum ${
            moveFlat
              ? 'text-text-secondary'
              : moveUp
                ? 'text-coown-up'
                : 'text-coown-down'
          }`}
        >
          {moveFlat ? null : <span aria-hidden="true">{moveUp ? '▲ ' : '▼ '}</span>}
          {signedPct(move)}{' '}
          <span className="font-normal text-text-muted">past 24h</span>
        </p>
      ) : null}

      {/* Details strip — bid/ask/spread, day range and traded volume on
          one flat hairline row. Any field the data doesn't carry is
          simply absent. */}
      {hasDetails ? (
        <dl className="mt-5 flex flex-wrap gap-x-8 gap-y-3 border-y border-border-subtle py-3.5">
          {bestBid != null ? <Stat label="Bid" value={gbp(bestBid)} tone="up" /> : null}
          {bestAsk != null ? <Stat label="Ask" value={gbp(bestAsk)} tone="down" /> : null}
          {spread != null ? <Stat label="Spread" value={gbp(spread)} /> : null}
          {dayLow != null && dayHigh != null ? (
            <Stat label="Day range" value={`${gbp(dayLow)} – ${gbp(dayHigh)}`} />
          ) : null}
          {asset.volume24hGbp != null ? (
            <Stat label="24h vol" value={gbpCompact(asset.volume24hGbp)} />
          ) : null}
        </dl>
      ) : null}

      {/* Venue truth — this is an issuer-run fractional market, not a
          public exchange; the line keeps the market model explicit. */}
      <p className="mt-3 text-caption text-text-muted">
        Issuer-run fractional market · not a public exchange
      </p>

      <div className="mt-5">
        <SegmentedControl options={WINDOWS} value={activeWindow} onChange={onWindowChange} />
      </div>

      <div className="mt-4">
        {history ? (
          <PriceChart
            data={history}
            ariaLabel={`${asset.title} unit price, ${activeWindow} window`}
            windowLabel={activeWindow}
            currentPrice={asset.unitPriceGbp}
          />
        ) : (
          <Skeleton className="h-[260px] w-full rounded-lg" />
        )}
      </div>
    </section>
  );
}
