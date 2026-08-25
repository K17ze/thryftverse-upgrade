import React, { useRef, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, LayoutChangeEvent } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import Reanimated, { useSharedValue, useAnimatedStyle } from 'react-native-reanimated';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space, Typography, Type, Radius } from '../../theme/designTokens';
import { haptics } from '../../utils/haptics';
import { useReducedMotion } from '../../hooks/useReducedMotion';

export interface Segment {
  key: string;
  label: string;
  count?: number;
  /** Per-segment accent color for the underline + active label.
   * When omitted, falls back to colors.brand. This lets each lifecycle
   * scope be visually distinct: Live = urgent, Upcoming = calm,
   * Results = muted, etc. */
  accentColor?: string;
}

interface Props {
  segments: Segment[];
  activeKey: string;
  onSelect: (key: string) => void;
  accessibilityLabelPrefix?: string;
}

export function AuctionSegmentRail({
  segments,
  activeKey,
  onSelect,
  accessibilityLabelPrefix = 'Show',
}: Props) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const reducedMotion = useReducedMotion();
  const underlineX = useSharedValue(0);
  const underlineWidth = useSharedValue(0);
  const segmentLayouts = useRef<Record<string, { x: number; width: number }>>({});

  // Resolve the active segment's accent color — per-segment visual
  // distinction so each lifecycle scope reads differently at a glance.
  const activeSegment = segments.find((s) => s.key === activeKey);
  const activeAccent = activeSegment?.accentColor ?? colors.brand;

  const updateUnderline = React.useCallback((key: string) => {
    const layout = segmentLayouts.current[key];
    if (!layout) return;
    // Instant snap — no spring animation, no flowing
    underlineX.value = layout.x;
    underlineWidth.value = layout.width;
  }, [underlineX, underlineWidth]);

  useEffect(() => {
    updateUnderline(activeKey);
  }, [activeKey, updateUnderline]);

  const handleLayout = (key: string) => (e: LayoutChangeEvent) => {
    segmentLayouts.current[key] = {
      x: e.nativeEvent.layout.x,
      width: e.nativeEvent.layout.width,
    };
    if (key === activeKey) updateUnderline(key);
  };

  const animatedUnderlineStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: underlineX.value }],
    width: underlineWidth.value,
  }));

  return (
    <View style={styles.container}>
      <ScrollView
        horizontal
        style={styles.scroll}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.segmentsRow}
      >
        {segments.map((seg) => {
          const active = seg.key === activeKey;
          const segAccent = seg.accentColor ?? colors.brand;
          return (
            <Pressable
              key={seg.key}
              style={styles.segment}
              onPress={() => {
                haptics.tap();
                onSelect(seg.key);
              }}
              onLayout={handleLayout(seg.key)}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`${accessibilityLabelPrefix} ${seg.label}${seg.count != null ? `, ${seg.count} auctions` : ''}`}
            >
              <Text style={[styles.label, active && styles.labelActive, active && { color: segAccent }]}>
                {seg.label}
              </Text>
              {seg.count != null && (
                <Text style={[styles.count, active && styles.countActive]}>
                  {seg.count}
                </Text>
              )}
            </Pressable>
          );
        })}
      </ScrollView>
      <Reanimated.View style={[styles.underline, animatedUnderlineStyle, { backgroundColor: activeAccent }]} />
    </View>
  );
}

const createStyles = (colors: ReturnType<typeof useAppTheme>['colors']) => StyleSheet.create({
  container: {
    position: 'relative',
  },
  scroll: {
    flexGrow: 0,
    flexShrink: 0,
  },
  segmentsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Space.md,
    paddingVertical: Space.xs,
  },
  segment: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 5,
    paddingHorizontal: Space.sm + 2,
    paddingVertical: Space.sm,
  },
  label: {
    fontFamily: Typography.family.medium,
    fontSize: Type.bodyStrong.size,
    color: colors.textSecondary,
    letterSpacing: -0.2,
  },
  labelActive: {
    fontFamily: Typography.family.bold,
    color: colors.textPrimary,
  },
  count: {
    fontFamily: Typography.family.regular,
    fontSize: Type.caption.size,
    color: colors.textMuted,
    fontVariant: ['tabular-nums'],
  },
  countActive: {
    color: colors.textSecondary,
  },
  underline: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    height: 2,
    borderRadius: Radius.full,
    backgroundColor: colors.brand,
  },
});
