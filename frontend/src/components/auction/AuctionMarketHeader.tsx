import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, useWindowDimensions, Modal, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../../constants/colors';
import { Space, Radius, Typography, Elevation } from '../../theme/designTokens';

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
  const isVerySmall = width < VERY_SMALL_THRESHOLD;
  const [overflowOpen, setOverflowOpen] = useState(false);

  const createAction = actions.find((a) => a.key === 'create');
  const searchAction = actions.find((a) => a.key === 'search');
  const filterAction = actions.find((a) => a.key === 'filter');
  const sellerAction = actions.find((a) => a.key === 'seller');
  const activityAction = actions.find((a) => a.key === 'activity');

  // Overflow actions: filter, seller, activity (when no badge)
  const overflowActions = actions.filter(
    (a) => a.key !== 'search' && a.key !== 'create'
  );
  // Show activity in header only when it has a badge needing attention
  const showActivityBadge = activityAction && (activityAction.badgeCount ?? 0) > 0;

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
            <Ionicons name="chevron-back" size={24} color={Colors.textPrimary} />
          </Pressable>
        ) : null}

        <View style={styles.titleWrap}>
          <Text style={styles.title} numberOfLines={1}>{title}</Text>
          {displayContext ? (
            <Text style={styles.context} numberOfLines={1}>{displayContext}</Text>
          ) : null}
        </View>

        <View style={styles.actions}>
          {/* Primary action: Search */}
          {searchAction && (
            <Pressable
              onPress={searchAction.onPress}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel={searchAction.label}
              style={styles.iconBtn}
            >
              <Ionicons name={searchAction.icon} size={22} color={Colors.textPrimary} />
            </Pressable>
          )}

          {/* Activity badge — only shown when attention is needed */}
          {showActivityBadge && activityAction && (
            <Pressable
              onPress={activityAction.onPress}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel={activityAction.label}
              style={styles.iconBtn}
            >
              <Ionicons name={activityAction.icon} size={22} color={Colors.textPrimary} />
              <View style={styles.badge}>
                <Text style={styles.badgeText}>
                  {activityAction.badgeCount! > 9 ? '9+' : activityAction.badgeCount}
                </Text>
              </View>
            </Pressable>
          )}

          {/* Overflow menu for secondary actions */}
          {overflowActions.length > 0 && !showActivityBadge && (
            <Pressable
              onPress={() => setOverflowOpen(true)}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel="More auction options"
              style={styles.iconBtn}
            >
              <Ionicons name="ellipsis-horizontal" size={22} color={Colors.textPrimary} />
            </Pressable>
          )}

          {/* Primary action: Create */}
          {createAction && (
            <Pressable
              onPress={createAction.onPress}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel={createAction.label}
              style={styles.createBtn}
            >
              <Ionicons name={createAction.icon} size={22} color={Colors.brand} />
            </Pressable>
          )}
        </View>
      </View>

      {/* Overflow modal */}
      <Modal
        visible={overflowOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setOverflowOpen(false)}
      >
        <Pressable style={styles.overflowBackdrop} onPress={() => setOverflowOpen(false)}>
          <View style={styles.overflowSheet}>
            <ScrollView showsVerticalScrollIndicator={false}>
              {overflowActions.map((action) => (
                <Pressable
                  key={action.key}
                  onPress={() => { setOverflowOpen(false); action.onPress(); }}
                  style={styles.overflowRow}
                  accessibilityRole="button"
                  accessibilityLabel={action.label}
                >
                  <Ionicons name={action.icon} size={20} color={Colors.textPrimary} />
                  <Text style={styles.overflowLabel}>{action.label}</Text>
                  {action.badgeCount != null && action.badgeCount > 0 && (
                    <View style={styles.overflowBadge}>
                      <Text style={styles.badgeText}>
                        {action.badgeCount > 9 ? '9+' : action.badgeCount}
                      </Text>
                    </View>
                  )}
                </Pressable>
              ))}
            </ScrollView>
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
    color: Colors.textPrimary,
    letterSpacing: -0.8,
  },
  context: {
    fontFamily: Typography.family.regular,
    fontSize: 13,
    color: Colors.textSecondary,
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
    backgroundColor: Colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 2,
    borderColor: Colors.background,
  },
  badgeText: {
    fontFamily: Typography.family.bold,
    fontSize: 9,
    color: Colors.textInverse,
  },
  overflowBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-start',
    alignItems: 'flex-end',
  },
  overflowSheet: {
    marginTop: 120,
    marginRight: Space.md,
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    paddingVertical: Space.xs,
    minWidth: 220,
    ...Elevation.floating,
  },
  overflowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm + 2,
  },
  overflowLabel: {
    flex: 1,
    fontFamily: Typography.family.medium,
    fontSize: 15,
    color: Colors.textPrimary,
  },
  overflowBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: Radius.full,
    backgroundColor: Colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
});
