import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../../theme/ThemeContext';
import { Space, Radius, FontFamily, Control, PressScale } from '../../../theme/designTokens';
import { TypographyV2 } from '../../../theme/typography.v2';
import { formatCoOwnIze } from '../../../utils/currency';
import type { AssetLifecycleState } from './types';

export interface CoOwnActionDockProps {
  lifecycleState: AssetLifecycleState;
  unitPriceGbp: number;
  availableUnits: number;
  isHolder: boolean;
  isIssuer: boolean;
  holdingsError: boolean;
  orderBookError: boolean;
  reconciliationActive: boolean;
  hasIncompleteRights: boolean;
  buyerProtection?: boolean;
  onTradePress: (side: 'buy' | 'sell') => void;
  onRetryHoldings: () => void;
  onRetryOrderBook: () => void;
  onOpenRights: () => void;
  onViewOrders: () => void;
}

export function CoOwnActionDock({
  lifecycleState,
  unitPriceGbp,
  availableUnits,
  isHolder,
  isIssuer,
  holdingsError,
  orderBookError,
  reconciliationActive,
  hasIncompleteRights,
  buyerProtection = true,
  onTradePress,
  onRetryHoldings,
  onRetryOrderBook,
  onOpenRights,
  onViewOrders,
}: CoOwnActionDockProps) {
  const { colors, isDark } = useAppTheme();
  const insets = useSafeAreaInsets();

  const bottomInset = Math.max(insets.bottom, Space.xs);

  // Case 1: Holdings error
  if (!isIssuer && holdingsError) {
    return (
      <View style={[styles.dockContainer, { backgroundColor: colors.background, paddingBottom: bottomInset, borderTopColor: colors.borderSubtle }]}>
        <View style={styles.dockContent}>
          <View style={styles.infoCol}>
            <Text style={[styles.dockBadgeText, { color: colors.warning }]}>Position unavailable</Text>
            <Text style={[styles.dockSubtitle, { color: colors.textSecondary }]}>
              Holdings must be verified before trading
            </Text>
          </View>
          <Pressable
            onPress={onRetryHoldings}
            style={({ pressed }) => [styles.actionButton, { backgroundColor: colors.brand }, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="Retry holdings"
          >
            <Text style={[styles.btnText, { color: colors.surface }]}>Retry</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // Case 2: Market reconciling or error
  if (!isIssuer && (orderBookError || reconciliationActive)) {
    return (
      <View style={[styles.dockContainer, { backgroundColor: colors.background, paddingBottom: bottomInset, borderTopColor: colors.borderSubtle }]}>
        <View style={styles.dockContent}>
          <View style={styles.infoCol}>
            <Text style={[styles.dockBadgeText, { color: colors.warning }]}>
              {reconciliationActive ? 'Market updating' : 'Market unavailable'}
            </Text>
            <Text style={[styles.dockSubtitle, { color: colors.textSecondary }]}>
              {reconciliationActive ? 'Orders paused while balances settle' : 'Live orders could not be verified'}
            </Text>
          </View>
          <Pressable
            onPress={onRetryOrderBook}
            style={({ pressed }) => [styles.actionButton, { backgroundColor: colors.surfaceAlt }, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="Check market status"
          >
            <Text style={[styles.btnText, { color: colors.textPrimary }]}>
              {reconciliationActive ? 'Status' : 'Retry'}
            </Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // Case 3: Incomplete rights
  if (hasIncompleteRights && !isIssuer) {
    return (
      <View style={[styles.dockContainer, { backgroundColor: colors.background, paddingBottom: bottomInset, borderTopColor: colors.borderSubtle }]}>
        <View style={styles.dockContent}>
          <View style={styles.infoCol}>
            <Text style={[styles.dockBadgeText, { color: colors.warning }]}>Rights review required</Text>
            <Text style={[styles.dockSubtitle, { color: colors.textSecondary }]}>
              Terms must be confirmed before order entry
            </Text>
          </View>
          <Pressable
            onPress={onOpenRights}
            style={({ pressed }) => [styles.actionButton, { backgroundColor: colors.brand }, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="Review rights"
          >
            <Text style={[styles.btnText, { color: colors.surface }]}>Review rights</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // Case 4: Issuer view
  if (isIssuer) {
    return (
      <View style={[styles.dockContainer, { backgroundColor: colors.background, paddingBottom: bottomInset, borderTopColor: colors.borderSubtle }]}>
        <View style={styles.dockContent}>
          <View style={styles.infoCol}>
            <Text style={[styles.dockBadgeText, { color: colors.brand }]}>Issuer management</Text>
            <Text style={[styles.dockSubtitle, { color: colors.textSecondary }]}>
              {availableUnits} units available in float
            </Text>
          </View>
          <Pressable
            onPress={onViewOrders}
            style={({ pressed }) => [styles.actionButton, { backgroundColor: colors.brand }, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="View syndicate orders"
          >
            <Text style={[styles.btnText, { color: colors.surface }]}>View orders</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // Case 5: Trading paused / exit underway
  if (lifecycleState === 'tradingPaused' || lifecycleState === 'exitUnderway') {
    return (
      <View style={[styles.dockContainer, { backgroundColor: colors.background, paddingBottom: bottomInset, borderTopColor: colors.borderSubtle }]}>
        <View style={styles.dockContent}>
          <View style={styles.infoCol}>
            <Text style={[styles.dockBadgeText, { color: colors.textSecondary }]}>
              {lifecycleState === 'tradingPaused' ? 'Trading paused' : 'Exit underway'}
            </Text>
            <Text style={[styles.dockSubtitle, { color: colors.textMuted }]}>
              {lifecycleState === 'tradingPaused' ? 'Orders temporarily halted' : 'Proceeds distribution in progress'}
            </Text>
          </View>
          <Pressable
            onPress={onViewOrders}
            style={({ pressed }) => [styles.actionButton, { backgroundColor: colors.surfaceAlt }, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="View order history"
          >
            <Text style={[styles.btnText, { color: colors.textPrimary }]}>History</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // Case 6: Active market
  return (
    <View style={[styles.dockContainer, { backgroundColor: colors.background, paddingBottom: bottomInset, borderTopColor: colors.borderSubtle }]}>
      {buyerProtection && (
        <View style={styles.safeguardStrip}>
          <Ionicons name="shield-checkmark" size={12} color={colors.brand} />
          <Text style={[styles.safeguardText, { color: colors.textSecondary }]}>
            Regulated Custody Safeguarded · Escrow Protected
          </Text>
        </View>
      )}

      <View style={styles.dockContent}>
        {isHolder ? (
          <>
            {/* Dual action for holders: Sell and Buy More */}
            <Pressable
              onPress={() => onTradePress('sell')}
              style={({ pressed }) => [
                styles.actionButton,
                styles.halfButton,
                { backgroundColor: colors.surfaceAlt, borderColor: colors.borderSubtle, borderWidth: 1 },
                pressed && styles.pressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Sell units"
            >
              <Text style={[styles.btnText, { color: colors.textPrimary }]}>Sell units</Text>
            </Pressable>

            <Pressable
              onPress={() => onTradePress('buy')}
              style={({ pressed }) => [
                styles.actionButton,
                styles.halfButton,
                { backgroundColor: colors.brand },
                pressed && styles.pressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Buy more units"
            >
              <Text style={[styles.btnText, { color: colors.surface }]}>Buy more</Text>
            </Pressable>
          </>
        ) : (
          /* Single primary action for non-holders */
          <Pressable
            onPress={() => onTradePress('buy')}
            style={({ pressed }) => [
              styles.actionButton,
              styles.fullButton,
              { backgroundColor: colors.brand },
              pressed && styles.pressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel={`Buy units at ${formatCoOwnIze(unitPriceGbp)} per unit`}
          >
            <Text style={[styles.btnText, { color: colors.surface }]}>
              {availableUnits > 0
                ? `Buy units · ${formatCoOwnIze(unitPriceGbp)} / unit`
                : 'Place buying bid'}
            </Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  dockContainer: {
    paddingHorizontal: Space.md,
    paddingTop: Space.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  safeguardStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingBottom: 4,
  },
  safeguardText: {
    fontSize: 10,
    fontFamily: FontFamily.medium,
    letterSpacing: 0.2,
  },
  dockContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    minHeight: Control.hit,
  },
  infoCol: {
    flex: 1,
  },
  dockBadgeText: {
    fontSize: TypographyV2.captionElevated.size,
    fontFamily: FontFamily.semibold,
  },
  dockSubtitle: {
    fontSize: 11,
    fontFamily: FontFamily.regular,
  },
  actionButton: {
    height: Control.hit,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Space.md,
  },
  halfButton: {
    flex: 1,
  },
  fullButton: {
    flex: 1,
  },
  btnText: {
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: FontFamily.semibold,
  },
  pressed: {
    opacity: 0.85,
    transform: [{ scale: PressScale.gentle }],
  },
});
