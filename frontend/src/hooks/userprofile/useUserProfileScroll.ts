import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  useSharedValue,
  useAnimatedScrollHandler,
  runOnJS,
} from 'react-native-reanimated';
import { useReducedMotion } from '../useReducedMotion';
import { COVER_HEIGHT, COLLAPSED_BAR_HEIGHT } from './constants';

/**
 * Owns the user-profile scroll chrome: the shared scroll position, the
 * collapsed-header / sticky-rail visibility state driven off scroll
 * thresholds, the animated + web scroll handlers, and per-destination
 * scroll-offset preservation across tab/segment switches.
 *
 * Note: useAnimatedScrollHandler + AnimatedFlashList crashes on web due to
 * Reanimated 4.x not backporting the FlashList scroll-event fix from 3.12.
 * On web we use a plain JS scroll handler + non-animated FlashList.
 * See: https://github.com/software-mansion/react-native-reanimated/issues/9266
 */
export function useUserProfileScroll(currentDestination: string) {
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();

  const [collapsedVisible, setCollapsedVisible] = useState(false);
  const [stickyRailVisible, setStickyRailVisible] = useState(false);

  // Scroll / header animation
  const scrollY = useSharedValue(0);
  const collapsedShared = useSharedValue(false);
  const stickyShared = useSharedValue(false);
  const stickyThreshold = useSharedValue(9999);

  // -- Per-destination scroll offset preservation --
  // Declared before the scroll handler so saveScrollOffset is accessible
  // in the animatedScrollHandler closure (temporal dead zone safety).
  const scrollOffsets = useRef<Record<string, number>>({});
  const listRef = useRef<any>(null);
  const pendingRestore = useRef<string | null>(null);
  const isListReady = useRef(false);

  const saveScrollOffset = useCallback((offset: number) => {
    scrollOffsets.current[currentDestination] = offset;
  }, [currentDestination]);

  // Scroll handler - animated on native (UI-thread), plain JS on web.
  // The web fallback is required because useAnimatedScrollHandler does not
  // receive scroll events from FlashList in Reanimated 4.x (issue #9266).
  const animatedScrollHandler = useAnimatedScrollHandler({
    onScroll: (e) => {
      scrollY.value = e.contentOffset.y;
      runOnJS(saveScrollOffset)(e.contentOffset.y);
      const collapsedAt = COVER_HEIGHT - 60;
      if (e.contentOffset.y > collapsedAt && !collapsedShared.value) {
        collapsedShared.value = true;
        runOnJS(setCollapsedVisible)(true);
      } else if (e.contentOffset.y <= collapsedAt && collapsedShared.value) {
        collapsedShared.value = false;
        runOnJS(setCollapsedVisible)(false);
      }
      const stickyAt = stickyThreshold.value;
      if (e.contentOffset.y > stickyAt && !stickyShared.value) {
        stickyShared.value = true;
        runOnJS(setStickyRailVisible)(true);
      } else if (e.contentOffset.y <= stickyAt && stickyShared.value) {
        stickyShared.value = false;
        runOnJS(setStickyRailVisible)(false);
      }
    },
  });

  const webScrollHandler = useCallback((e: { nativeEvent: { contentOffset: { y: number } } }) => {
    const offsetY = e.nativeEvent.contentOffset.y;
    scrollY.value = offsetY;
    saveScrollOffset(offsetY);
    const collapsedAt = COVER_HEIGHT - 60;
    if (offsetY > collapsedAt && !collapsedShared.value) {
      collapsedShared.value = true;
      setCollapsedVisible(true);
    } else if (offsetY <= collapsedAt && collapsedShared.value) {
      collapsedShared.value = false;
      setCollapsedVisible(false);
    }
    const stickyAt = stickyThreshold.value;
    if (offsetY > stickyAt && !stickyShared.value) {
      stickyShared.value = true;
      setStickyRailVisible(true);
    } else if (offsetY <= stickyAt && stickyShared.value) {
      stickyShared.value = false;
      setStickyRailVisible(false);
    }
  }, [stickyThreshold, saveScrollOffset]);

  const scrollHandler = Platform.OS === 'web' ? webScrollHandler : animatedScrollHandler;

  // When destination changes, queue a restore - no setTimeout during render
  const prevDestination = useRef<string>(currentDestination);
  useEffect(() => {
    if (prevDestination.current !== currentDestination) {
      prevDestination.current = currentDestination;
      isListReady.current = false;
      pendingRestore.current = currentDestination;
    }
  }, [currentDestination]);

  // Restore scroll position after the new list content is measured
  const handleContentSizeChange = useCallback(() => {
    if (pendingRestore.current && listRef.current) {
      const dest = pendingRestore.current;
      pendingRestore.current = null;
      const saved = scrollOffsets.current[dest];
      if (saved !== undefined && saved > 0) {
        listRef.current.scrollToOffset?.({ offset: saved, animated: false });
        // Update overlay state from the restored offset
        const collapsedAt = COVER_HEIGHT - 60;
        const stickyAt = stickyThreshold.value;
        const shouldCollapse = saved > collapsedAt;
        const shouldSticky = saved > stickyAt;
        if (shouldCollapse !== collapsedShared.value) {
          collapsedShared.value = shouldCollapse;
          setCollapsedVisible(shouldCollapse);
        }
        if (shouldSticky !== stickyShared.value) {
          stickyShared.value = shouldSticky;
          setStickyRailVisible(shouldSticky);
        }
      } else {
        // No previous offset - if currently collapsed, start at sticky threshold
        if (collapsedShared.value) {
          const stickyAt = stickyThreshold.value;
          if (stickyAt < 9999 && listRef.current) {
            listRef.current.scrollToOffset?.({ offset: stickyAt + 1, animated: false });
          }
        }
      }
    }
    isListReady.current = true;
  }, [stickyThreshold]);

  const onTabRailLayout = useCallback((y: number) => { stickyThreshold.value = y - (insets.top + COLLAPSED_BAR_HEIGHT); }, [insets.top]);

  return {
    reducedMotion,
    scrollY,
    collapsedShared,
    stickyShared,
    stickyThreshold,
    collapsedVisible,
    stickyRailVisible,
    listRef,
    scrollHandler,
    handleContentSizeChange,
    onTabRailLayout,
  };
}
