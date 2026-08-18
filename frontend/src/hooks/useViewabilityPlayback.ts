import { useCallback, useMemo, useRef, useState } from 'react';
import {
  ViewabilityConfig,
  ViewToken,
  ViewabilityConfigCallbackPair,
} from 'react-native';

/**
 * useViewabilityPlayback — viewability-driven video autoplay for feed/card
 * surfaces.
 *
 * Implements the Tendbble/Expo 2026 best practice for video feeds:
 *   - only the most-visible item plays (one active player across the surface);
 *   - a settlement delay avoids spinning up players during fast scrolling;
 *   - offscreen items pause immediately, releasing decode resources.
 *
 * Returns:
 *   - `activeIndex`    — the item index that should currently play (-1 = none);
 *   - `viewabilityConfig` — a stable FlashList/FlatList viewability config;
 *   - `onViewableItemsChanged` — a stable callback pair to spread into the list.
 *
 * Pass `activeIndex === index` to each item's `shouldPlay` prop (e.g. via
 * `<MediaPreview shouldPlay={activeIndex === index} />`).
 *
 * @param settlementMs how long an item must stay visible before it starts
 *   playing (default 350ms — covers fast-scroll flicker without feeling slow).
 */
export function useViewabilityPlayback(settlementMs = 350) {
  const [activeIndex, setActiveIndex] = useState(-1);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingIndex = useRef(-1);

  const clearSettleTimer = useCallback(() => {
    if (settleTimer.current) {
      clearTimeout(settleTimer.current);
      settleTimer.current = null;
    }
  }, []);

  const handleViewableItemsChanged = useCallback(
    (info: { changed: ViewToken[]; viewableItems: ViewToken[] }) => {
      // Pick the first viewable item with a valid index. RN's ViewToken does
      // not expose a viewable percentage, so we rely on the viewability config
      // (itemVisiblePercentThreshold: 60) to guarantee each reported item is
      // sufficiently onscreen. The first entry is the topmost/earliest.
      const viewable = info.viewableItems.filter(
        (t) => t.isViewable && t.index != null
      );

      const candidate = viewable[0]?.index ?? -1;

      if (candidate === -1) {
        clearSettleTimer();
        pendingIndex.current = -1;
        setActiveIndex(-1);
        return;
      }

      if (candidate === activeIndex) {
        return;
      }

      // Settlement: wait briefly before committing playback so fast scrolls
      // do not thrash player creation. Pause the previous item immediately.
      pendingIndex.current = candidate as number;
      setActiveIndex(-1);
      clearSettleTimer();
      settleTimer.current = setTimeout(() => {
        if (pendingIndex.current === candidate) {
          setActiveIndex(candidate as number);
        }
        settleTimer.current = null;
      }, settlementMs);
    },
    [activeIndex, clearSettleTimer, settlementMs]
  );

  const viewabilityConfig = useMemo<ViewabilityConfig>(
    () => ({
      // Treat an item as viewable when 60% visible — matches the "most-visible"
      // heuristic above and avoids edge flicker.
      itemVisiblePercentThreshold: 60,
      minimumViewTime: 0,
    }),
    []
  );

  const pair = useMemo<ViewabilityConfigCallbackPair>(
    () => ({
      viewabilityConfig,
      onViewableItemsChanged: handleViewableItemsChanged,
    }),
    [viewabilityConfig, handleViewableItemsChanged]
  );

  return {
    activeIndex,
    viewabilityConfig,
    onViewableItemsChanged: handleViewableItemsChanged,
    /** Spread this pair into FlashList/FlatList as `{...viewabilityPair}`. */
    viewabilityPair: pair,
    /** Reset playback state (e.g. on screen blur / navigation away). */
    reset: useCallback(() => {
      clearSettleTimer();
      pendingIndex.current = -1;
      setActiveIndex(-1);
    }, [clearSettleTimer]),
  };
}
