'use client';

/**
 * Replays grid — past shows as poster + duration chip. Cards deep-link to
 * /live/[id]/replay (a shareable URL members can open in a tab); when the
 * caller passes onPlay, a hover corner affordance still opens the
 * in-context overlay player — the overlay stays the quick-watch path.
 */

import Link from 'next/link';
import type { LiveSession } from '@/lib/data/fixtures-media';
import { liveSellerOf } from './useLiveSessions';
import { AppImage } from '@/components/ui/AppImage';
import { Icon } from '@/components/ui/Icon';

interface ReplaysGridProps {
  sessions: LiveSession[];
  /** In-context overlay preview — optional. Cards always link to the
   *  replay route; this adds a quick-watch affordance that keeps the
   *  overlay one tap away without leaving the hub. */
  onPlay?: (session: LiveSession) => void;
}

export function ReplaysGrid({ sessions, onPlay }: ReplaysGridProps) {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {sessions.map((s) => (
        <ReplayCard key={s.id} session={s} onPlay={onPlay} />
      ))}
    </div>
  );
}

/** One replay card — the poster links to the standalone replay route;
 *  `onPlay` surfaces a hover quick-view chip that opens the overlay. */
function ReplayCard({
  session: s,
  onPlay,
  className = '',
}: {
  session: LiveSession;
  onPlay?: (session: LiveSession) => void;
  className?: string;
}) {
  const seller = liveSellerOf(s);
  return (
    <article className={`group relative ${className}`}>
      <Link
        href={`/live/${encodeURIComponent(s.id)}/replay`}
        aria-label={`Replay ${s.title}${seller?.username ? ` by @${seller.username}` : ''}`}
        className="pressable block w-full text-left"
      >
        <div className="relative aspect-[4/5] w-full overflow-hidden rounded-lg bg-surface-alt">
          <AppImage
            src={s.coverUri}
            alt={s.title}
            fill
            className="h-full w-full"
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
          />
          <span className="absolute bottom-2 left-2 flex h-8 w-8 items-center justify-center rounded-full text-scrim-text-primary drop-scrim transition-transform duration-150 group-hover:scale-110">
            <Icon name="play" filled size={20} />
          </span>
          {s.durationMinutes != null ? (
            <span className="tnum absolute bottom-2 right-2 rounded-md bg-overlay px-1.5 py-0.5 text-meta font-semibold text-scrim-text-primary">
              {s.durationMinutes} min
            </span>
          ) : null}
        </div>
        <div className="px-0.5 pt-2">
          <h3 className="clamp-2 text-body font-medium text-text-primary">{s.title}</h3>
          {seller?.username ? (
            <p className="mt-1 text-meta text-text-muted">@{seller.username}</p>
          ) : null}
        </div>
      </Link>
      {onPlay ? (
        <button
          type="button"
          onClick={() => onPlay(s)}
          aria-label={`Quick view — ${s.title}`}
          className="absolute right-2 top-2 flex h-9 w-9 items-center justify-center rounded-full bg-overlay text-scrim-text-primary opacity-0 transition-opacity duration-150 hover:bg-black/80 focus-visible:opacity-100 group-hover:opacity-100"
        >
          <Icon name="eye" size={18} />
        </button>
      ) : null}
    </article>
  );
}
