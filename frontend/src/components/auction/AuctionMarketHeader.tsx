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

  const createAction = actions.find((a) => a.key === 'create');
  const searchAction = actions.find((a) => a.key === 'search');
  const filterAction = actions.find((a) => a.key === 'filter');
  const sellerAction = actions.find((a) => a.key === 'seller');
  const activityAction = actions.find((a) => a.key === 'activity');

  // Activity only shows in header when there's genuine attention
  const showActivity = activityAction && (activityAction.badgeCount ?? 0) > 0;

  // On small widths: Search, Create, Seller always; Filter hidden; Activity via strip
  const showFilter = !isSmall && filterAction;

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
          {/* Quiet transparent actions */}
          {searchAction && (
            <Pressable
              onPress={searchAction.onPress}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel={searchAction.label}
              style={styles.iconBtn}
            >
              <Ionicons name={searchAction.icon} size={20} color={Colors.textPrimary} />
            </Pressable>
          )}
          {showFilter && (
            <Pressable
              onPress={filterAction!.onPress}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel={filterAction!.label}
              style={styles.iconBtn}
            >
              <Ionicons name={filterAction!.icon} size={20} color={Colors.textPrimary} />
            </Pressable>
          )}
          {sellerAction && (
            <Pressable
              onPress={sellerAction.onPress}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel={sellerAction.label}
              style={styles.iconBtn}
            >
              <Ionicons name={sellerAction.icon} size={20} color={Colors.textPrimary} />
            </Pressable>
          )}
          {showActivity && (
            <Pressable
              onPress={activityAction!.onPress}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel={activityAction!.label}
              style={styles.iconBtn}
            >
              <Ionicons name={activityAction!.icon} size={20} color={Colors.textPrimary} />
              {activityAction!.badgeCount != null && activityAction!.badgeCount > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>
                    {activityAction!.badgeCount > 9 ? '9+' : activityAction!.badgeCount}
                  </Text>
                </View>
              )}
            </Pressable>
          )}

          {/* Create — primary, brand-tinted */}
          {createAction && (
            <Pressable
              onPress={createAction.onPress}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel={createAction.label}
              style={styles.createBtn}
            >
              <Ionicons name={createAction.icon} size={20} color={Colors.brand} />
            </Pressable>
          )}
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
    width: 40,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  createBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(244,240,232,0.10)',
    marginLeft: 2,
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
    gap: 0,
  },
  badge: {
    position: 'absolute',
    top: 4,
    right: 2,
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
