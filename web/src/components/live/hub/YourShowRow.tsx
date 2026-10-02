'use client';

import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { AppImage } from '@/components/ui/AppImage';
import { LiveBadge } from '../LiveBadge';
import { formatScheduled } from '../UpcomingRail';
import { liveSellerOf } from '../useLiveSessions';
import type { LiveSession } from '@/lib/data/fixtures-media';

/** One row of "Your shows" — the shared hairline-list grammar: status
 *  where the clock sits, title, scheduled time, chevron into that show's
 *  host console. */
export function YourShowRow({ session }: { session: LiveSession }) {
  const seller = liveSellerOf(session);
  return (
    <li>
      <Link
        href={`/live/host/${session.id}`}
        aria-label={`Manage “${session.title}” — host console`}
        className="pressable -mx-2 flex items-center gap-3 rounded-md px-2 py-2.5 hover:bg-surface-alt"
      >
        <span className="relative h-11 w-11 shrink-0 overflow-hidden rounded-md bg-surface-alt">
          <AppImage
            src={session.coverUri}
            alt=""
            fill
            sizes="44px"
            className="h-full w-full"
          />
        </span>
        <span className="min-w-0 flex-1">
          <span className="clamp-1 block text-body-emphasis text-text-primary">
            {session.title}
          </span>
          <span className="tnum mt-0.5 block text-meta text-text-muted">
            {session.status === 'upcoming' && session.scheduledAt
              ? formatScheduled(session.scheduledAt)
              : session.status === 'ended'
                ? `Ended${session.durationMinutes != null ? ` · ${session.durationMinutes} min` : ''}`
                : (seller?.username ? `@${seller.username}` : 'On air')}
          </span>
        </span>
        {session.status === 'live' ? (
          <LiveBadge className="shrink-0" />
        ) : (
          <span className="shrink-0 rounded-md bg-surface-alt px-2 py-1 text-meta font-semibold uppercase tracking-wide text-text-secondary">
            {session.status === 'upcoming' ? 'Scheduled' : 'Replay'}
          </span>
        )}
        <Icon name="forward" size={16} className="shrink-0 text-text-muted" />
      </Link>
    </li>
  );
}
