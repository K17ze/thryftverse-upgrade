import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { Pressable } from 'react-native';
import { Colors } from '../../constants/colors';
import { Space, Type, TypeStyles, Typography } from '../../theme/designTokens';

export type MessagingSegment = 'all' | 'buying' | 'selling' | 'requests' | 'groups';

export interface MessagingSegmentRailProps {
  active: MessagingSegment;
  onChange: (segment: MessagingSegment) => void;
  requestCount?: number;
  buyingCount?: number;
  sellingCount?: number;
}

export function MessagingSegmentRail({
  active,
  onChange,
  requestCount = 0,
  buyingCount = 0,
  sellingCount = 0,
}: MessagingSegmentRailProps) {
  const segments: { key: MessagingSegment; label: string; badge?: number }[] = [
    { key: 'all', label: 'All' },
    { key: 'buying', label: 'Buying', badge: buyingCount > 0 ? buyingCount : undefined },
    { key: 'selling', label: 'Selling', badge: sellingCount > 0 ? sellingCount : undefined },
    { key: 'requests', label: 'Requests', badge: requestCount > 0 ? requestCount : undefined },
    { key: 'groups', label: 'Groups' },
  ];

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.root} contentContainerStyle={styles.content}>
      {segments.map((seg) => {
        const isActive = seg.key === active;
        return (
          <Pressable
            key={seg.key}
            onPress={() => onChange(seg.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            accessibilityLabel={`${seg.label} tab${seg.badge ? `, ${seg.badge} new` : ''}`}
            style={styles.tab}
          >
            <Text
              style={[
                styles.label,
                isActive && styles.labelActive,
                !isActive && styles.labelInactive,
              ]}
              numberOfLines={1}
            >
              {seg.label}
            </Text>
            {seg.badge ? (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{seg.badge}</Text>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    paddingHorizontal: Space.md,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  label: {
    fontSize: Type.body.size,
    fontFamily: TypeStyles.body.fontFamily,
    letterSpacing: Type.body.letterSpacing,
  },
  labelActive: {
    fontFamily: TypeStyles.bodyEmphasis.fontFamily,
    color: Colors.textPrimary,
  },
  labelInactive: {
    color: Colors.textMuted,
  },
  badge: {
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: Colors.brand,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    fontSize: 10,
    fontFamily: TypeStyles.bodyEmphasis.fontFamily,
    color: Colors.textInverse,
  },
});
