/**
 * useLookChromeFade — chrome-recedes-during-manipulation animation state
 * for the Look composer (Snapchat/Instagram pattern).
 *
 * Extracted from LookComposerScreen — pure relocation, no changes.
 */

import { useState } from 'react';
import { useSharedValue, useAnimatedStyle, useAnimatedReaction, withTiming } from 'react-native-reanimated';
import { Motion } from '../../../theme/motionTokens';

export function useLookChromeFade() {
  // Chrome-recedes-during-manipulation (Snapchat/Instagram pattern)
  const manipulationActiveSV = useSharedValue(0);
  const [isManipulating, setIsManipulating] = useState(false);
  // Drag-to-trash: set to 1 by CreatorCanvas while the dragged layer's
  // center is inside the bottom trash zone. Drives the TrashZone overlay
  // highlight.
  const isInTrashZoneSV = useSharedValue(0);
  // Chrome opacity is driven by a reaction on manipulationActiveSV so
  // the timing animation only starts when the manipulation state changes,
  // not on every frame of useAnimatedStyle.
  const chromeOpacitySV = useSharedValue(1);
  useAnimatedReaction(
    () => manipulationActiveSV.value,
    (active, prev) => {
      if (active === prev) return;
      chromeOpacitySV.value = withTiming(
        active === 1 ? 0.15 : 1,
        { duration: Motion.tier.deliberate, easing: Motion.easing.entrance },
      );
    },
  );
  const chromeFadeStyle = useAnimatedStyle(() => ({
    opacity: chromeOpacitySV.value }));

  return {
    manipulationActiveSV,
    isManipulating,
    setIsManipulating,
    isInTrashZoneSV,
    chromeFadeStyle,
  };
}
