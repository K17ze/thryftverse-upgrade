import React from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { Colors } from '../../constants/colors';
import { Space, Typography } from '../../theme/designTokens';
import { haptics } from '../../utils/haptics';

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
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.content}
    >
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
            <View style={[styles.underline, active && styles.underlineActive]} />
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: Space.md,
    paddingHorizontal: Space.md,
    paddingVertical: Space.xs,
  },
  segment: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 5,
    paddingVertical: Space.sm,
    position: 'relative',
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
    right: 0,
    height: 2,
    borderRadius: 1,
    backgroundColor: 'transparent',
  },
  underlineActive: {
    backgroundColor: Colors.brand,
  },
});
