// ── useRecentGallery ─────────────────────────────────────────────────
// Owns the gallery affordance data for CreatorCamera: the recent-items
// strip powering the thumbnail + long-press carousel, and the long-press
// arbitration between the caller's custom browser and the default
// recent-photos carousel. Extracted verbatim from CreatorCamera.

import { useState, useCallback, useEffect } from 'react';
import * as MediaLibrary from 'expo-media-library/legacy';
import { useHaptic } from '../../hooks/useHaptic';

export interface UseRecentGalleryOptions {
  haptic: ReturnType<typeof useHaptic>;
  /** Optional custom long-press handler — when provided, replaces the
   *  default recent-photos carousel so the parent can route the
   *  long-press to a custom browser. */
  onGalleryLongPress?: () => void;
}

export interface UseRecentGalleryResult {
  lastItem: { uri: string; isVideo: boolean } | null;
  recentItems: { uri: string; isVideo: boolean }[];
  showRecentCarousel: boolean;
  handleGalleryLongPress: () => void;
}

export function useRecentGallery({
  haptic,
  onGalleryLongPress,
}: UseRecentGalleryOptions): UseRecentGalleryResult {
  const [lastItem, setLastItem] = useState<{ uri: string; isVideo: boolean } | null>(null);
  const [recentItems, setRecentItems] = useState<{ uri: string; isVideo: boolean }[]>([]);
  const [showRecentCarousel, setShowRecentCarousel] = useState(false);

  // ── Load recent gallery photos for thumbnail + carousel ──
  useEffect(() => {
    let cancelled = false;
    async function loadRecent() {
      try {
        // Never ambush the creator with a broad photo-library permission
        // merely to decorate the gallery control. If access already exists,
        // show a recent thumbnail; otherwise the glyph remains truthful and
        // the system picker asks only when the user chooses Gallery.
        const mediaPermission = await MediaLibrary.getPermissionsAsync(false);
        if (!mediaPermission.granted || cancelled) return;
        const page = await MediaLibrary.getAssetsAsync({
          mediaType: ['photo', 'video'],
          sortBy: [['creationTime', false]],
          first: 10 });
        if (!cancelled && page.assets.length > 0) {
          const items = page.assets
            .filter((a) => a.uri)
            .map((a) => ({ uri: a.uri, isVideo: a.mediaType === 'video' }));
          setRecentItems(items);
          setLastItem(items[0]);
        }
      } catch {
        // The thumbnail is optional; camera capture remains usable if the
        // platform library is unavailable or its permission changes.
      }
    }
    void loadRecent();
    return () => { cancelled = true; };
  }, []);

  const handleGalleryLongPress = useCallback(() => {
    // When the parent provides a custom long-press handler (e.g. to open
    // the full library browser), it takes precedence over the default
    // recent-photos carousel. This follows progressive disclosure: the
    // ordinary tap is the fast path, the long-press is the power-user path.
    if (onGalleryLongPress) {
      haptic.selection();
      onGalleryLongPress();
      return;
    }
    if (recentItems.length > 1) {
      haptic.selection();
      setShowRecentCarousel((p) => !p);
    }
  }, [haptic, recentItems.length, onGalleryLongPress]);

  return {
    lastItem,
    recentItems,
    showRecentCarousel,
    handleGalleryLongPress,
  };
}
