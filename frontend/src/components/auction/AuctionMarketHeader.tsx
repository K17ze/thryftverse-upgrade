import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, useWindowDimensions, Modal, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space, Radius, Typography } from '../../theme/designTokens';

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
  const { colors } = useAppTheme();
  const isVerySmall = width < VERY_SMALL_THRESHOLD;
  const [overflowOpen, setOverflowOpen] = useState(false);

  const createAction = actions.find((a) => a.key === 'create');
  const searchAction = actions.find((a) => a.key === 'search');
  const filterAction = actions.find((a) => a.key === 'filter');
  const sellerAction = actions.find((a) => a.key === 'seller');
  const activityAction = actions.find((a) => a.key === 'activity');

  // Activity shown only when attention badge exists
  const showActivity = activityAction && (activityAction.badgeCount ?? 0) > 0;

  // Overflow contains secondary actions: filter + seller
  const overflowActions = [filterAction, sellerAction].filter(Boolean) as AuctionHeaderAction[];

  const handleOverflowPress = useCallback((action: AuctionHeaderAction) => {
    setOverflowOpen(false);
    action.onPress();
  }, []);

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
            <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
          </Pressable>
        ) : null}

        <View style={styles.titleWrap}>
          <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={1}>{title}</Text>
          {displayContext ? (
            <Text style={[styles.context, { color: colors.textSecondary }]} numberOfLines={1}>{displayContext}</Text>
          ) : null}
        </View>

        <View style={styles.actions}>
          {/* Search — primary discovery action */}
          {searchAction && (
            <Pressable
              onPress={searchAction.onPress}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={searchAction.label}
              style={styles.iconBtn}
            >
              <Ionicons name={searchAction.icon} size={22} color={colors.textPrimary} />
            </Pressable>
          )}

          {/* Activity — visible only when attention badge exists */}
          {showActivity && (
            <Pressable
              onPress={activityAction!.onPress}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={activityAction!.label}
              style={styles.iconBtn}
            >
              <Ionicons name={activityAction!.icon} size={22} color={colors.textPrimary} />
              {activityAction!.badgeCount != null && activityAction!.badgeCount > 0 && (
                <View style={[styles.badge, { backgroundColor: colors.danger, borderColor: colors.background }]}>
                  <Text style={styles.badgeText}>
                    {activityAction!.badgeCount > 9 ? '9+' : activityAction!.badgeCount}
                  </Text>
                </View>
              )}
            </Pressable>
          )}

          {/* Overflow — secondary actions (filter, seller) */}
          {overflowActions.length > 0 && (
            <Pressable
              onPress={() => setOverflowOpen(true)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="More actions"
              style={styles.iconBtn}
            >
              <Ionicons name="ellipsis-horizontal" size={22} color={colors.textPrimary} />
            </Pressable>
          )}

          {/* Create — primary, brand-tinted circle */}
          {createAction && (
            <Pressable
              onPress={createAction.onPress}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={createAction.label}
              style={styles.createBtn}
            >
              <Ionicons name={createAction.icon} size={22} color={colors.brand} />
            </Pressable>
          )}
        </View>
      </View>

      {/* Overflow menu — lightweight modal sheet */}
      <Modal
        visible={overflowOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setOverflowOpen(false)}
      >
        <Pressable style={styles.overflowBackdrop} onPress={() => setOverflowOpen(false)}>
          <View style={[styles.overflowSheet, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
            {overflowActions.map((action, i) => (
              <Pressable
                key={action.key}
                onPress={() => handleOverflowPress(action)}
                style={[
                  styles.overflowItem,
                  i < overflowActions.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
                ]}
                accessibilityRole="button"
                accessibilityLabel={action.label}
              >
                <Ionicons name={action.icon} size={20} color={colors.textPrimary} />
                <Text style={[styles.overflowLabel, { color: colors.textPrimary }]}>{action.label}</Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingBottom: Space.sm - 2,
    paddingHorizontal: Space.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    minHeight: 48,
  },
  iconBtn: {
    width: 36,
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
    marginLeft: 4,
  },
  titleWrap: {
    flex: 1,
  },
  title: {
    fontFamily: Typography.family.bold,
    fontSize: 30,
    letterSpacing: -0.8,
  },
  context: {
    fontFamily: Typography.family.regular,
    fontSize: 13,
    marginTop: 0,
    letterSpacing: -0.1,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 0,
  },
  badge: {
    position: 'absolute',
    top: 5,
    right: 3,
    minWidth: 16,
    height: 16,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 2,
  },
  badgeText: {
    fontFamily: Typography.family.bold,
    fontSize: 9,
    color: '#FFFFFF',
  },
  overflowBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'flex-start',
    alignItems: 'flex-end',
    paddingTop: 100,
    paddingRight: Space.md,
  },
  overflowSheet: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
    minWidth: 200,
  },
  overflowItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  overflowLabel: {
    fontFamily: Typography.family.medium,
    fontSize: 15,
  },
});
