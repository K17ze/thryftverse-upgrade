'use client';

/**
 * HostSummary — the post-stream surface: the simulated results the live
 * phase collected (peak viewers, pin clicks, orders) plus the real
 * duration, all honestly labelled. Done returns to the live hub, where
 * the show now sits under Replays for the session.
 */

import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { formatCount } from '@/lib/utils/format';
import { formatClock, type HostStream } from './hostStreams';

interface HostSummaryProps {
  stream: HostStream;
  onDone: () => void;
}

function MetricRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between py-3 ${last ? '' : 'border-b border-border-subtle'}`}>
      <span className="text-body text-text-secondary">{label}</span>
      <span className="tnum text-body-emphasis font-semibold text-text-primary">{value}</span>
    </div>
  );
}

export function HostSummary({ stream, onDone }: HostSummaryProps) {
  const stats = stream.summaryStats;
  const seconds = Math.max(
    0,
    Math.round(((stream.endedAtMs ?? 0) - (stream.startedAtMs ?? stream.endedAtMs ?? 0)) / 1000),
  );

  return (
    <div className="mx-auto flex w-full max-w-[440px] flex-col items-center px-4 py-20 text-center sm:px-6">
      <span className="flex h-16 w-16 items-center justify-center rounded-full bg-surface-alt text-success-text">
        <Icon name="check" filled size={28} />
      </span>
      <h1 className="mt-5 text-screen-title font-bold text-text-primary">Stream ended</h1>
      <p className="mt-1.5 text-meta text-text-muted">
        Simulated results — no real viewers, orders or payouts.
      </p>

      <div className="mt-7 w-full text-left">
        <MetricRow label="Peak viewers" value={stats ? formatCount(stats.peakViewers) : '—'} />
        <MetricRow label="Clicks on pinned items" value={stats ? formatCount(stats.pinClicks) : '—'} />
        <MetricRow label="Orders" value={stats ? String(stats.orders) : '—'} />
        <MetricRow label="Duration" value={formatClock(seconds)} last />
      </div>

      <p className="mt-5 text-meta text-text-muted">
        Your show is listed under Replays on the live hub for this session.
      </p>
      <Button variant="primary" size="lg" fullWidth onClick={onDone} className="mt-4">
        Done
      </Button>
    </div>
  );
}
