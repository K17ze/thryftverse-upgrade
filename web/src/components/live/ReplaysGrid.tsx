'use client';

/**
 * Replays grid — past shows as poster + duration chip. Play affordance is
 * a glyph scrim on media; seller + title on the canvas below.
 */

import type { LiveSession } from '@/lib/data/fixtures-media';
import { userById } from '@/lib/data/fixtures';
import { AppImage } from '@/components/ui/AppImage';
import { Icon } from '@/components/ui/Icon';

interface ReplaysGridProps {
  sessions: LiveSession[];
  onPlay: (session: LiveSession) => void;
}

export function ReplaysGrid({ sessions, onPlay }: ReplaysGridProps) {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 lg:grid-cols-4">
      {sessions.map((s) => {
        const seller = userById(s.sellerId);
        return (
          <article key={s.id}>
            <button
              type="button"
              onClick={() => onPlay(s)}
              aria-label={`Replay ${s.title} by @${seller?.username ?? 'seller'}`}
              className="pressable group block w-full text-left"
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
                <p className="mt-1 text-meta text-text-muted">@{seller?.username ?? 'seller'}</p>
              </div>
            </button>
          </article>
        );
      })}
    </div>
  );
}
