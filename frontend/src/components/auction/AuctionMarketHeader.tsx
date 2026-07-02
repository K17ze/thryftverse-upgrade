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
  /** Compact context for narrow widths */
  compactContext?: string;
}

const SMALL_WIDTH_THRESHOLD = 360;
const VERY_SMALL_THRESHOLD = 320;

export function AuctionMarketHeader({
  title,
  context,
  compactContext,
  showBack,
  onBack,
  actions,
}: Props) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isSmall = width < SMALL_WIDTH_THRESHOLD;
  const isVerySmall = width < VERY_SMALL_THRESHOLD;

  const createAction = actions.find((a) => a.key === 'create');
  const searchAction = actions.find((a) => a.key === 'search');
  const filterAction = actions.find((a) => a.key === 'filter');
  const sellerAction = actions.find((a) => a.key === 'seller');
  const activityAction = actions.find((a) => a.key === 'activity');

  // Activity always shown when attention exists; on very small screens,
  // it's represented by the attention strip but the header control
  // remains when badge > 0
  const showActivity = activityAction && (activityAction.badgeCount ?? 0) > 0;

  // On small widths: Search, Create, Seller always; Filter hidden
  // On very small: same set, context uses compact form
  const showFilter = !isSmall && filterAction;

  // Responsive context
  const displayContext = isVerySmall && compactContext ? compactContext : context;

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
          {displayContext ? (
            <Text style={styles.context} numberOfLines={1}>{displayContext}</Text>
          ) : null}
        </View>

        <View style={styles.actions}>
          {/* Quiet transparent actions — consistent 22px icon size */}
          {searchAction && (
            <Pressable
              onPress={searchAction.onPress}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel={searchAction.label}
              style={styles.iconBtn}
            >
              <Ionicons name={searchAction.icon} size={21} color={Colors.textPrimary} />
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
              <Ionicons name={filterAction!.icon} size={21} color={Colors.textPrimary} />
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
              <Ionicons name={sellerAction.icon} size={21} color={Colors.textPrimary} />
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
              <Ionicons name={activityAction!.icon} size={21} color={Colors.textPrimary} />
              {activityAction!.badgeCount != null && activityAction!.badgeCount > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>
                    {activityAction!.badgeCount > 9 ? '9+' : activityAction!.badgeCount}
                  </Text>
                </View>
              )}
            </Pressable>
          )}

          {/* Create — primary, brand-tinted circle */}
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
    width: 38,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  createBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
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
    fontSize: 28,
    color: Colors.textPrimary,
    letterSpacing: -0.6,
  },
  context: {
    fontFamily: Typography.family.regular,
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 1,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 0,
  },
  badge: {
    position: 'absolute',
    top: 6,
    right: 4,
    minWidth: 15,
    height: 15,
    borderRadius: 999,
    backgroundColor: Colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 1.5,
    borderColor: Colors.background,
  },
  badgeText: {
    fontFamily: Typography.family.bold,
    fontSize: 8,
    color: '#FFFFFF',
  },
});
