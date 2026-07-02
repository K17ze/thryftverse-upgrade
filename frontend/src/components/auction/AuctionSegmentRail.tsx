import React from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { Colors } from '../../constants/colors';
import { Space, Radius, Typography } from '../../theme/designTokens';

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

export function AuctionSegmentRail({ segments, activeKey, onSelect, accessibilityLabelPrefix = 'Show' }: Props) {
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
            style={[styles.segment, active && styles.segmentActive]}
            onPress={() => onSelect(seg.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={`${accessibilityLabelPrefix} ${seg.label}`}
          >
            <Text style={[styles.label, active && styles.labelActive]}>{seg.label}</Text>
            {seg.count != null && (
              <View style={[styles.count, active && styles.countActive]}>
                <Text style={[styles.countText, active && styles.countTextActive]}>{seg.count}</Text>
              </View>
            )}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: Space.xs,
    paddingHorizontal: Space.md,
  },
  segment: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    borderRadius: Radius.full,
    backgroundColor: Colors.surface,
  },
  segmentActive: {
    backgroundColor: Colors.brand,
  },
  label: {
    fontFamily: Typography.family.semibold,
    fontSize: 13,
    color: Colors.textSecondary,
    letterSpacing: -0.1,
  },
  labelActive: {
    color: Colors.textInverse,
  },
  count: {
    minWidth: 18,
    height: 18,
    borderRadius: 999,
    backgroundColor: Colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  countActive: {
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  countText: {
    fontFamily: Typography.family.semibold,
    fontSize: 10,
    color: Colors.textMuted,
    fontVariant: ['tabular-nums'],
  },
  countTextActive: {
    color: Colors.textInverse,
  },
});
