import React from 'react';
import { EmptyState } from '../EmptyState';
import { FlagshipEmptyGraphic } from '../flagship';
import { ClosetMediaMosaic } from './ClosetMediaMosaic';
import { ClosetMosaicSkeleton } from './ClosetSkeletons';
import type { Listing } from '../../domain';

interface ClosetListingSectionProps {
  /** True while the first listings sync is in flight (isSyncing && no listings). */
  showSkeleton: boolean;
  items: Listing[];
  onPressItem: (item: Listing) => void;
  onBrowse: () => void;
  /** 'saved' renders the bookmark mosaic + saved empty copy;
   *  'wishlist' renders the heart mosaic + wishlist empty copy. */
  variant: 'saved' | 'wishlist';
}

/**
 * Saved / Wishlist tab body — 3-column media mosaic with 3:4 portrait
 * thumbnails, media-first, over skeleton and empty states.
 */
export function ClosetListingSection({
  showSkeleton,
  items,
  onPressItem,
  onBrowse,
  variant,
}: ClosetListingSectionProps) {
  if (showSkeleton) return <ClosetMosaicSkeleton />;
  if (items.length === 0) {
    return (
      <EmptyState
        graphic={<FlagshipEmptyGraphic variant="bag" size={120} />}
        title={variant === 'saved' ? 'No saved products yet' : 'Your Saved is empty'}
        subtitle={
          variant === 'saved'
            ? 'Tap the bookmark on any product to save it here.'
            : 'Heart items to track price drops and get notified when they go on sale.'
        }
        ctaLabel="Browse"
        onCtaPress={onBrowse}
      />
    );
  }
  return (
    <ClosetMediaMosaic
      items={items}
      onPressItem={onPressItem}
      showSaveButton={variant === 'saved'}
      showWishlistButton={variant === 'wishlist'}
    />
  );
}
