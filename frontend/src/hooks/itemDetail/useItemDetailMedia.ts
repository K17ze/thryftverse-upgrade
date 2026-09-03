import { useCallback, useState } from 'react';
import { ProductAnalytics } from '../../platform/product';
import type { Listing } from '../../services/listingsApi';

export interface ItemDetailMediaContext {
  /** The resolved listing (used for mediaZoom analytics). */
  listing: Listing | null;
}

export interface ItemDetailMediaResult {
  /** Currently active image index (drives the thumbnail strip + viewer). */
  activeIndex: number;
  /** Set the active image index (from onViewableItemsChanged / viewer). */
  setActiveIndex: (index: number) => void;
  /** Whether the full-screen media viewer is visible. */
  isViewerVisible: boolean;
  /** Open the full-screen viewer at a given index. */
  openViewer: (index: number) => void;
  /** Close the full-screen viewer. */
  closeViewer: () => void;
}

/**
 * Owns the media-stage state for the item detail screen: the active image
 * index and the full-screen viewer visibility. The spring-driven pagination
 * SharedValue remains in the screen because it is tightly coupled to the
 * Reanimated scroll handler; this hook owns the discrete integer state that
 * feeds it.
 */
export function useItemDetailMedia(
  ctx: ItemDetailMediaContext,
): ItemDetailMediaResult {
  const { listing: item } = ctx;
  const [activeIndex, setActiveIndexState] = useState(0);
  const [isViewerVisible, setIsViewerVisible] = useState(false);

  const setActiveIndex = useCallback((index: number) => {
    setActiveIndexState(index);
  }, []);

  const openViewer = useCallback((index: number) => {
    setActiveIndexState(index);
    setIsViewerVisible(true);
    if (item) ProductAnalytics.mediaZoom(item.id);
  }, [item]);

  const closeViewer = useCallback(() => {
    setIsViewerVisible(false);
  }, []);

  return {
    activeIndex,
    setActiveIndex,
    isViewerVisible,
    openViewer,
    closeViewer,
  };
}
