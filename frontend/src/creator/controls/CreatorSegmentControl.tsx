/**
 * CreatorSegmentControl — segmented control with sliding indicator.
 *
 * Features:
 *   - Sliding indicator with spring physics (damping 22, stiffness 180 —
 *     "entrance" config per AGENTS.md §27.3)
 *   - Selection haptic on change
 *   - Content crossfade on change
 *   - 36pt height
 *   - Equal-width segments
 *   - Optional glyphs per segment
 *   - Reduced-motion: instant indicator, no crossfade
 *
 * Design references:
 *   - 05_ICONS_BUTTONS_CONTROL_CRAFT.md §2 (CreatorSegmentControl)
 *   - AGENTS.md §17 (animated segment indicators with spring physics)
 *   - AGENTS.md §27.3 (entrance spring config: damping 22, stiffness 180)
 *   - AGENTS.md §27.9 (tab switch: sliding indicator + selection haptic + crossfade)
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Pressable, View, Text, type LayoutChangeEvent } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  Easing,
  useDerivedValue,
  runOnJS,
} from 'react-native-reanimated';
import { useReducedMotion } from 'react-native-reanimated';

import { CreatorGlyph, type CreatorGlyphName } from './CreatorGlyph';
import { Radius, Space, IconGrammar, Elevation } from '../../theme/designTokens';
import { Motion, REDUCED_SPRING } from '../../theme/motionTokens';
import { FontFamily } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { useAppTheme } from '../../theme/ThemeContext';
import { useHaptic } from '../../hooks/useHaptic';

// ── Constants ────────────────────────────────────────────────────────

const HEIGHT = 36;
const INDICATOR_PADDING = 3;

// ── Types ────────────────────────────────────────────────────────────

export interface SegmentOption {
  label: string;
  value: string;
  /** Optional creator glyph. */
  glyph?: CreatorGlyphName;
  /** Optional Ionicons icon name. */
  icon?: string;
}

export interface CreatorSegmentControlProps {
  /** Segment definitions. */
  segments: SegmentOption[];
  /** Currently selected value. */
  value: string;
  /** Called when the selected segment changes. */
  onChange: (value: string) => void;
  /** Test ID. */
  testID?: string;
}

// ── Component ────────────────────────────────────────────────────────

export function CreatorSegmentControl({
  segments,
  value,
  onChange,
  testID,
}: CreatorSegmentControlProps): React.ReactElement {
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const reduceMotion = useReducedMotion();

  const [containerWidth, setContainerWidth] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Track which segment is active via shared value for UI-thread animation
  const activeIndexSV = useSharedValue(0);
  const contentOpacitySV = useSharedValue(1);

  const springConfig = reduceMotion ? REDUCED_SPRING : Motion.spring.entrance;

  // Update selected index when value changes
  useEffect(() => {
    const idx = segments.findIndex((s) => s.value === value);
    if (idx >= 0 && idx !== selectedIndex) {
      setSelectedIndex(idx);
      activeIndexSV.value = reduceMotion ? idx : withSpring(idx, springConfig);
      // Content crossfade
      if (reduceMotion) {
        contentOpacitySV.value = 1;
      } else {
        contentOpacitySV.value = withTiming(0, {
          duration: Motion.duration.fast / 2,
          easing: Easing.in(Easing.cubic),
        }, () => {
          contentOpacitySV.value = withTiming(1, {
            duration: Motion.duration.fast / 2,
            easing: Easing.out(Easing.cubic),
          });
        });
      }
    }
  }, [value, segments, selectedIndex, reduceMotion, springConfig, activeIndexSV, contentOpacitySV]);

  const handleLayout = useCallback((e: LayoutChangeEvent) => {
    setContainerWidth(e.nativeEvent.layout.width);
  }, []);

  const handleSelect = useCallback(
    (index: number, segmentValue: string) => {
      if (segmentValue === value) return;
      haptic.selection();
      onChange(segmentValue);
    },
    [value, haptic, onChange],
  );

  // Segment width (equal-width segments)
  const segmentWidth = containerWidth > 0 ? containerWidth / segments.length : 0;

  // Sliding indicator animated style
  const indicatorStyle = useAnimatedStyle(() => {
    const x = activeIndexSV.value * segmentWidth;
    return {
      transform: [{ translateX: x }],
      width: segmentWidth,
    };
  });

  // Content crossfade
  const contentStyle = useAnimatedStyle(() => ({
    opacity: contentOpacitySV.value,
  }));

  if (segments.length === 0) {
    return <View style={[styles.container, { backgroundColor: colors.surfaceAlt, borderRadius: Radius.md }]} />;
  }

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: colors.surfaceAlt, borderRadius: Radius.md },
      ]}
      onLayout={handleLayout}
      accessibilityRole="tablist"
      testID={testID}
    >
      {/* Sliding indicator */}
      {containerWidth > 0 && (
        <Reanimated.View
          style={[
            styles.indicator,
            {
              backgroundColor: colors.surfaceElevated,
              borderRadius: Radius.md - INDICATOR_PADDING,
            },
            indicatorStyle,
          ]}
          pointerEvents="none"
        />
      )}

      {/* Segments */}
      <View style={styles.segmentsRow}>
        {segments.map((segment, index) => {
          const isActive = index === selectedIndex;
          return (
            <Pressable
              key={segment.value}
              onPress={() => handleSelect(index, segment.value)}
              accessibilityRole="tab"
              accessibilityLabel={segment.label}
              accessibilityState={{ selected: isActive }}
              style={styles.segment}
              hitSlop={{ top: 4, bottom: 4, left: 0, right: 0 }}
            >
              <Reanimated.View style={[styles.segmentContent, contentStyle]}>
                {segment.glyph && (
                  <CreatorGlyph
                    name={segment.glyph}
                    size={IconGrammar.metadata}
                    color={isActive ? colors.textPrimary : colors.textSecondary}
                  />
                )}
                {segment.icon && !segment.glyph && (
                  <Ionicons
                    name={segment.icon as React.ComponentProps<typeof Ionicons>['name']}
                    size={IconGrammar.metadata}
                    color={isActive ? colors.textPrimary : colors.textSecondary}
                  />
                )}
                <Text
                  style={[
                    styles.segmentLabel,
                    {
                      color: isActive ? colors.textPrimary : colors.textSecondary,
                      fontFamily: isActive ? FontFamily.semibold : FontFamily.regular,
                    },
                  ]}
                  numberOfLines={1}
                >
                  {segment.label}
                </Text>
              </Reanimated.View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    height: HEIGHT,
    position: 'relative',
    padding: INDICATOR_PADDING,
    overflow: 'hidden',
  },
  indicator: {
    position: 'absolute',
    top: INDICATOR_PADDING,
    bottom: INDICATOR_PADDING,
    left: INDICATOR_PADDING,
    // Shadow for depth separation
    ...Elevation.card,
  },
  segmentsRow: {
    flexDirection: 'row',
    flex: 1,
  },
  segment: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.xs,
  },
  segmentLabel: {
    fontSize: TypographyV2.captionElevated.size,
    letterSpacing: 0,
  },
});

export default CreatorSegmentControl;
