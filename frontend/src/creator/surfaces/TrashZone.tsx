/**
 * TrashZone — drag-to-delete overlay (Snapchat/Instagram pattern).
 *
 * Hidden by default. Fades in when a layer manipulation gesture is active
 * (driven by `manipulationActiveSV`), and highlights when the dragged
 * layer's center enters the zone (driven by `isInTrashZoneSV`).
 *
 * Visual-only — `pointerEvents="none"` so it never intercepts the
 * in-progress pan gesture. The actual deletion is committed by
 * CreatorCanvas's pan gesture `.onEnd()` handler.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Reanimated, {
  useAnimatedStyle,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { useAppTheme } from '../../theme/ThemeContext';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { Motion } from '../../theme/motionTokens';

import { AppIcon } from '../../components/common/AppIcon';
import { IconSize } from '../../theme/iconTokens';

export interface TrashZoneProps {
  manipulationActiveSV: SharedValue<number>;
  isInTrashZoneSV: SharedValue<number>;
}

export function TrashZone({ manipulationActiveSV, isInTrashZoneSV }: TrashZoneProps) {
  const reducedMotion = useReducedMotion();
  const { colors } = useAppTheme();

  const containerStyle = useAnimatedStyle(() => {
    const active = manipulationActiveSV.value === 1;
    return {
      opacity: withTiming(active ? 1 : 0, {
        duration: reducedMotion ? 0 : Motion.duration.fast,
        easing: Motion.easing.entrance,
      }),
      pointerEvents: 'none' as const,
    };
  });

  const bandStyle = useAnimatedStyle(() => {
    const inside = isInTrashZoneSV.value === 1;
    return {
      opacity: withTiming(inside ? 1 : 0.6, {
        duration: reducedMotion ? 0 : Motion.duration.touch,
        easing: Motion.easing.entrance,
      }),
    };
  });

  const iconWrapStyle = useAnimatedStyle(() => {
    const inside = isInTrashZoneSV.value === 1;
    return {
      transform: [
        { scale: withTiming(inside ? 1.18 : 1, {
          duration: reducedMotion ? 0 : Motion.duration.normal,
          easing: Motion.easing.entrance,
        }) },
      ],
    };
  });

  return (
    <Reanimated.View style={[styles.overlay, containerStyle]} pointerEvents="none">
      <Reanimated.View
        style={[styles.band, bandStyle, { backgroundColor: colors.dangerSubtle }]}
        accessibilityLabel="Drag here to delete"
        accessibilityLiveRegion="polite"
      >
        <Reanimated.View style={iconWrapStyle}>
          <AppIcon
            name="trash"
            size={IconSize.lg}
            color="danger"
            opticalCenter={true}
            accessible={false}
          />
        </Reanimated.View>
      </Reanimated.View>
    </Reanimated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 46,
  },
  band: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
  },
});
