'use client';

/**
 * Auction countdown lockups — a chip for cards, a prominent ticking clock
 * for the detail rail. Tabular figures everywhere; the polite live region
 * updates at minute granularity so screen readers are not announced every
 * second alongside the visible clock.
 */

import { Icon } from '@/components/ui/Icon';
import type { AuctionLifecycle, CountdownUrgency } from '@/lib/contracts/auction';
import { formatClock } from '@/lib/data/fixtures-auctions';

const CHIP_TONE: Record<CountdownUrgency, string> = {
  normal: 'text-scrim-text-primary',
  soon: 'text-warning-text',
  final: 'text-danger-text',
  ended: 'text-scrim-text-primary',
};

/** Card chip — "Ends in 2h 14m" / "Starts in 40m" / "Ended". */
export function AuctionCountdownChip({
  label,
  urgency,
}: {
  label: string;
  urgency: CountdownUrgency;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md bg-overlay px-2 py-1 text-meta font-semibold">
      <Icon name="clock" size={12} className="drop-scrim" />
      <span className={`tnum drop-scrim ${CHIP_TONE[urgency]}`}>{label}</span>
    </span>
  );
}

/**
 * Detail clock — ticking H:MM:SS. The visible digits are aria-hidden; the
 * sr-only live region re-renders only when the whole-minute value changes.
 */
export function AuctionCountdownClock({
  ms,
  lifecycle,
}: {
  ms: number;
  lifecycle: AuctionLifecycle;
}) {
  const ended = lifecycle === 'ended';
  const minutes = Math.max(1, Math.ceil(ms / 60_000));

  return (
    <div className="flex items-baseline gap-2" role="timer">
      <span className="sr-only" aria-live="polite">
        {ended ? 'Auction ended' : `${lifecycle === 'live' ? 'Ends' : 'Starts'} in ${minutes}m`}
      </span>
      <span
        aria-hidden
        className={`tnum text-price-hero font-bold leading-none ${
          ended ? 'text-text-muted' : 'text-text-primary'
        }`}
      >
        {ended ? 'Ended' : formatClock(ms)}
      </span>
      {!ended ? (
        <span className="text-meta font-medium uppercase tracking-wide text-text-muted">
          {lifecycle === 'live' ? 'left' : 'to start'}
        </span>
      ) : null}
    </div>
  );
}
