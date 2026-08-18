/**
 * ShippingReturnsInfo — expandable shipping & returns section for the
 * product page.
 *
 * Per AGENTS.md §4: flat canvas section with a hairline divider, no
 * nested card. Reuses `CommerceDetailMetricRow` for the detail rows so
 * the tabular-numeral rhythm matches the rest of the detail page.
 *
 * Truthful UI (AGENTS.md §11): every value is derived from the
 * `ListingCommerceContext`. Missing values render as muted "Confirmed at
 * checkout" copy, never fabricated. The carbon-neutral badge only
 * renders when `carbonNeutral` is explicitly true (the screen must pass
 * a truthful backend flag — none is fabricated here).
 */
import React, { useState, useCallback } from 'react';
import { View, StyleSheet, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../../theme/ThemeContext';
import { Space, Type, Typography, Radius } from '../../../theme/designTokens';
import { useHaptic } from '../../../hooks/useHaptic';
import { useReducedMotion } from '../../../hooks/useReducedMotion';
import { useFormattedPrice } from '../../../hooks/useFormattedPrice';
import { CommerceDetailMetricRow } from './CommerceDetailMetricRow';
import type { ListingCommerceContext } from '../../../platform/product';
import type { SupportedCurrencyCode } from '../../../constants/currencies';
import { formatShortDate } from '../../../utils/dateFormat';

export interface ShippingReturnsInfoProps {
  commerce: ListingCommerceContext;
  /** Truthful backend flag — only render the carbon-neutral badge when true. */
  carbonNeutral?: boolean;
  /** Optional restocking fee (GBP). When omitted, "No restocking fee" is shown. */
  restockingFeeGbp?: number | null;
}

export function ShippingReturnsInfo({
  commerce,
  carbonNeutral = false,
  restockingFeeGbp = null,
}: ShippingReturnsInfoProps) {
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const reducedMotion = useReducedMotion();
  const { formatFromFiat } = useFormattedPrice();
  const [expanded, setExpanded] = useState(false);

  const toggle = useCallback(() => {
    if (!reducedMotion) haptic.light();
    setExpanded((prev) => !prev);
  }, [haptic, reducedMotion]);

  // ── Shipping summary line (always visible) ──
  const isFreeShipping = commerce.shippingPayer === 'seller';
  const hasKnownShippingCost = !isFreeShipping && commerce.shippingPrice != null;
  const shippingCostLabel = (() => {
    if (isFreeShipping) return 'Free shipping';
    if (commerce.shippingPrice != null) {
      return `Shipping: ${formatFromFiat(commerce.shippingPrice, (commerce.currency || 'GBP') as SupportedCurrencyCode, { displayMode: 'fiat' })}`;
    }
    return 'Shipping calculated at checkout';
  })();

  const deliveryWindow = (() => {
    const start = commerce.estimatedDeliveryStart;
    const end = commerce.estimatedDeliveryEnd;
    if (!start && !end) return null;
    const fmt = (iso: string) => formatShortDate(iso);
    if (start && end) return `${fmt(start)}–${fmt(end)}`;
    return fmt(start ?? end!);
  })();

  const returnsLabel = commerce.returnPolicy
    ? commerce.returnPolicy.accepted
      ? commerce.returnPolicy.windowDays
        ? `${commerce.returnPolicy.windowDays}-day returns`
        : 'Returns accepted'
      : 'No returns'
    : 'Confirmed at checkout';

  const restockingLabel = restockingFeeGbp != null && restockingFeeGbp > 0
    ? formatFromFiat(restockingFeeGbp, (commerce.currency || 'GBP') as SupportedCurrencyCode, { displayMode: 'fiat' })
    : 'No restocking fee';

  const summaryLine = [shippingCostLabel, deliveryWindow ? `Est. delivery: ${deliveryWindow}` : null]
    .filter(Boolean)
    .join(' · ');

  return (
    <View style={styles.container}>
      <Pressable
        onPress={toggle}
        style={({ pressed }) => [styles.headerRow, pressed && styles.pressed]}
        accessibilityLabel={expanded ? 'Hide shipping and returns details' : 'Show shipping and returns details'}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityHint="Expands the full shipping and returns policy"
      >
        <View style={styles.headerLeft}>
          <Text style={[styles.label, { color: colors.textPrimary }]}>
            Shipping & Returns
          </Text>
          <View style={styles.summaryRow}>
            {isFreeShipping ? (
              <Ionicons name="checkmark-circle" size={14} color={colors.success} />
            ) : hasKnownShippingCost ? (
              <Ionicons name="cube-outline" size={14} color={colors.textSecondary} />
            ) : (
              <Ionicons name="information-circle-outline" size={14} color={colors.textSecondary} />
            )}
            <Text style={[styles.summary, { color: colors.textSecondary }]} numberOfLines={2}>
              {summaryLine || returnsLabel}
            </Text>
          </View>
        </View>
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={18}
          color={colors.textMuted}
        />
      </Pressable>

      {expanded ? (
        <View style={styles.body}>
          {/* Shipping */}
          <Text style={[styles.groupLabel, { color: colors.textMuted }]}>
            Shipping
          </Text>
          <CommerceDetailMetricRow
            label="Shipping cost"
            value={isFreeShipping ? 'Free shipping' : hasKnownShippingCost && commerce.shippingPrice != null
              ? formatFromFiat(commerce.shippingPrice, (commerce.currency || 'GBP') as SupportedCurrencyCode, { displayMode: 'fiat' })
              : 'Calculated at checkout'}
            muted={!isFreeShipping && commerce.shippingPrice == null}
          />
          <CommerceDetailMetricRow
            label="Estimated delivery"
            value={deliveryWindow ?? 'Confirmed at checkout'}
            muted={!deliveryWindow}
          />
          <CommerceDetailMetricRow
            label="Carrier"
            value={commerce.shippingMethod ?? 'Confirmed at checkout'}
            muted={!commerce.shippingMethod}
          />
          {carbonNeutral ? (
            <View style={[styles.badgeRow, { backgroundColor: `${colors.success}14` }]}>
              <Ionicons name="leaf" size={14} color={colors.success} />
              <Text style={[styles.badgeText, { color: colors.success }]}>
                Carbon-neutral shipping
              </Text>
            </View>
          ) : null}

          {/* Returns */}
          <Text style={[styles.groupLabel, { color: colors.textMuted, marginTop: Space.md }]}>
            Returns
          </Text>
          <CommerceDetailMetricRow
            label="Return window"
            value={returnsLabel}
            muted={!commerce.returnPolicy}
          />
          <CommerceDetailMetricRow
            label="Restocking fee"
            value={restockingLabel}
            muted={restockingFeeGbp == null}
          />
          {commerce.returnPolicy?.conditions ? (
            <Text style={[styles.conditions, { color: colors.textSecondary }]}>
              {commerce.returnPolicy.conditions}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: Space.md,
    paddingTop: Space.md,
    paddingBottom: Space.sm,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Space.sm,
    minHeight: 44,
  },
  pressed: {
    opacity: 0.7,
  },
  headerLeft: {
    flex: 1,
    gap: Space.xs / 2,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    flexShrink: 1,
  },
  label: {
    fontSize: Type.bodyStrong.size,
    lineHeight: Type.bodyStrong.lineHeight,
    fontFamily: Typography.family.semibold,
  },
  summary: {
    fontSize: Type.caption.size,
    lineHeight: Type.caption.lineHeight,
    fontFamily: Typography.family.regular,
  },
  body: {
    paddingTop: Space.sm,
  },
  groupLabel: {
    fontSize: Type.label.size,
    lineHeight: Type.label.lineHeight,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.label.letterSpacing,
    textTransform: 'uppercase',
    paddingBottom: Space.xs,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    paddingHorizontal: Space.sm + 2,
    paddingVertical: Space.sm,
    borderRadius: Radius.md,
    marginTop: Space.sm,
    alignSelf: 'flex-start',
  },
  badgeText: {
    fontSize: Type.caption.size,
    lineHeight: Type.caption.lineHeight,
    fontFamily: Typography.family.semibold,
  },
  conditions: {
    fontSize: Type.body.size,
    lineHeight: Type.body.lineHeight + 2,
    fontFamily: Typography.family.regular,
    paddingTop: Space.sm,
  },
});
