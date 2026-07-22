/**
 * CoOwnConciergeCTA — RFQ / concierge path for thin markets.
 *
 * When a market is thin (no opposite side, no recent trades, or
 * wide spread), the one-tap Buy/Sell is replaced by a concierge CTA.
 * This prevents implying liquidity that doesn't exist (source §6.9,
 * §11, doc 07 §1.5).
 *
 * The CTA offers two paths:
 * 1. Request quote — for a specific size
 * 2. Join auction — if a call auction is scheduled
 *
 * See docs/coown/flagship-exchange-upgrade/09 Phase 6 §3 + 07 §1.5.
 */

import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space, Radius, Type, Typography } from '../../theme/designTokens';
import { AnimatedPressable } from '../AnimatedPressable';
import { haptics } from '../../utils/haptics';

export type ConciergeReason = 'no_opposite_side' | 'wide_spread' | 'no_recent_trades' | 'halted' | 'restricted';

export interface CoOwnConciergeCTAProps {
  /** Why the concierge CTA is shown instead of the normal trade flow. */
  reason: ConciergeReason;
  /** Asset title for context. */
  assetTitle?: string;
  /** Spread label (when reason is wide_spread). */
  spreadLabel?: string;
  /** Last trade age label (when reason is no_recent_trades). */
  lastTradeAgeLabel?: string;
  /** Next auction time label (when available). */
  nextAuctionLabel?: string;
  /** Indicative auction price label. */
  indicativeAuctionPriceLabel?: string;
  /** onPress for "Request quote". */
  onRequestQuote?: () => void;
  /** onPress for "Join auction". */
  onJoinAuction?: () => void;
  /** onPress for "Contact concierge". */
  onContactConcierge?: () => void;
}

const REASON_CONFIG: Record<ConciergeReason, { title: string; message: string; icon: string }> = {
  no_opposite_side: {
    title: 'No sellers right now',
    message: 'There are no open sell orders for this asset. Request a quote and the market maker will seek a counterparty.',
    icon: 'search-outline',
  },
  wide_spread: {
    title: 'Wide spread',
    message: 'The bid-ask spread is wide, indicating thin liquidity. A quote request may get you a better price than a market order.',
    icon: 'arrows-horizontal-outline',
  },
  no_recent_trades: {
    title: 'No recent trades',
    message: 'This asset has not traded recently. Request a quote for an indicative price, or join the next call auction.',
    icon: 'time-outline',
  },
  halted: {
    title: 'Trading halted',
    message: 'Trading is temporarily halted. Contact concierge for assistance.',
    icon: 'pause-circle-outline',
  },
  restricted: {
    title: 'Not eligible in your region',
    message: 'This instrument is not available for trading in your jurisdiction. Contact concierge for eligibility information.',
    icon: 'lock-closed-outline',
  },
};

export function CoOwnConciergeCTA({
  reason,
  assetTitle,
  spreadLabel,
  lastTradeAgeLabel,
  nextAuctionLabel,
  indicativeAuctionPriceLabel,
  onRequestQuote,
  onJoinAuction,
  onContactConcierge,
}: CoOwnConciergeCTAProps) {
  const { colors } = useAppTheme();
  const config = REASON_CONFIG[reason];

  const handleRequestQuote = () => {
    haptics.tap();
    onRequestQuote?.();
  };

  const handleJoinAuction = () => {
    haptics.tap();
    onJoinAuction?.();
  };

  const handleContactConcierge = () => {
    onContactConcierge?.();
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      {/* Header */}
      <View style={styles.headerRow}>
        <View style={[styles.iconWrap, { backgroundColor: colors.brand + '12' }]}>
          <Ionicons name={config.icon as any} size={20} color={colors.brand} />
        </View>
        <View style={styles.headerText}>
          <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={2}>
            {config.title}
          </Text>
          {assetTitle && (
            <Text style={[styles.assetTitle, { color: colors.textMuted }]} numberOfLines={1}>
              {assetTitle}
            </Text>
          )}
        </View>
      </View>

      {/* Message */}
      <Text style={[styles.message, { color: colors.textSecondary }]}>
        {config.message}
      </Text>

      {/* Context details */}
      {(spreadLabel || lastTradeAgeLabel) && (
        <View style={[styles.contextRow, { borderColor: colors.border }]}>
          {spreadLabel && (
            <View style={styles.contextItem}>
              <Text style={[styles.contextLabel, { color: colors.textMuted }]}>Spread</Text>
              <Text style={[styles.contextValue, { color: colors.textSecondary }]}>{spreadLabel}</Text>
            </View>
          )}
          {lastTradeAgeLabel && (
            <View style={styles.contextItem}>
              <Text style={[styles.contextLabel, { color: colors.textMuted }]}>Last trade</Text>
              <Text style={[styles.contextValue, { color: colors.textSecondary }]}>{lastTradeAgeLabel}</Text>
            </View>
          )}
        </View>
      )}

      {/* Auction info */}
      {nextAuctionLabel && (
        <View style={[styles.auctionCard, { backgroundColor: colors.warning + '12', borderColor: colors.warning + '40' }]}>
          <View style={styles.auctionHeader}>
            <Ionicons name="time-outline" size={14} color={colors.warning} />
            <Text style={[styles.auctionTitle, { color: colors.warning }]}>Next call auction</Text>
          </View>
          <Text style={[styles.auctionTime, { color: colors.textSecondary }]}>
            {nextAuctionLabel}
          </Text>
          {indicativeAuctionPriceLabel && (
            <Text style={[styles.auctionPrice, { color: colors.textMuted }]}>
              Indicative uncrossing: {indicativeAuctionPriceLabel}
            </Text>
          )}
        </View>
      )}

      {/* Actions */}
      <View style={styles.actionCol}>
        {onRequestQuote && reason !== 'halted' && reason !== 'restricted' && (
          <Pressable
            onPress={handleRequestQuote}
            style={[styles.primaryBtn, { backgroundColor: colors.brand }]}
            accessibilityRole="button"
            accessibilityLabel={`Request quote for ${assetTitle ?? 'this asset'}`}
          >
            <Ionicons name="chatbubbles-outline" size={16} color={colors.background} />
            <Text style={[styles.primaryBtnText, { color: colors.background }]}>Request quote</Text>
          </Pressable>
        )}
        {onJoinAuction && nextAuctionLabel && (
          <Pressable
            onPress={handleJoinAuction}
            style={[styles.secondaryBtn, { borderColor: colors.border }]}
            accessibilityRole="button"
            accessibilityLabel={`Join the next call auction for ${assetTitle ?? 'this asset'}`}
          >
            <Ionicons name="people-outline" size={16} color={colors.textPrimary} />
            <Text style={[styles.secondaryBtnText, { color: colors.textPrimary }]}>Join auction</Text>
          </Pressable>
        )}
        {onContactConcierge && (
          <AnimatedPressable
            onPress={handleContactConcierge}
            style={styles.conciergeRow}
            accessibilityRole="button"
            accessibilityLabel="Contact concierge"
            scaleValue={0.98}
            hapticFeedback="light"
          >
            <Ionicons name="headset-outline" size={14} color={colors.textSecondary} />
            <Text style={[styles.conciergeText, { color: colors.textSecondary }]}>
              Contact concierge
            </Text>
            <Ionicons name="chevron-forward" size={13} color={colors.textMuted} />
          </AnimatedPressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Space.md,
    gap: Space.sm,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Space.sm,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  headerText: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: Type.bodyEmphasis.size,
    lineHeight: Type.bodyEmphasis.lineHeight,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.bodyEmphasis.letterSpacing,
  },
  assetTitle: {
    fontSize: Type.caption.size,
    lineHeight: Type.caption.lineHeight,
    fontFamily: Typography.family.regular,
    letterSpacing: Type.caption.letterSpacing,
  },
  message: {
    fontSize: Type.caption.size,
    lineHeight: Type.caption.lineHeight + 2,
    fontFamily: Typography.family.regular,
    letterSpacing: Type.caption.letterSpacing,
  },
  contextRow: {
    flexDirection: 'row',
    gap: Space.lg,
    paddingTop: Space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  contextItem: {
    gap: 2,
  },
  contextLabel: {
    fontSize: Type.meta.size,
    lineHeight: Type.meta.lineHeight,
    fontFamily: Typography.family.medium,
    letterSpacing: Type.metaElevated.letterSpacing,
    textTransform: 'uppercase',
  },
  contextValue: {
    fontSize: Type.body.size,
    lineHeight: Type.body.lineHeight,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.body.letterSpacing,
    fontVariant: ['tabular-nums'],
  },
  auctionCard: {
    borderRadius: Radius.md,
    borderWidth: 1,
    padding: Space.sm,
    gap: Space.xs,
  },
  auctionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
  },
  auctionTitle: {
    fontSize: Type.bodyEmphasis.size,
    lineHeight: Type.bodyEmphasis.lineHeight,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.bodyEmphasis.letterSpacing,
  },
  auctionTime: {
    fontSize: Type.body.size,
    lineHeight: Type.body.lineHeight,
    fontFamily: Typography.family.regular,
    letterSpacing: Type.body.letterSpacing,
  },
  auctionPrice: {
    fontSize: Type.meta.size,
    lineHeight: Type.meta.lineHeight,
    fontFamily: Typography.family.regular,
    letterSpacing: Type.meta.letterSpacing,
  },
  actionCol: {
    gap: Space.sm,
    marginTop: Space.xs,
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.xs,
    minHeight: 48,
    paddingVertical: Space.sm + 4,
    borderRadius: Radius.md,
  },
  primaryBtnText: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.body.letterSpacing,
  },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.xs,
    minHeight: 44,
    paddingVertical: Space.sm + 2,
    borderRadius: Radius.md,
    borderWidth: 1,
  },
  secondaryBtnText: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.body.letterSpacing,
  },
  conciergeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.xs,
    paddingVertical: Space.sm,
    minHeight: 44,
  },
  conciergeText: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.medium,
    letterSpacing: Type.body.letterSpacing,
  },
});

export default CoOwnConciergeCTA;
