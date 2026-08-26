import { useRef, useCallback, useEffect } from 'react';
import { NativeSyntheticEvent, NativeScrollEvent } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface ScrollRestorationOptions {
  /** Unique key for this scroll surface (e.g. 'global_search_results'). */
  storageKey: string;
  /** Whether to persist the offset to AsyncStorage for process-death recovery. */
  persistToStorage?: boolean;
  /** Resolves a saved anchor item ID to a pixel offset for content-anchor
   *  restoration (Layer 4). When omitted, restoration falls back to the
   *  raw saved pixel offset. */
  getItemOffset?: (itemId: string) => number | undefined;
}

type ScrollableHandle =
  | { getScrollableNode?: () => unknown }
  | { scrollToOffset?: (params: { offset: number; animated?: boolean }) => void }
  | { scrollTo?: (params: { y: number; animated?: boolean }) => void };

interface ScrollSnapshot {
  offset: number;
  anchorItemId?: string;
}

/**
 * 4-layer scroll restoration hook.
 *
 * Layer 1 (keep-alive) is handled by the navigator — native-stack keeps
 * screens mounted when a detail is pushed on top.
 *
 * Layer 2: Capture the scroll offset on blur (when the user navigates away).
 * Layer 3: Restore the offset only after the list has its data, not on mount.
 * Layer 4: Use content anchoring (item ID) rather than raw pixel offset,
 *          so restoration is correct even if item heights change.
 *
 * Usage:
 *   const { scrollRef, onScroll, setAnchorItem, captureScroll, restoreScroll } = useScrollRestoration({
 *     storageKey: 'global_search_results',
 *     persistToStorage: true,
 *   });
 */
export function useScrollRestoration<T extends ScrollableHandle>(
  options: ScrollRestorationOptions,
) {
  const { storageKey, persistToStorage = false, getItemOffset } = options;

  const scrollRef = useRef<T>(null);
  const offsetRef = useRef(0);
  const anchorRef = useRef<string | undefined>(undefined);
  const savedRef = useRef<ScrollSnapshot | null>(null);

  // Layer 2 (persist): hydrate from AsyncStorage on mount so scroll position
  // survives process death, not just in-app navigation.
  useEffect(() => {
    if (!persistToStorage) return;
    let cancelled = false;
    AsyncStorage.getItem(storageKey)
      .then((raw) => {
        if (cancelled || !raw) return;
        try {
          savedRef.current = JSON.parse(raw) as ScrollSnapshot;
        } catch {
          /* malformed payload — ignore */
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [persistToStorage, storageKey]);

  const onScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      offsetRef.current = event.nativeEvent.contentOffset.y;
    },
    [],
  );

  /** Record the ID of the first visible item (Layer 4 content anchor).
   *  Screens call this from their list's viewability callback. */
  const setAnchorItem = useCallback((itemId: string | undefined) => {
    anchorRef.current = itemId;
  }, []);

  /** Capture the current offset + anchor on blur (Layer 2). */
  const captureScroll = useCallback(() => {
    const snapshot: ScrollSnapshot = {
      offset: offsetRef.current,
      anchorItemId: anchorRef.current,
    };
    savedRef.current = snapshot;
    if (persistToStorage) {
      void AsyncStorage.setItem(storageKey, JSON.stringify(snapshot)).catch(() => {});
    }
  }, [persistToStorage, storageKey]);

  /** Restore the saved position after the list has its data (Layer 3).
   *  Uses content-anchor offset (Layer 4) when the screen can resolve the
   *  saved item ID; otherwise falls back to the raw pixel offset. */
  const restoreScroll = useCallback(() => {
    const saved = savedRef.current;
    if (!saved) return;
    const node = scrollRef.current as ScrollableHandle | null;
    if (!node) return;

    let targetOffset = saved.offset;
    if (getItemOffset && saved.anchorItemId != null) {
      const anchored = getItemOffset(saved.anchorItemId);
      if (anchored != null) targetOffset = anchored;
    }

    if ('scrollToOffset' in node && typeof node.scrollToOffset === 'function') {
      node.scrollToOffset({ offset: targetOffset, animated: false });
    } else if ('scrollTo' in node && typeof node.scrollTo === 'function') {
      node.scrollTo({ y: targetOffset, animated: false });
    }

    // Consume the snapshot so a later restore without a fresh capture is a
    // no-op (the user has since scrolled freely).
    savedRef.current = null;
    if (persistToStorage) {
      void AsyncStorage.removeItem(storageKey).catch(() => {});
    }
  }, [getItemOffset, persistToStorage, storageKey]);

  return { scrollRef, onScroll, setAnchorItem, captureScroll, restoreScroll };
}
