import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../../constants/colors';
import { Space, Radius, Typography } from '../../theme/designTokens';
import { AnimatedPressable } from '../AnimatedPressable';

interface Props {
  title: string;
  context?: string;
  onBack: () => void;
  onSearch: () => void;
  onActivity: () => void;
  activityCount?: number;
  rightIcon?: keyof typeof Ionicons.glyphMap;
  onRightAction?: () => void;
  rightActionLabel?: string;
}

export function AuctionMarketHeader({
  title,
  context,
  onBack,
  onSearch,
  onActivity,
  activityCount,
  rightIcon,
  onRightAction,
  rightActionLabel,
}: Props) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.header, { paddingTop: insets.top + Space.xs }]}>
      <View style={styles.row}>
        <AnimatedPressable
          style={styles.iconBtn}
          scaleValue={0.9}
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="chevron-back" size={22} color={Colors.textPrimary} />
        </AnimatedPressable>

        <View style={styles.titleWrap}>
          <Text style={styles.title} numberOfLines={1}>{title}</Text>
          {context && <Text style={styles.context} numberOfLines={1}>{context}</Text>}
        </View>

        <View style={styles.actions}>
          <AnimatedPressable
            style={styles.iconBtn}
            scaleValue={0.9}
            onPress={onSearch}
            accessibilityRole="button"
            accessibilityLabel="Search auctions"
          >
            <Ionicons name="search-outline" size={20} color={Colors.textPrimary} />
          </AnimatedPressable>
          {rightIcon && onRightAction ? (
            <AnimatedPressable
              style={styles.iconBtn}
              scaleValue={0.9}
              onPress={onRightAction}
              accessibilityRole="button"
              accessibilityLabel={rightActionLabel ?? 'Action'}
            >
              <Ionicons name={rightIcon} size={20} color={Colors.textPrimary} />
            </AnimatedPressable>
          ) : null}
          <AnimatedPressable
            style={styles.iconBtn}
            scaleValue={0.9}
            onPress={onActivity}
            accessibilityRole="button"
            accessibilityLabel="My auction activity"
          >
            <Ionicons name="notifications-outline" size={20} color={Colors.textPrimary} />
            {activityCount != null && activityCount > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{activityCount > 9 ? '9+' : activityCount}</Text>
              </View>
            )}
          </AnimatedPressable>
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
    gap: Space.sm,
  },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: Radius.full,
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
