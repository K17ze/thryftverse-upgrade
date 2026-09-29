'use client';

/**
 * MoodboardBoardCard — the hub's board tiles, port of the mobile
 * MoodboardHomeScreen card grammar:
 *  - OwnedBoardCard — fixed-width rail card, 2×2 collage of the board's
 *    first items (derived cover, no fabricated art), title + item count
 *    + relative update.
 *  - PublicBoardCard — discovery masonry card, editorial cover with a
 *    curator row (avatar + handle + item count).
 */

import Link from 'next/link';
import { AppImage } from '@/components/ui/AppImage';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { timeAgo } from '@/lib/utils/format';

/** Resolved board view-model — the caller maps fixture boards and live
 *  API boards onto the same shape; cards never look up fixtures. */
export interface OwnedBoardCardData {
  id: string;
  title: string;
  isPrivate: boolean;
  itemCount: number;
  createdAt?: string;
  /** Real item image URIs (up to 4 used) — collaged; empty shows the
   *  quiet icon state, never grey placeholder cells. */
  images: string[];
}

export interface PublicBoardCardData {
  id: string;
  title: string;
  coverUri: string;
  aspectRatio: number;
  curator: string | null;
  curatorAvatar: string | null;
  itemCount: number;
}

function CollageCells({ images }: { images: string[] }) {
  const cells = images.slice(0, 4);
  if (cells.length === 0) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-surface-alt text-text-muted">
        <Icon name="images" size={22} />
      </div>
    );
  }
  return (
    <div className="grid h-full w-full grid-cols-2 grid-rows-2">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="relative overflow-hidden">
          {cells[i] ? (
            <AppImage
              src={cells[i]}
              alt=""
              fill
              sizes="110px"
              fallbackIcon="image"
            />
          ) : (
            <div className="h-full w-full bg-surface-alt" />
          )}
        </div>
      ))}
    </div>
  );
}

export function OwnedBoardCard({ board }: { board: OwnedBoardCardData }) {
  return (
    <Link
      href={`/moodboard/${board.id}`}
      className="pressable group block w-40 shrink-0 sm:w-44 lg:w-48"
      aria-label={`Open moodboard ${board.title}`}
    >
      <div className="relative aspect-square overflow-hidden rounded-lg bg-surface-alt">
        <CollageCells images={board.images} />
        {board.isPrivate ? (
          <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-overlay px-2 py-0.5 text-micro font-semibold text-scrim-text-primary">
            <Icon name="lock" size={10} />
            Private
          </span>
        ) : null}
      </div>
      <h3 className="clamp-1 pt-2 text-body font-semibold text-text-primary">
        {board.title}
      </h3>
      <p className="text-meta text-text-muted">
        <span className="tnum">{board.itemCount} items</span>
        {board.createdAt ? ` · ${timeAgo(board.createdAt)}` : ''}
      </p>
    </Link>
  );
}

export function PublicBoardCard({ board }: { board: PublicBoardCardData }) {
  return (
    <Link
      href={`/moodboard/${board.id}`}
      className="pressable group block"
      aria-label={`Open moodboard ${board.title} by @${board.curator ?? 'member'}`}
    >
      <div className="relative overflow-hidden rounded-lg bg-surface-alt">
        <AppImage
          src={board.coverUri}
          alt={board.title}
          aspectRatio={board.aspectRatio}
          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
          className="media-zoom"
          fallbackIcon="images"
        />
      </div>
      <div className="flex items-start gap-2 pt-2">
        <Avatar src={board.curatorAvatar} name={board.curator ?? 'member'} size={28} />
        <div className="min-w-0">
          <h3 className="clamp-1 text-body font-semibold text-text-primary">
            {board.title}
          </h3>
          <p className="clamp-1 text-meta text-text-muted">
            @{board.curator ?? 'member'}
            <span className="tnum"> · {board.itemCount} items</span>
          </p>
        </div>
      </div>
    </Link>
  );
}
