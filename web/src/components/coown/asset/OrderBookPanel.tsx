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
 */

import { useState } from 'react';
import { DepthChart } from '@/components/charts';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import type {
  OrderBookLevel,
  OrderBookSnapshot,
  TradeLedgerEntry,
} from '@/lib/contracts/coown';
import { gbp } from '../format';
import { TradeTape } from './TradeLedger';

const MAX_LEVELS = 6;
const TAPE_ROWS = 8;

type BookView = 'book' | 'depth' | 'trades';

const VIEWS: { value: BookView; label: string }[] = [
  { value: 'book', label: 'Book' },
  { value: 'depth', label: 'Depth' },
  { value: 'trades', label: 'Trades' },
];

/** Cumulative units from the best price outward — the fan scale. */
function cumulative(levels: OrderBookLevel[]): number[] {
  const out: number[] = [];
  let cum = 0;
  for (const level of levels) {
    cum += level.units;
    out.push(cum);
  }
  return out;
}

function LevelRow({
  level,
  side,
  cum,
  maxCum,
  onSelect,
}: {
  level: OrderBookLevel;
  side: 'bid' | 'ask';
  /** Cumulative units at this level — the depth-bar fill. */
  cum: number;
  maxCum: number;
  onSelect: (price: number, side: 'buy' | 'sell') => void;
}) {
  const bid = side === 'bid';
  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(level.unitPriceGbp, bid ? 'sell' : 'buy')}
        aria-label={`${bid ? 'Bid' : 'Ask'} ${gbp(level.unitPriceGbp)}, ${level.units} units, ${cum} cumulative. Sets limit price`}
        className="pressable relative grid w-full grid-cols-[5.5rem_4.5rem_minmax(0,1fr)] items-center gap-3 px-1.5 py-2 text-left hover:bg-row"
      >
        <span
          aria-hidden="true"
          className={`absolute inset-y-0.5 ${bid ? 'left-0' : 'right-0'} ${
            bid ? 'bg-coown-up-subtle' : 'bg-coown-down-subtle'
          }`}
          style={{ width: `${Math.min(100, (cum / maxCum) * 100)}%` }}
        />
        <span
          className={`relative text-body font-medium tnum ${
            bid ? 'text-coown-up' : 'text-coown-down'
          }`}
        >
          {gbp(level.unitPriceGbp)}
        </span>
        <span className="relative text-right text-body text-text-primary tnum">
          {level.units}
        </span>
        <span className="relative text-right text-body text-text-secondary tnum">
          {cum}
        </span>
      </button>
    </li>
  );
}

function BookSide({
  side,
  levels,
  cums,
  maxCum,
  onSelect,
}: {
  side: 'bid' | 'ask';
  /** Display order — asks arrive reversed (worst→best, best at spread). */
  levels: OrderBookLevel[];
  /** Cumulative per displayed row, aligned with `levels`. */
  cums: number[];
  maxCum: number;
  onSelect: (price: number, side: 'buy' | 'sell') => void;
}) {
  const bid = side === 'bid';
  return (
    <div>
      <p
        className={`px-1.5 pb-1 pt-2 text-micro font-semibold uppercase tracking-[0.08em] ${
          bid ? 'text-coown-up' : 'text-coown-down'
        }`}
      >
        {bid ? 'Bids' : 'Asks'}
      </p>
      {levels.length === 0 ? (
        <p className="px-1.5 py-3 text-meta text-text-muted">
          No {bid ? 'bids' : 'asks'} on the book
        </p>
      ) : (
        <ul>
          {levels.map((level, i) => (
            <LevelRow
              key={`${side}-${level.unitPriceGbp}`}
              level={level}
              side={side}
              cum={cums[i] ?? level.units}
              maxCum={maxCum}
              onSelect={onSelect}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Spread band — best bid and best ask anchor each edge on their side's
 * tint; the neutral centre carries the spread (with bps) and the last
 * print, coloured by the tick rule (at/above ask → buy lift, at/below
 * bid → sell hit, inside → neutral).
 */
function SpreadBand({
  bestBid,
  bestAsk,
  lastPrice,
}: {
  bestBid: number | null;
  bestAsk: number | null;
  lastPrice: number | null;
}) {
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
        <p className="text-micro font-semibold uppercase tracking-[0.08em] text-text-muted">Bid</p>
        <p className={`text-body-emphasis font-semibold tnum ${bestBid != null ? 'text-coown-up' : 'text-text-muted'}`}>
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
        <p className="text-micro font-semibold uppercase tracking-[0.08em] text-text-muted">Ask</p>
        <p className={`text-body-emphasis font-semibold tnum ${bestAsk != null ? 'text-coown-down' : 'text-text-muted'}`}>
          {gbp(bestAsk)}
        </p>
      </div>
    </div>
  );
}

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
          </p>
        ) : null}
      </div>

      <div
        role="tablist"
        aria-label="Order book view"
        className="mt-2 flex gap-5 border-b border-border-subtle"
      >
        {VIEWS.map((v) => (
          <button
            key={v.value}
            role="tab"
            aria-selected={view === v.value}
            onClick={() => setView(v.value)}
            className={`pressable relative pb-2 text-body-emphasis ${
              view === v.value
                ? 'font-semibold text-text-primary'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            {v.label}
            {view === v.value ? (
              <span aria-hidden="true" className="absolute inset-x-0 -bottom-px h-0.5 bg-text-primary" />
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

          <SpreadBand bestBid={bestBid} bestAsk={bestAsk} lastPrice={lastPrice} />

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
