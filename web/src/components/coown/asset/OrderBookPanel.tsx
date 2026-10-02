'use client';

/**
 * OrderBookPanel — the market's most-scanned surface. Mirrors the mobile
 * CoOwnOrderBook: a single column ladder (asks descending into the mid,
 * bids descending away from it), cumulative depth bars that grow outward
 * from the spread — bids anchored left, asks anchored right — a
 * bid | spread+last | ask band between the sides, and a proportional
 * bid/ask imbalance strip under the ladder.
 *
 * Book / Depth / Trades are three views of the same market data (mobile
 * parity). Rows prefill the trade composer's limit price on click.
 * Every figure comes from the ORDER_BOOKS / MARKET_LEDGER contracts —
 * nothing is fabricated for missing depth.
 * Decomposed into modular domain components (< 400 LOC standard):
 *  - SpreadBand
 *  - BookSide
 *  - DepthChart
 *  - TradeTape
 */

import { useState } from 'react';
import { DepthChart } from '@/components/charts';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import type {
  OrderBookSnapshot,
  TradeLedgerEntry,
} from '@/lib/contracts/coown';
import { gbp } from '../format';
import { TradeTape } from './TradeLedger';
import { SpreadBand } from './orderbook/SpreadBand';
import { BookSide, cumulative } from './orderbook/BookSide';

const MAX_LEVELS = 6;
const TAPE_ROWS = 8;

type BookView = 'book' | 'depth' | 'trades';

const VIEWS: { value: BookView; label: string }[] = [
  { value: 'book', label: 'Book' },
  { value: 'depth', label: 'Depth' },
  { value: 'trades', label: 'Trades' },
];

export function OrderBookPanel({
  book,
  lastPrice = null,
  trades,
  onPickLevel,
}: {
  book: OrderBookSnapshot | null | undefined;
  /** Newest ledger print — drives the tick-rule colour in the spread band. */
  lastPrice?: number | null;
  /** The public tape — powers the Trades view. */
  trades?: TradeLedgerEntry[] | undefined;
  onPickLevel: (price: number, side: 'buy' | 'sell') => void;
}) {
  const [view, setView] = useState<BookView>('book');

  const bids = (book?.bids ?? []).slice(0, MAX_LEVELS);
  // Asks arrive ascending; display reversed so the best ask sits at the
  // spread and cumulative depth fans upward — the classic book silhouette.
  const asks = (book?.asks ?? []).slice(0, MAX_LEVELS);
  const asksDesc = [...asks].reverse();

  const bidCums = cumulative(bids);
  const askCums = cumulative(asks);
  // Align cumulative values to the reversed display order.
  const askCumsDesc = [...askCums].reverse();

  const maxCum = Math.max(
    bidCums[bidCums.length - 1] ?? 0,
    askCums[askCums.length - 1] ?? 0,
    1,
  );
  const bidTotal = bids.reduce((s, l) => s + l.units, 0);
  const askTotal = asks.reduce((s, l) => s + l.units, 0);
  const bidShare = bidTotal + askTotal > 0 ? bidTotal / (bidTotal + askTotal) : null;

  const bestBid = book?.bids[0]?.unitPriceGbp ?? null;
  const bestAsk = book?.asks[0]?.unitPriceGbp ?? null;

  // Full-book totals for the depth view's text summary (the ladder caps
  // at MAX_LEVELS; depth reads every level).
  const bidsAll = book?.bids ?? [];
  const asksAll = book?.asks ?? [];
  const depthBidUnits = bidsAll.reduce((s, l) => s + l.units, 0);
  const depthAskUnits = asksAll.reduce((s, l) => s + l.units, 0);
  const depthLow = bidsAll.at(-1)?.unitPriceGbp ?? null;
  const depthHigh = asksAll.at(-1)?.unitPriceGbp ?? null;

  const bookLoaded = book !== undefined;
  // Null snapshot = no book exists for this market at all (e.g. initial
  // offering) — same honest empty state as a book with no levels.
  const bookEmpty =
    book === null || (book != null && book.bids.length === 0 && book.asks.length === 0);

  return (
    <section aria-label="Order book">
      <div className="flex items-baseline justify-between gap-4">
        <h3 className="text-micro font-semibold uppercase tracking-[0.08em] text-text-muted">
          Order book
        </h3>
        {book ? (
          <p className="text-meta text-text-muted tnum">
            {book.bids.length + book.asks.length} levels · {book.source}
            {book.depthLimits &&
            (book.bids.length >= book.depthLimits.bid ||
              book.asks.length >= book.depthLimits.ask) ? (
              <span> · depth capped</span>
            ) : null}
            {book.reconciliationState === 'reconciling' ? (
              <span className="text-warning-text"> · syncing</span>
            ) : book.reconciliationState === 'break' ? (
              <span className="text-danger-text"> · resyncing</span>
            ) : null}
          </p>
        ) : null}
      </div>

      {/* View switcher — these swap one region, not labelled tabpanels,
          so they're pressed-buttons, not a tablist. */}
      <div
        role="group"
        aria-label="Order book view"
        className="mt-2 flex gap-5 border-b border-border-subtle"
      >
        {VIEWS.map((v) => (
          <button
            key={v.value}
            type="button"
            aria-pressed={view === v.value}
            onClick={() => setView(v.value)}
            className={`pressable relative pb-2 text-body-emphasis ${
              view === v.value
                ? 'font-semibold text-text-primary'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            {v.label}
            {view === v.value ? (
              <span
                aria-hidden="true"
                className="absolute inset-x-0 -bottom-px h-0.5 bg-text-primary"
              />
            ) : null}
          </button>
        ))}
      </div>

      {view === 'trades' ? (
        trades === undefined ? (
          <div className="mt-3 space-y-1.5" aria-hidden="true">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-8 w-full rounded-sm" />
            ))}
          </div>
        ) : trades.length === 0 ? (
          <p className="mt-3 text-body text-text-secondary">
            Nothing has printed yet — executions land here as they clear.
          </p>
        ) : (
          <div className="border-b border-border-subtle">
            <TradeTape entries={trades} limit={TAPE_ROWS} />
          </div>
        )
      ) : !bookLoaded ? (
        <div className="mt-3 space-y-1.5" aria-hidden="true">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-9 w-full rounded-sm" />
          ))}
        </div>
      ) : bookEmpty ? (
        <EmptyState
          compact
          icon="layers"
          title="No orders yet"
          subtitle="Be the first to place a limit order on this market."
        />
      ) : view === 'depth' ? (
        <div className="mt-4">
          <DepthChart bids={book?.bids ?? []} asks={book?.asks ?? []} height={170} />
          {/* The chart's text twin — same numbers, readable without the SVG. */}
          <p className="mt-2 text-meta text-text-muted tnum">
            {depthBidUnits} units bid · {depthAskUnits} units offered
            {depthLow != null && depthHigh != null
              ? ` · ${gbp(depthLow)}–${gbp(depthHigh)} range`
              : ''}
          </p>
        </div>
      ) : (
        <div className="mt-3">
          <div
            aria-hidden="true"
            className="grid grid-cols-[5.5rem_4.5rem_minmax(0,1fr)] gap-3 border-b border-border-subtle px-1.5 pb-1.5 text-micro font-semibold uppercase tracking-[0.08em] text-text-muted"
          >
            <span>Price</span>
            <span className="text-right">Units</span>
            <span className="text-right">Total</span>
          </div>

          <BookSide
            side="ask"
            levels={asksDesc}
            cums={askCumsDesc}
            maxCum={maxCum}
            onSelect={onPickLevel}
          />

          <SpreadBand
            bestBid={bestBid}
            bestAsk={bestAsk}
            lastPrice={lastPrice}
          />

          <BookSide
            side="bid"
            levels={bids}
            cums={bidCums}
            maxCum={maxCum}
            onSelect={onPickLevel}
          />

          {bidShare != null ? (
            <div
              className="mt-3 flex items-center gap-2.5"
              role="img"
              aria-label={`Visible depth: ${Math.round(bidShare * 100)}% bids, ${Math.round((1 - bidShare) * 100)}% asks`}
            >
              <span className="w-9 text-meta font-semibold text-coown-up tnum">
                {Math.round(bidShare * 100)}%
              </span>
              <span className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-coown-down">
                <span
                  className="absolute inset-y-0 left-0 bg-coown-up"
                  style={{ width: `${bidShare * 100}%` }}
                />
              </span>
              <span className="w-9 text-right text-meta font-semibold text-coown-down tnum">
                {Math.round((1 - bidShare) * 100)}%
              </span>
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}
