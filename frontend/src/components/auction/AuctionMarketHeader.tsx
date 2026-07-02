import React from 'react';
import { View, Text, StyleSheet, Pressable, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../../constants/colors';
import { Space, Typography } from '../../theme/designTokens';

export type AuctionHeaderActionKey = 'search' | 'filter' | 'create' | 'seller' | 'activity';

export interface AuctionHeaderAction {
  key: AuctionHeaderActionKey;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  badgeCount?: number;
  priority?: 'primary' | 'secondary';
}

interface Props {
  title: string;
  context?: string;
  showBack?: boolean;
  onBack?: () => void;
  actions: AuctionHeaderAction[];
}

const SMALL_WIDTH_THRESHOLD = 360;

export function AuctionMarketHeader({
  title,
  context,
  showBack,
  onBack,
  actions,
}: Props) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isSmall = width < SMALL_WIDTH_THRESHOLD;

  // Responsive: on small devices, drop secondary-priority actions first.
  // Priority order for hiding: Activity (secondary) → Filter (secondary) → Seller (primary)
  // Create and Search are always preserved (highest priority).
  const visibleActions = isSmall
    ? actions.filter((a) => a.priority !== 'secondary')
    : actions;

  return (
    <View style={[styles.header, { paddingTop: insets.top + Space.xs }]}>
      <View style={styles.row}>
        {showBack && onBack ? (
          <Pressable
            onPress={onBack}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            style={styles.iconBtn}
          >
            <Ionicons name="chevron-back" size={22} color={Colors.textPrimary} />
          </Pressable>
        ) : null}

        <View style={styles.titleWrap}>
          <Text style={styles.title} numberOfLines={1}>{title}</Text>
          {context ? <Text style={styles.context} numberOfLines={1}>{context}</Text> : null}
        </View>

        <View style={styles.actions}>
          {visibleActions.map((action) => (
            <Pressable
              key={action.key}
              onPress={action.onPress}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel={action.label}
              style={styles.iconBtn}
            >
              <Ionicons name={action.icon} size={20} color={Colors.textPrimary} />
              {action.badgeCount != null && action.badgeCount > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>
                    {action.badgeCount > 9 ? '9+' : action.badgeCount}
                  </Text>
                </View>
              )}
            </Pressable>
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingBottom: Space.sm,
    paddingHorizontal: Space.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    minHeight: 44,
  },
  iconBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  titleWrap: {
    flex: 1,
  },
  title: {
    fontFamily: Typography.family.bold,
    fontSize: 22,
    color: Colors.textPrimary,
    letterSpacing: -0.5,
  },
  context: {
    fontFamily: Typography.family.regular,
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 1,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  badge: {
    position: 'absolute',
    top: 6,
    right: 6,
    minWidth: 16,
    height: 16,
    borderRadius: 999,
    backgroundColor: Colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    fontFamily: Typography.family.bold,
    fontSize: 9,
    color: '#FFFFFF',
  },
});
