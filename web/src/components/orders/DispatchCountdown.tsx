'use client';

/**
 * DispatchCountdown — port of mobile DispatchCountdown. Ticking deadline
 * for the seller's ship-by commitment. The deadline is server-derived;
 * when absent we render an honest muted state rather than inventing one.
 */

import { useEffect, useState } from 'react';
import { Icon } from '@/components/ui/Icon';

type Urgency = 'normal' | 'warning' | 'urgent' | 'overdue';

function resolveUrgency(msRemaining: number): Urgency {
  if (msRemaining <= 0) return 'overdue';
  const hours = msRemaining / 3_600_000;
  if (hours <= 1) return 'urgent';
  if (hours <= 4) return 'warning';
  return 'normal';
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return '';
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes.toString().padStart(2, '0')}m`;
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

const TONE: Record<Urgency, { box: string; ink: string }> = {
  normal: { box: 'bg-surface border-border', ink: 'text-text-primary' },
  warning: { box: 'bg-warning-subtle border-warning-border', ink: 'text-warning-text' },
  urgent: { box: 'bg-danger-subtle border-danger-border', ink: 'text-danger-text' },
  overdue: { box: 'bg-danger-subtle border-danger-border', ink: 'text-danger-text' },
};

export function DispatchCountdown({
  shipByDate,
  shipped,
}: {
  /** Server-derived ship-by deadline (ISO). The only deadline rendered. */
  shipByDate: string | null;
  shipped: boolean;
}) {
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (shipped) return;
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, [shipped]);

  if (shipped) return null;

  const deadlineMs = shipByDate ? new Date(shipByDate).getTime() : NaN;

  if (!Number.isFinite(deadlineMs)) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-border bg-surface px-4 py-2.5">
        <Icon name="clock" size={14} className="text-text-muted" />
        <p className="text-caption text-text-muted">Dispatch deadline unavailable</p>
      </div>
    );
  }

  const msRemaining = deadlineMs - nowMs;
  const urgency = resolveUrgency(msRemaining);
  const tone = TONE[urgency];

  return (
    <div className={`flex items-center gap-2 rounded-lg border px-4 py-2.5 ${tone.box}`}>
      <Icon
        name={urgency === 'overdue' ? 'alert' : 'clock'}
        size={14}
        className={tone.ink}
      />
      <p className={`flex-1 text-caption font-medium ${tone.ink}`}>
        {urgency === 'overdue' ? 'Dispatch overdue' : 'Dispatch within'}
      </p>
      {urgency !== 'overdue' ? (
        <p className={`tnum text-body font-semibold ${tone.ink}`}>
          {formatCountdown(msRemaining)}
        </p>
      ) : null}
    </div>
  );
}
