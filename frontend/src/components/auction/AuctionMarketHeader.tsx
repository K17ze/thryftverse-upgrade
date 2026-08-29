import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, useWindowDimensions, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space, Radius, Elevation, Stroke } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';

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
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isVerySmall = width < VERY_SMALL_THRESHOLD;
  const [overflowOpen, setOverflowOpen] = useState(false);

  const createAction = actions.find((a) => a.key === 'create');
  const searchAction = actions.find((a) => a.key === 'search');
  const filterAction = actions.find((a) => a.key === 'filter');
  const sellerAction = actions.find((a) => a.key === 'seller');
  const activityAction = actions.find((a) => a.key === 'activity');

  // Show activity in header only when it has a badge needing attention
  const showActivityBadge = activityAction && (activityAction.badgeCount ?? 0) > 0;
  // Filter is a first-class auction action, not a one-row overflow menu. Keep
  // only genuinely secondary destinations in the bounded overflow popover.
  const overflowActions = actions.filter(
    (a) => a.key !== 'search'
      && a.key !== 'create'
      && a.key !== 'filter'
      && !(a.key === 'activity' && showActivityBadge)
  );

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
            <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
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
              <Ionicons name={searchAction.icon} size={22} color={colors.textPrimary} />
            </Pressable>
          )}

          {filterAction && (
            <Pressable
              onPress={filterAction.onPress}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel={filterAction.label}
              style={styles.iconBtn}
            >
              <Ionicons name={filterAction.icon} size={22} color={colors.textPrimary} />
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
              <Ionicons name={activityAction.icon} size={22} color={colors.textPrimary} />
              <View style={styles.badge}>
                <Text style={styles.badgeText}>
                  {activityAction.badgeCount! > 9 ? '9+' : activityAction.badgeCount}
                </Text>
              </View>
            </Pressable>
          )}

          {/* Overflow menu for secondary actions */}
          {overflowActions.length > 0 && (
            <Pressable
              onPress={() => setOverflowOpen(true)}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel="More auction options"
              style={styles.iconBtn}
            >
              <Ionicons name="ellipsis-horizontal" size={22} color={colors.textPrimary} />
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
              <Ionicons name={createAction.icon} size={22} color={colors.brand} />
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
        <Pressable style={styles.overflowBackdrop} onPress={() => setOverflowOpen(false)} accessibilityRole="button">
          <View style={styles.overflowSheet}>
            {overflowActions.map((action) => (
              <Pressable
                key={action.key}
                onPress={() => { setOverflowOpen(false); action.onPress(); }}
                style={styles.overflowRow}
                accessibilityRole="button"
                accessibilityLabel={action.label}
              >
                <Ionicons name={action.icon} size={20} color={colors.textPrimary} />
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
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const createStyles = (colors: ReturnType<typeof useAppTheme>['colors']) => StyleSheet.create({
  header: {
    paddingBottom: Space.sm,
    paddingHorizontal: Space.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    minHeight: 48,
  },
  // Standardized 44x44 hit targets — per AGENTS.md: separate hit area
  // from visible shape. No circular chrome on utility controls.
  iconBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  // Create button — transparent hit target, brand-colored icon.
  // No surfaceAlt circle; the brand color is the visual signal.
  createBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: Space.xs,
  },
  titleWrap: {
    flex: 1,
  },
  title: {
    fontFamily: TypographyV2.screenTitle.fontFamily,
    fontSize: TypographyV2.screenTitle.size,
    color: colors.textPrimary,
    letterSpacing: -0.6,
  },
  // Context elevated — 14pt medium with tighter tracking for editorial feel
  context: {
    fontFamily: TypographyV2.body.fontFamily,
    fontSize: TypographyV2.body.size,
    color: colors.textSecondary,
    marginTop: 2,
    letterSpacing: -0.3,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 0,
  },
  // Refined badge — smaller, hairline border, subtle shadow
  badge: {
    position: 'absolute',
    top: 4,
    right: 4,
    minWidth: 14,
    height: 14,
    borderRadius: Radius.full,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.background,
  },
  badgeText: {
    fontFamily: TypographyV2.meta.fontFamily,
    fontSize: TypographyV2.meta.size,
    color: colors.textInverse,
    fontVariant: ['tabular-nums'],
  },
  overflowBackdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'flex-start',
    alignItems: 'flex-end',
  },
  overflowSheet: {
    marginTop: 120,
    marginRight: Space.md,
    backgroundColor: colors.surface,
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
    fontFamily: TypographyV2.bodyStrong.fontFamily,
    fontSize: TypographyV2.bodyStrong.size,
    color: colors.textPrimary,
  },
  overflowBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: Radius.full,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
    borderWidth: Stroke.standard,
    borderColor: colors.surface,
  },
});
