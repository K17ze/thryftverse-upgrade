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
import { outfitItemsList, outfitThumbs, outfitListings } from './outfitItems';

interface OutfitCardProps {
  outfit: SavedOutfit;
  onDelete?: (outfit: SavedOutfit) => void;
}

export function OutfitCard({ outfit, onDelete }: OutfitCardProps) {
  const items = outfitListings(outfit);
  const count = outfitItemsList(items).length;
  const cells = outfitThumbs(items, 4);

  return (
    <div className="group relative">
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
                      sizes="(max-width: 640px) 25vw, 15vw"
                      className="h-full w-full transition-transform duration-300 group-hover:scale-105"
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
              sizes="(max-width: 640px) 50vw, 25vw"
              className="h-full w-full transition-transform duration-300 group-hover:scale-105"
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
        <button
          type="button"
          onClick={() => onDelete(outfit)}
          aria-label={`Delete outfit ${outfit.name}`}
          className="pressable absolute left-2 top-2 z-elevated flex h-8 w-8 items-center justify-center rounded-full bg-overlay text-scrim-text-primary opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
        >
          <Icon name="trash" size={15} />
        </button>
      ) : null}
    </div>
  );
}
