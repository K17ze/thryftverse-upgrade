'use client';

import Link from 'next/link';
import { DATA_MODE } from '@/lib/api/client';

interface HubHeaderProps {
  openCount: number;
  pausedCount: number;
  exitingCount: number;
  totalCount: number;
}

export function HubHeader({
  openCount,
  pausedCount,
  exitingCount,
  totalCount,
}: HubHeaderProps) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div>
        <h1 className="text-editorial-display text-text-primary">Co-Own</h1>
        <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-meta text-text-secondary">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-coown-up" aria-hidden="true" />
            <span className="tnum">
              {openCount} of {totalCount} open
            </span>
          </span>
          {pausedCount > 0 ? (
            <>
              <span aria-hidden="true" className="text-text-muted">·</span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-warning" aria-hidden="true" />
                <span className="tnum">{pausedCount} paused</span>
              </span>
            </>
          ) : null}
          {exitingCount > 0 ? (
            <>
              <span aria-hidden="true" className="text-text-muted">·</span>
              <span className="tnum">{exitingCount} exiting</span>
            </>
          ) : null}
        </p>
      </div>
      <nav aria-label="Co-Own" className="flex items-center gap-5">
        {DATA_MODE !== 'live' ? (
          <Link
            href="/co-own/pools"
            className="text-body font-medium text-text-secondary underline-offset-4 hover:text-text-primary hover:underline"
          >
            Pools
          </Link>
        ) : null}
        <Link
          href="/co-own/leaderboard"
          className="text-body font-medium text-text-secondary underline-offset-4 hover:text-text-primary hover:underline"
        >
          Leaderboard
        </Link>
        <Link
          href="/co-own/ledger"
          className="text-body font-medium text-text-secondary underline-offset-4 hover:text-text-primary hover:underline"
        >
          Tape
        </Link>
        <Link
          href="/co-own/portfolio"
          className="text-body font-medium text-text-secondary underline-offset-4 hover:text-text-primary hover:underline"
        >
          Portfolio
        </Link>
        <Link
          href="/co-own/orders"
          className="text-body font-medium text-text-secondary underline-offset-4 hover:text-text-primary hover:underline"
        >
          Orders
        </Link>
        <Link
          href="/co-own/distributions"
          className="text-body font-medium text-text-secondary underline-offset-4 hover:text-text-primary hover:underline"
        >
          Income
        </Link>
        <Link
          href="/co-own/alerts"
          className="text-body font-medium text-text-secondary underline-offset-4 hover:text-text-primary hover:underline"
        >
          Alerts
        </Link>
        <Link
          href="/co-own/guide"
          className="text-body font-medium text-text-secondary underline-offset-4 hover:text-text-primary hover:underline"
        >
          Guide
        </Link>
        <Link
          href="/co-own/create"
          className="text-body font-medium text-text-primary underline-offset-4 hover:underline"
        >
          Issue
        </Link>
      </nav>
    </header>
  );
}
