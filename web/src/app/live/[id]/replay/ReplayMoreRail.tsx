'use client';

import Link from 'next/link';
import type { LiveSession } from '@/lib/data/fixtures-media';
import { liveSellerOf } from '@/components/live/useLiveSessions';
import { AppImage } from '@/components/ui/AppImage';
import { Icon } from '@/components/ui/Icon';

/** Slim rail card — same poster grammar as ReplaysGrid, horizontal-cadence
 *  sizing for the watch rail. Deep-links to the next replay. */
export function ReplayRailCard({ session }: { session: LiveSession }) {
  const seller = liveSellerOf(session);
  return (
    <Link
      href={`/live/${encodeURIComponent(session.id)}/replay`}
      aria-label={`Replay ${session.title}${
        seller?.username ? ` by @${seller.username}` : ''
      }`}
      className="pressable group block w-36 shrink-0 sm:w-44"
    >
      <div className="relative aspect-[4/5] w-full overflow-hidden rounded-lg bg-surface-alt">
        <AppImage
          src={session.coverUri}
          alt={session.title}
          fill
          sizes="176px"
          className="h-full w-full"
        />
        <span className="absolute bottom-2 left-2 flex h-8 w-8 items-center justify-center rounded-full text-scrim-text-primary drop-scrim transition-transform duration-150 group-hover:scale-110">
          <Icon name="play" filled size={20} />
        </span>
        {session.durationMinutes != null ? (
          <span className="tnum absolute bottom-2 right-2 rounded-md bg-overlay px-1.5 py-0.5 text-meta font-semibold text-scrim-text-primary">
            {session.durationMinutes} min
          </span>
        ) : null}
      </div>
      <div className="px-0.5 pt-2">
        <h3 className="clamp-2 text-caption font-medium text-text-primary">
          {session.title}
        </h3>
        {seller?.username ? (
          <p className="mt-1 text-meta text-text-muted">@{seller.username}</p>
        ) : null}
      </div>
    </Link>
  );
}

export function ReplayMoreRail({ moreReplays }: { moreReplays: LiveSession[] }) {
  if (moreReplays.length === 0) return null;

  return (
    <section aria-label="More replays" className="mt-10 pb-10">
      <div className="mb-3 border-t border-border-subtle pt-6">
        <h2 className="text-section-title font-semibold text-text-primary">
          More replays
        </h2>
      </div>
      <div className="no-scrollbar -mx-4 flex gap-4 overflow-x-auto px-4 pb-1 sm:-mx-6 sm:px-6">
        {moreReplays.map((s) => (
          <ReplayRailCard key={s.id} session={s} />
        ))}
      </div>
    </section>
  );
}
