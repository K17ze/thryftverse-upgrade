'use client';

/**
 * Archive cards — the media-first tiles of the poster archive. Port of the
 * mobile PosterArchiveScreen card grammar: 9:16 frame cover, status pill
 * top-left ("Xh left" while live, "Archived" once expired), view + frame
 * count pills top-right, and a quiet relative-date footer with a delete
 * affordance on stories. Highlight cards carry a bookmark pill and title.
 */

import Link from 'next/link';
import { AppImage } from '@/components/ui/AppImage';
import { Icon } from '@/components/ui/Icon';
import { formatCount } from '@/lib/utils/format';
import type {
  PosterArchiveStory,
  PosterHighlight,
} from '@/lib/data/fixtures-posters';

/** "just now" / "3h ago" / "2d ago" / "Mar 4" — Instagram archive grammar. */
function relativeDate(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const mins = Math.max(0, Math.floor((Date.now() - then) / 60_000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
  });
}

function StatusPill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-overlay px-2 py-0.5 text-micro font-semibold text-scrim-text-primary">
      {children}
    </span>
  );
}

function CountPills({
  views,
  frames,
}: {
  views?: number;
  frames: number;
}) {
  if (!views && frames <= 1) return null;
  return (
    <span className="flex flex-col items-end gap-1">
      {views ? (
        <span className="inline-flex items-center gap-1 rounded-full bg-overlay px-2 py-0.5 text-micro font-semibold text-scrim-text-primary">
          <Icon name="eye" size={11} />
          <span className="tnum">{formatCount(views)}</span>
        </span>
      ) : null}
      {frames > 1 ? (
        <span className="inline-flex items-center gap-1 rounded-full bg-overlay px-2 py-0.5 text-micro font-semibold text-scrim-text-primary">
          <Icon name="layers" filled size={11} />
          <span className="tnum">{frames}</span>
        </span>
      ) : null}
    </span>
  );
}

export function ArchiveStoryCard({
  story,
  onDelete,
}: {
  story: PosterArchiveStory;
  onDelete: (story: PosterArchiveStory) => void;
}) {
  const cover = story.frames[0]?.mediaUrl;
  const isActive = story.status === 'active';
  const hoursLeft = Math.max(
    0,
    Math.ceil((new Date(story.expiresAt).getTime() - Date.now()) / 3600e3),
  );

  return (
    <div className="group relative">
      <Link
        href={`/poster/${story.id}`}
        className="pressable block"
        aria-label={`Story with ${story.frames.length} ${
          story.frames.length === 1 ? 'frame' : 'frames'
        }${isActive ? `, ${hoursLeft} hours left` : ', archived'}${
          story.viewCount > 0 ? `, ${story.viewCount} views` : ''
        }`}
      >
        <div className="relative aspect-[9/16] overflow-hidden rounded-lg bg-surface-alt">
          <AppImage
            src={cover}
            alt={story.frames[0]?.caption ?? 'Poster story'}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            className="h-full w-full"
            imgClassName="transition-transform duration-300 group-hover:scale-105"
            fallbackIcon="image"
          />
          <div className="absolute inset-x-0 top-0 flex items-start justify-between p-2">
            {isActive ? (
              <StatusPill>
                <span className="tnum">{hoursLeft}h left</span>
              </StatusPill>
            ) : (
              <StatusPill>Archived</StatusPill>
            )}
            <CountPills views={story.viewCount} frames={story.frames.length} />
          </div>
        </div>
      </Link>
      <div className="flex items-center justify-between pt-1.5">
        <span className="text-meta text-text-muted">
          {relativeDate(story.createdAt)}
        </span>
        <button
          type="button"
          onClick={() => onDelete(story)}
          aria-label={`Delete story from ${relativeDate(story.createdAt)}`}
          className="pressable -mr-2 -mt-1 flex h-11 w-11 items-center justify-center text-text-muted transition-colors hover:text-danger-text"
        >
          <Icon name="trash" size={17} />
        </button>
      </div>
    </div>
  );
}

export function ArchiveHighlightCard({
  highlight,
}: {
  highlight: PosterHighlight;
}) {
  return (
    <Link
      href={`/poster/highlight/${highlight.id}`}
      className="pressable group block"
      aria-label={`Highlight: ${highlight.title}, ${highlight.frames.length} ${
        highlight.frames.length === 1 ? 'frame' : 'frames'
      }`}
    >
      <div className="relative aspect-[9/16] overflow-hidden rounded-lg bg-surface-alt">
        <AppImage
          src={highlight.coverUri}
          alt={highlight.title}
          fill
          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
          className="h-full w-full"
          imgClassName="transition-transform duration-300 group-hover:scale-105"
          fallbackIcon="bookmark"
        />
        <div className="absolute inset-x-0 top-0 flex items-start justify-between p-2">
          <StatusPill>
            <Icon name="bookmark" size={11} />
            Highlight
          </StatusPill>
          <CountPills frames={highlight.frames.length} />
        </div>
      </div>
      <h3 className="clamp-1 pt-1.5 text-body font-medium text-text-primary">
        {highlight.title}
      </h3>
    </Link>
  );
}
