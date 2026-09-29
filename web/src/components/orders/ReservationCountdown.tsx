'use client';

/**
 * ReservationCountdown — the ticking checkout-reservation deadline on an
 * unpaid ('created') order. The instant is server-derived
 * (checkout_expires_at / the checkout payload's expiresAt); when it lapses
 * the listing returns to sale and the order is cancelled. Renders nothing
 * without a real deadline — never an invented hold.
 */

import { useEffect, useState } from 'react';
import { Icon } from '@/components/ui/Icon';

function formatCountdown(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}h ${minutes.toString().padStart(2, '0')}m`;
  }
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

export function ReservationCountdown({
  expiresAt,
}: {
  /** Server checkout-reservation deadline (ISO) — the only expiry rendered. */
  expiresAt: string | null | undefined;
}) {
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const deadlineMs = expiresAt ? new Date(expiresAt).getTime() : NaN;
  if (!Number.isFinite(deadlineMs)) return null;

  const expired = deadlineMs <= nowMs;

  return (
    <div
      className={`flex items-center gap-2 rounded-lg border px-4 py-2.5 ${
        expired
          ? 'border-danger-border bg-danger-subtle'
          : 'border-warning-border bg-warning-subtle'
      }`}
    >
      <Icon
        name="clock"
        size={14}
        className={expired ? 'text-danger-text' : 'text-warning-text'}
      />
      <p
        className={`flex-1 text-caption font-medium ${
          expired ? 'text-danger-text' : 'text-warning-text'
        }`}
      >
        {expired
          ? 'This reservation has expired — the listing returns to sale.'
          : 'Held for you — pay before the reservation lapses or the order is cancelled.'}
      </p>
      {!expired ? (
        <p className="tnum text-body font-semibold text-warning-text">
          {formatCountdown(deadlineMs - nowMs)}
        </p>
      ) : null}
    </div>
  );
}
