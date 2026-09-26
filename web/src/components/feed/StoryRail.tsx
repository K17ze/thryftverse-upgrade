'use client';

/**
 * StoryRail — port of HomeStoryRail: tall poster cards (76×135 ratio),
 * unwatched ring, unwatched-first ordering, horizontal scroll.
 */

import Link from 'next/link';
import { AppImage } from '@/components/ui/AppImage';
import { Skeleton } from '@/components/ui/Skeleton';
import { STORY_RAIL } from '@/lib/data/fixtures';
import { Avatar } from '@/components/ui/Avatar';

export function StoryRail({ loading }: { loading?: boolean }) {
  const stories = [...STORY_RAIL].sort((a, b) => Number(a.seen ?? false) - Number(b.seen ?? false));
  const unwatched = stories.filter((s) => !s.seen).length;

  if (loading) {
    return (
      <div className="flex gap-2 overflow-hidden px-4 py-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-[135px] w-[76px] shrink-0 rounded-lg" />
        ))}
      </div>
    );
  }

  if (stories.length === 0) return null;

  return (
    <div
      className="no-scrollbar flex gap-2 overflow-x-auto px-4 py-3 sm:px-6"
      role="list"
      aria-label="Poster stories"
    >
      {stories.map((story, idx) => {
        const isUnwatched = !story.seen;
        const showBadge = isUnwatched && idx === 0 && unwatched > 1;
        return (
          <Link
            key={story.id}
            href={`/poster/${story.id}`}
            role="listitem"
            aria-label={`Open poster story by @${story.username}${isUnwatched ? ', new' : ''}`}
            className="pressable group relative shrink-0"
          >
            <div
              className={`h-[135px] w-[76px] overflow-hidden rounded-lg p-[2px] ${
                isUnwatched ? 'bg-gradient-to-b from-brand to-brand/40' : 'bg-border-subtle'
              }`}
            >
              <div className="relative h-full w-full overflow-hidden rounded-[10px]">
                <AppImage
                  src={story.coverUri}
                  alt={`${story.username} poster`}
                  fill
                  sizes="76px"
                  className="h-full w-full"
                />
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-media-overlay-scrim to-transparent p-1.5 pt-6">
                  <span className="clamp-1 block text-[10px] font-medium text-scrim-text-primary">
                    {story.username}
                  </span>
                </div>
                <div className="absolute left-1 top-1">
                  <Avatar src={story.avatar} name={story.username} size={20} ring />
                </div>
              </div>
            </div>
            {showBadge ? (
              <span className="absolute -top-1.5 left-1/2 -translate-x-1/2 rounded-full bg-brand px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-text-inverse">
                New
              </span>
            ) : null}
          </Link>
        );
      })}
    </div>
  );
}
