/**
 * useScrollHaptics — Tactile feedback for scroll physics
 * Triggers haptics on snap boundaries, elastic bounces, and segment changes.
 */

import { useCallback } from 'react';
import { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import { triggerHaptic, HapticType } from '../utils/haptics';
import { useReducedMotion } from './useReducedMotion';

interface ScrollHapticsConfig {
  /** Enable snap-to-grid boundary haptics */
  snapToGrid?: boolean;
  /** Grid item height for calculating snap points */
  gridItemHeight?: number;
  /** Enable elastic bounce haptic at list ends */
  elasticBounce?: boolean;
  /** Enable haptic on segment/control changes (call manually) */
  segmentChange?: boolean;
}

export function useScrollHaptics(config: ScrollHapticsConfig = {}) {
  const reducedMotionEnabled = useReducedMotion();
  const { snapToGrid, elasticBounce } = config;

  let lastSnapIndex = -1;

  const onScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (reducedMotionEnabled) return;

      const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
      const scrollY = contentOffset.y;

      // Elastic bounce detection
      if (elasticBounce) {
        const maxScroll = contentSize.height - layoutMeasurement.height;
        if (scrollY < -20 || scrollY > maxScroll + 20) {
          triggerHaptic(HapticType.MEDIUM);
        }
      }

      // Snap-to-grid boundary detection
      if (snapToGrid && config.gridItemHeight) {
        const currentSnapIndex = Math.round(scrollY / config.gridItemHeight);
        if (currentSnapIndex !== lastSnapIndex && currentSnapIndex >= 0) {
          lastSnapIndex = currentSnapIndex;
          triggerHaptic(HapticType.LIGHT);
        }
      }
    },
    [reducedMotionEnabled, snapToGrid, elasticBounce, config.gridItemHeight]
  );

  const onSegmentChange = useCallback(() => {
    if (reducedMotionEnabled) return;
    triggerHaptic(HapticType.LIGHT);
  }, [reducedMotionEnabled]);

  const onRefresh = useCallback(() => {
    if (reducedMotionEnabled) return;
    triggerHaptic(HapticType.SUCCESS);
  }, [reducedMotionEnabled]);

  return { onScroll, onSegmentChange, onRefresh };
}