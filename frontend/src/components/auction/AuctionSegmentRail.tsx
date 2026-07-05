import React, { useRef, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, LayoutChangeEvent } from 'react-native';
import Reanimated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { Colors } from '../../constants/colors';
import { Space, Typography } from '../../theme/designTokens';
import { haptics } from '../../utils/haptics';
import { useReducedMotion } from '../../hooks/useReducedMotion';

export interface Segment {
  key: string;
  label: string;
  count?: number;
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
  const reducedMotion = useReducedMotion();
  const underlineX = useSharedValue(0);
  const underlineWidth = useSharedValue(0);
  const segmentLayouts = useRef<Record<string, { x: number; width: number }>>({});

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
      {segments.map((seg) => {
        const active = seg.key === activeKey;
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
            <Text style={[styles.label, active && styles.labelActive]}>
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
      <Reanimated.View style={[styles.underline, animatedUnderlineStyle]} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    paddingHorizontal: Space.md,
    paddingVertical: Space.xs,
    position: 'relative',
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
    fontSize: 15,
    color: Colors.textSecondary,
    letterSpacing: -0.2,
  },
  labelActive: {
    fontFamily: Typography.family.bold,
    color: Colors.textPrimary,
  },
  count: {
    fontFamily: Typography.family.regular,
    fontSize: 12,
    color: Colors.textMuted,
    fontVariant: ['tabular-nums'],
  },
  countActive: {
    color: Colors.textSecondary,
  },
  underline: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    height: 2,
    borderRadius: 1,
    backgroundColor: Colors.brand,
  },
});
