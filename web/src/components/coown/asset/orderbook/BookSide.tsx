'use client';

import type { OrderBookLevel } from '@/lib/contracts/coown';
import { gbp } from '../../format';

/** Cumulative units from the best price outward — the fan scale. */
export function cumulative(levels: OrderBookLevel[]): number[] {
  const out: number[] = [];
  let cum = 0;
  for (const level of levels) {
    cum += level.units;
    out.push(cum);
  }
  return out;
}

interface LevelRowProps {
  level: OrderBookLevel;
  side: 'bid' | 'ask';
  /** Cumulative units at this level — the depth-bar fill. */
  cum: number;
  maxCum: number;
  onSelect: (price: number, side: 'buy' | 'sell') => void;
}

export function LevelRow({
  level,
  side,
  cum,
  maxCum,
  onSelect,
}: LevelRowProps) {
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

interface BookSideProps {
  side: 'bid' | 'ask';
  /** Display order — asks arrive reversed (worst→best, best at spread). */
  levels: OrderBookLevel[];
  /** Cumulative per displayed row, aligned with `levels`. */
  cums: number[];
  maxCum: number;
  onSelect: (price: number, side: 'buy' | 'sell') => void;
}

export function BookSide({
  side,
  levels,
  cums,
  maxCum,
  onSelect,
}: BookSideProps) {
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
