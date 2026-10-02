'use client';

/**
 * MoodboardBoardCard — the hub's board tiles, port of the mobile
 * MoodboardHomeScreen card grammar:
 *  - OwnedBoardCard — fixed-width rail card, adaptive collage of the
 *    board's first items (derived cover, no fabricated art) with the
 *    title + item count + relative update overlaid on a scrim.
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

/** One collage cell — the AppImage must carry h-full (its absolute media
 *  can't size the frame) or the cell collapses to a dead dark box. */
function CollageCell({ src, lead }: { src: string; lead?: boolean }) {
  return (
    <div className={`relative overflow-hidden ${lead ? 'row-span-2' : ''}`}>
      <AppImage
        src={src}
        alt=""
        fill
        sizes="110px"
        className="h-full w-full media-zoom"
        fallbackIcon="image"
      />
    </div>
  );
}

/** Adaptive cover collage — the same grammar as the collections card:
 *  ≥4 tiles a 2×2, 3 gives the lead item the left column, 2 splits the
 *  cover, 1 goes full-bleed. A short board never leaves a bare dark
 *  quadrant; an empty board gets a designed quiet state, not a void. */
function CollageCells({ images }: { images: string[] }) {
  const cells = images.slice(0, 4);
  if (cells.length === 0) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 bg-surface-alt text-text-muted">
        <Icon name="images" size={22} />
        <span className="text-micro">Empty board</span>
      </div>
    );
  }
  if (cells.length === 1) {
    return (
      <AppImage
        src={cells[0]}
        alt=""
        fill
        sizes="192px"
        className="h-full w-full media-zoom"
        fallbackIcon="images"
      />
    );
  }
  return (
    <div
      className={`grid h-full w-full gap-0.5 ${
        cells.length === 2 ? 'grid-cols-2 grid-rows-1' : 'grid-cols-2 grid-rows-2'
      }`}
    >
      {cells.map((src, i) => (
        <CollageCell key={i} src={src} lead={cells.length === 3 && i === 0} />
      ))}
    </div>
  );
}

export function OwnedBoardCard({ board }: { board: OwnedBoardCardData }) {
  return (
    <Link
      href={`/moodboard/${board.id}`}
      className="pressable group block w-40 shrink-0 self-start sm:w-44 lg:w-48"
      aria-label={`Open moodboard ${board.title}`}
    >
      <div className="relative aspect-square overflow-hidden rounded-lg bg-surface-alt">
        <CollageCells images={board.images} />
        {/* Media scrim — legibility only, same token grammar as CuratedRail */}
        <div
          className="absolute inset-0 bg-gradient-to-t from-media-overlay-scrim via-transparent to-transparent"
          aria-hidden
        />
        {board.isPrivate ? (
          <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-overlay px-2 py-0.5 text-micro font-semibold text-scrim-text-primary">
            <Icon name="lock" size={10} />
            Private
          </span>
        ) : null}
        <div className="absolute inset-x-0 bottom-0 p-3">
          <h3 className="clamp-1 text-body font-semibold text-scrim-text-primary">
            {board.title}
          </h3>
          <p className="mt-0.5 text-meta text-scrim-text-secondary">
            <span className="tnum">
              {board.itemCount} {board.itemCount === 1 ? 'item' : 'items'}
            </span>
            {board.createdAt ? ` · ${timeAgo(board.createdAt)}` : ''}
          </p>
        </div>
      </div>
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
