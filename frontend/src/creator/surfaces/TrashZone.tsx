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
 *
 * Per AGENTS.md §4: a single dominant panel, restrained chrome, one
 * icon family, one motion language. The zone is a compact bottom band
 * with a trash glyph + label — not a full-bleed coloured sheet.
 */
import React from 'react';
import { StyleSheet, View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Reanimated, {
  useAnimatedStyle,
  withTiming,
  Easing,
  type SharedValue,
} from 'react-native-reanimated';
import { FontFamily, Space, Radius } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { IconGrammar } from '../../theme/designTokens';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { Motion } from '../../theme/motionTokens';

export interface TrashZoneProps {
  /** 1 during an active layer gesture, 0 when idle. Drives fade in/out. */
  manipulationActiveSV: SharedValue<number>;
  /** 1 when the dragged layer's center is inside the trash zone, 0 outside. */
  isInTrashZoneSV: SharedValue<number>;
}

// Danger palette — a single restrained red, not a gradient.
const ZONE_IDLE_ALPHA = 0.55;
const ZONE_ACTIVE_ALPHA = 0.92;
const ZONE_FILL_IDLE = `rgba(220,70,70,${ZONE_IDLE_ALPHA})`;
const ZONE_FILL_ACTIVE = `rgba(235,50,50,${ZONE_ACTIVE_ALPHA})`;
const ZONE_LABEL = '#fff';

export function TrashZone({ manipulationActiveSV, isInTrashZoneSV }: TrashZoneProps) {
  const reducedMotion = useReducedMotion();

  // Container fade — appears only while a gesture is active.
  const containerStyle = useAnimatedStyle(() => {
    const active = manipulationActiveSV.value === 1;
    return {
      opacity: withTiming(active ? 1 : 0, {
        duration: reducedMotion ? 0 : Motion.duration.fast,
        easing: Easing.out(Easing.cubic),
      }),
      // Keep laid out so the animated style is stable; hide via opacity.
      pointerEvents: 'none' as const,
    };
  });

  // Inner band — fills with stronger red + lifts the glyph when the
  // dragged layer enters the zone.
  const bandStyle = useAnimatedStyle(() => {
    const inside = isInTrashZoneSV.value === 1;
    return {
      backgroundColor: withTiming(inside ? ZONE_FILL_ACTIVE : ZONE_FILL_IDLE, {
        duration: reducedMotion ? 0 : Motion.duration.touch,
        easing: Easing.out(Easing.cubic),
      }),
    };
  });

  const iconWrapStyle = useAnimatedStyle(() => {
    const inside = isInTrashZoneSV.value === 1;
    return {
      transform: [
        { scale: withTiming(inside ? 1.18 : 1, {
          duration: reducedMotion ? 0 : Motion.duration.normal,
          easing: Easing.out(Easing.cubic),
        }) },
      ],
    };
  });

  return (
    <Reanimated.View style={[styles.overlay, containerStyle]} pointerEvents="none">
      <Reanimated.View style={[styles.band, bandStyle]}>
        <View style={styles.content}>
          <Reanimated.View style={iconWrapStyle}>
            <Ionicons
              name="trash-outline"
              size={IconGrammar.hero}
              color={ZONE_LABEL}
            />
          </Reanimated.View>
          <View>
            <Text style={styles.label}>Drag to delete</Text>
          </View>
        </View>
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
    paddingVertical: Space.md,
    // Rounded top corners — a compact dock, not a full-bleed sheet.
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
  },
  label: {
    fontFamily: FontFamily.semibold,
    fontSize: TypographyV2.body.size,
    color: ZONE_LABEL,
    letterSpacing: 0.2,
  },
});
