'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { formatCount, formatPrice } from '@/lib/utils/format';
import type { LiveSession } from '@/lib/data/fixtures-media';
import { formatClock } from '../hostStreams';

interface HostBroadcastEndedProps {
  session: LiveSession;
  endSummary: { totalViewers: number; lotsSold: number; totalSales: number } | null;
  startedAtMs: number | null;
}

export function HostBroadcastEnded({ session, endSummary, startedAtMs }: HostBroadcastEndedProps) {
  const router = useRouter();
  const seconds =
    startedAtMs != null ? Math.max(0, Math.floor((Date.now() - startedAtMs) / 1000)) : null;

  return (
    <div className="mx-auto flex w-full max-w-[440px] flex-col items-center px-4 py-20 text-center sm:px-6">
      <Icon name="check" filled size={32} className="text-success-text" />
      <h1 className="mt-5 text-screen-title text-text-primary">Stream ended</h1>
      <p className="mt-1.5 text-meta text-text-muted">
        {endSummary
          ? 'Final totals from the session record.'
          : 'The show is over — totals appear on the session record.'}
      </p>

      <div className="mt-7 w-full text-left">
        {endSummary ? (
          <>
            <div className="flex items-baseline justify-between border-b border-border-subtle py-3">
              <span className="text-body text-text-secondary">Viewers at close</span>
              <span className="tnum text-body-emphasis font-semibold text-text-primary">
                {formatCount(endSummary.totalViewers)}
              </span>
            </div>
            <div className="flex items-baseline justify-between border-b border-border-subtle py-3">
              <span className="text-body text-text-secondary">Lots sold</span>
              <span className="tnum text-body-emphasis font-semibold text-text-primary">
                {endSummary.lotsSold}
              </span>
            </div>
            <div className="flex items-baseline justify-between border-b border-border-subtle py-3">
              <span className="text-body text-text-secondary">Total sales</span>
              <span className="tnum text-body-emphasis font-semibold text-text-primary">
                {formatPrice(endSummary.totalSales)}
              </span>
            </div>
          </>
        ) : null}
        <div className="flex items-baseline justify-between py-3">
          <span className="text-body text-text-secondary">Duration</span>
          <span className="tnum text-body-emphasis font-semibold text-text-primary">
            {seconds != null ? formatClock(seconds) : '—'}
          </span>
        </div>
      </div>

      {session.recordingUrl ? (
        <Link
          href={session.recordingUrl}
          className="pressable mt-2 text-caption font-medium text-text-primary underline-offset-4 hover:underline"
        >
          Watch the recording
        </Link>
      ) : null}
      <Button
        variant="primary"
        size="lg"
        fullWidth
        onClick={() => router.push('/live')}
        className="mt-4"
      >
        Done
      </Button>
    </div>
  );
}
