'use client';

/**
 * OutfitCard — saved-outfit tile for the /outfits grid.
 * 2×2 item-cover collage (mirrors BoardCard grammar) with a quiet count
 * chip; name + item count + created date below. Optional delete control
 * sits above the stretched link, per the ProductTile pattern.
 */

import Link from 'next/link';
import type { SavedOutfit } from '@/lib/store/outfits';
import { AppImage } from '@/components/ui/AppImage';
import { Icon } from '@/components/ui/Icon';
import { timeAgo } from '@/lib/utils/format';
import { outfitItemsList, outfitThumbs, useOutfitListings } from './outfitItems';

interface OutfitCardProps {
  outfit: SavedOutfit;
  onDelete?: (outfit: SavedOutfit) => void;
}

export function OutfitCard({ outfit, onDelete }: OutfitCardProps) {
  const items = useOutfitListings(outfit);
  const count = outfitItemsList(items).length;
  const cells = outfitThumbs(items, 4);

  return (
    <div className="group relative pressable">
      <Link
        href={`/outfits/${outfit.id}`}
        className="block"
        aria-label={`${outfit.name}, ${count} ${count === 1 ? 'item' : 'items'}`}
      >
        <div
          className="relative overflow-hidden rounded-xl bg-surface-alt"
          style={{ aspectRatio: '0.85' }}
        >
          {cells.length > 1 ? (
            <div className="grid h-full grid-cols-2 grid-rows-2 gap-0.5">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="relative overflow-hidden">
                  {cells[i] ? (
                    <AppImage
                      src={cells[i]}
                      alt=""
                      fill
                      sizes="(max-width: 640px) 25vw, (max-width: 1280px) 15vw, 118px"
                      className="h-full w-full media-zoom"
                    />
                  ) : (
                    <div className="h-full w-full bg-surface-raised" />
                  )}
                </div>
              ))}
            </div>
          ) : (
            <AppImage
              src={cells[0]}
              alt={outfit.name}
              fill
              sizes="(max-width: 640px) 50vw, (max-width: 1280px) 25vw, 236px"
              className="h-full w-full media-zoom"
              fallbackIcon="layers"
            />
          )}
          <span className="tnum absolute right-2 top-2 rounded-md bg-overlay px-2 py-1 text-meta font-semibold text-scrim-text-primary">
            {count}
          </span>
        </div>
        <h3 className="clamp-1 mt-2 text-body-emphasis font-semibold text-text-primary">
          {outfit.name}
        </h3>
        <p className="text-meta text-text-muted">
          {count} {count === 1 ? 'item' : 'items'}
          {outfit.createdAt ? ` · ${timeAgo(outfit.createdAt)}` : ''}
        </p>
      </Link>
      {onDelete ? (
        /* 44px hit area, restrained glyph — drop-scrim legibility on media,
           no chrome circle (ProductTile/EditableTile grammar). quick-actions
           keeps it visible on touch, hover/focus-gated on pointer devices. */
        <button
          type="button"
          onClick={() => onDelete(outfit)}
          aria-label={`Delete outfit ${outfit.name}`}
          className="quick-actions pressable absolute left-0 top-0 z-elevated flex h-11 w-11 items-center justify-center transition-opacity"
        >
          <Icon name="trash" size={17} className="text-scrim-text-primary drop-scrim" />
        </button>
      ) : null}
    </div>
  );
}
