'use client';

/**
 * Auction countdown lockups — a chip for cards, a prominent ticking clock
 * for the detail rail. Tabular figures everywhere; the polite live region
 * updates at minute granularity so screen readers are not announced every
 * second alongside the visible clock.
 */

import { Icon } from '@/components/ui/Icon';
import type { AuctionLifecycle, CountdownUrgency } from '@/lib/contracts/auction';

/** Sentence grammar — "2d 5h" / "2h 14m" / "12m 08s" — the web port of
 *  the native formatCountdownSentence
 *  (frontend/src/utils/auctionDetailLogic.ts:1203). Zero-padded seconds
 *  keep the per-second tick from shifting layout. */
function formatCountdownSentence(ms: number): string {
  if (ms <= 0) return 'Ended';
  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
}

/** Under an hour to the hammer — the native countdown bar's danger
 *  threshold (AuctionCountdownBar.tsx:26). */
const URGENT_MS = 60 * 60_000;

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
    <span className="inline-flex items-center gap-1.5 rounded-md bg-overlay/85 px-2.5 py-1 text-meta font-semibold backdrop-blur-md border border-white/10 shadow-sm">
      <Icon name="clock" size={12} className="text-scrim-text-primary drop-scrim" />
      <span className={`tnum drop-scrim ${CHIP_TONE[urgency]}`}>{label}</span>
    </span>
  );
}

/**
 * Detail clock — sentence grammar ("Ends in 2h 14m" / "12m 08s"), matching
 * the native countdown bar. A live clock under an hour turns danger-red;
 * the visible digits are aria-hidden while the sr-only live region
 * re-renders only when the whole-minute value changes.
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
  const urgent = lifecycle === 'live' && !ended && ms > 0 && ms < URGENT_MS;

  return (
    <div className="flex items-baseline gap-2" role="timer">
      <span className="sr-only" aria-live="polite">
        {ended ? 'Auction ended' : `${lifecycle === 'live' ? 'Ends' : 'Starts'} in ${minutes}m`}
      </span>
      <span
        aria-hidden
        className={`tnum text-price-hero font-bold leading-none ${
          ended ? 'text-text-muted' : urgent ? 'text-danger-text' : 'text-text-primary'
        }`}
      >
        {ended
          ? 'Ended'
          : `${lifecycle === 'live' ? 'Ends in' : 'Starts in'} ${formatCountdownSentence(ms)}`}
      </span>
    </div>
  );
}
