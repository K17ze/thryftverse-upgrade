import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Pressable } from 'react-native';
import { Colors } from '../../constants/colors';
import { Space, Type, TypeStyles, Typography } from '../../theme/designTokens';

export type MessagingSegment = 'all' | 'requests' | 'groups';

export interface MessagingSegmentRailProps {
  active: MessagingSegment;
  onChange: (segment: MessagingSegment) => void;
  requestCount?: number;
}

export function MessagingSegmentRail({
  active,
  onChange,
  requestCount = 0,
}: MessagingSegmentRailProps) {
  const segments: { key: MessagingSegment; label: string; badge?: number }[] = [
    { key: 'all', label: 'All' },
    { key: 'requests', label: 'Requests', badge: requestCount > 0 ? requestCount : undefined },
    { key: 'groups', label: 'Groups' },
  ];

  return (
    <View style={styles.root}>
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
    </View>
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
