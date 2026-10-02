import type { DiscoveryFeedUnit } from '@/lib/contracts/domain';
import {
  resolveListingMediaAspectRatio,
  DEFAULT_LISTING_MEDIA_ASPECT_RATIO,
} from '@/lib/utils/media';
import { DEFAULT_EDITORIAL_ASPECT_RATIO } from '../FeedUnits';

export interface MasonryGridProps {
  units: DiscoveryFeedUnit[];
  columns: number;
  isLoading?: boolean;
  isError?: boolean;
  onRetry?: () => void;
  emptyTitle?: string;
  emptySubtitle?: string;
  emptyActionLabel?: string;
  onEmptyAction?: () => void;
  prioritizeFirst?: boolean;
}

export function unitRatio(unit: DiscoveryFeedUnit): number {
  switch (unit.type) {
    case 'listing':
      return resolveListingMediaAspectRatio(unit.listing) ?? DEFAULT_LISTING_MEDIA_ASPECT_RATIO;
    case 'look':
      return unit.coverAspectRatio ?? 0.75;
    case 'poster':
      return unit.aspectRatio ?? 0.75;
    case 'moodboard':
      return unit.aspectRatio ?? 0.8;
    case 'editorial':
      return unit.aspectRatio ?? DEFAULT_EDITORIAL_ASPECT_RATIO;
    case 'recommendation_break':
      return 0.4;
  }
}

export const MASONRY_ROW_PX = 4;
export const TILE_INFO_ESTIMATE_PX = 64;

export function heightIsDeterministic(unit: DiscoveryFeedUnit): boolean {
  return unit.type !== 'listing' && unit.type !== 'recommendation_break';
}

export function readRowGapPx(el: HTMLElement): number {
  const raw = getComputedStyle(el).getPropertyValue('--density-row-gap').trim();
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) ? Math.max(4, parsed) : 8;
}

export type BandSegment =
  | { kind: 'cols'; units: DiscoveryFeedUnit[] }
  | {
      kind: 'feature';
      lead: DiscoveryFeedUnit;
      span: number;
      companions: DiscoveryFeedUnit[];
      placement: 'lead' | 'trail';
    };
