'use client';

/**
 * ClosetMediaMosaic — the closet's media hero: an asymmetric collage of
 * the member's real listing covers, composed in the profile cover band.
 * One dominant cell leads; satellites stack beside it — the closet itself
 * is the colour, never a flat banner or a grey card.
 *
 * Honest gating: a member's authored cover photo always wins (ProfileHero
 * renders it instead), and the mosaic only composes when the closet
 * carries ≥ MIN usable stills — below that it returns null and the hero
 * degrades to the identity strip. No padded cells, no placeholders.
 *
 * The band links to the closet-as-collection route — the same destination
 * the text banner serves — so the hero is the browse affordance, not
 * decoration.
 */

import Link from 'next/link';
import type { Listing } from '@/lib/contracts/domain';
import { AppImage } from '@/components/ui/AppImage';
import {
  getCategoryFocalPoint,
  getListingCoverUri,
  getPrimaryMedia,
  isUsableUri,
  isVideoUri,
} from '@/lib/utils/media';

/** Below three usable covers the collage reads as sparse, not authored. */
export const CLOSET_MOSAIC_MIN = 3;
const MAX_CELLS = 5;

export interface ClosetMosaicCell {
  src: string;
  focalPoint: { x: number; y: number };
}

/**
 * Usable still covers in listing order — first image per listing, video
 * covers and empty URIs dropped, repeats removed (a duplicated photo reads
 * as a seam bug, not a pattern). The caller controls the pool order —
 * for-sale first keeps the hero shoppable, not an archive of sold media.
 */
export function closetMosaicCells(items: Listing[], max = MAX_CELLS): ClosetMosaicCell[] {
  const cells: ClosetMosaicCell[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    if (cells.length >= max) break;
    const src = getListingCoverUri(item.images);
    if (!isUsableUri(src) || isVideoUri(src) || seen.has(src)) continue;
    seen.add(src);
    cells.push({
      src,
      focalPoint:
        getPrimaryMedia(item)?.focalPoint ?? getCategoryFocalPoint(item.category),
    });
  }
  return cells;
}

function Cell({
  cell,
  className = '',
  sizes,
  priority,
}: {
  cell: ClosetMosaicCell;
  className?: string;
  sizes: string;
  priority?: boolean;
}) {
  return (
    <div className={`relative overflow-hidden ${className}`}>
      <AppImage
        src={cell.src}
        alt=""
        fill
        sizes={sizes}
        focalPoint={cell.focalPoint}
        priority={priority}
        className="media-zoom h-full w-full"
      />
    </div>
  );
}

interface ClosetMediaMosaicProps {
  cells: ClosetMosaicCell[];
  /** Closet owner — the band routes to their closet-as-collection. */
  ownerId: string;
  username: string;
  /** Live listing count for the accessible label. */
  itemCount?: number;
}

export function ClosetMediaMosaic({
  cells,
  ownerId,
  username,
  itemCount,
}: ClosetMediaMosaicProps) {
  if (cells.length < CLOSET_MOSAIC_MIN) return null;
  const [lead, ...rest] = cells;

  return (
    <Link
      href={`/collection/closet-${ownerId}`}
      aria-label={`Browse @${username}'s closet${itemCount != null ? `, ${itemCount} items` : ''}`}
      className="group relative block h-40 overflow-hidden bg-surface-alt focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-text-primary sm:h-52"
    >
      <div className="flex h-full gap-0.5">
        {/* Dominant cell — the lead listing carries the band. */}
        <Cell
          cell={lead}
          className={`h-full ${
            rest.length === 2 ? 'w-[56%]' : rest.length === 3 ? 'w-[48%]' : 'w-[42%]'
          }`}
          sizes="(max-width: 640px) 56vw, 45vw"
          priority
        />
        {rest.length === 2 ? (
          <div className="flex h-full flex-1 flex-col gap-0.5">
            <Cell cell={rest[0]} className="h-1/2" sizes="44vw" />
            <Cell cell={rest[1]} className="h-1/2" sizes="44vw" />
          </div>
        ) : rest.length === 3 ? (
          <>
            <div className="flex h-full flex-1 flex-col gap-0.5">
              <Cell cell={rest[0]} className="h-1/2" sizes="26vw" />
              <Cell cell={rest[1]} className="h-1/2" sizes="26vw" />
            </div>
            <Cell cell={rest[2]} className="h-full w-[26%]" sizes="26vw" />
          </>
        ) : (
          <>
            <div className="flex h-full w-[29%] flex-col gap-0.5">
              <Cell cell={rest[0]} className="h-1/2" sizes="29vw" />
              <Cell cell={rest[1]} className="h-1/2" sizes="29vw" />
            </div>
            <div className="flex h-full flex-1 flex-col gap-0.5">
              <Cell cell={rest[2]} className="h-1/2" sizes="29vw" />
              <Cell cell={rest[3]} className="h-1/2" sizes="29vw" />
            </div>
          </>
        )}
      </div>

      {/* Media scrims — top fade for floating-control contrast, bottom
          fade softens the avatar seam (same grammar as the cover band). */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-black/30 to-transparent"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-black/10 to-transparent"
      />
    </Link>
  );
}
