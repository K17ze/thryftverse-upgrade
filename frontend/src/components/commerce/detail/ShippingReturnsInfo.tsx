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
import { Space, Radius, Control } from '../../../theme/designTokens';
import { TypographyV2 } from '../../../theme/typography.v2';
import { useHaptic } from '../../../hooks/useHaptic';
import { useFormattedPrice } from '../../../hooks/useFormattedPrice';
import { CommerceDetailMetricRow } from './CommerceDetailMetricRow';
import type { ListingCommerceContext } from '../../../platform/product';
import type { SupportedCurrencyCode } from '../../../constants/currencies';

export interface ShippingReturnsInfoProps {
  commerce: ListingCommerceContext;
  /** Truthful backend flag — only render the carbon-neutral badge when true. */
  carbonNeutral?: boolean;
  /** Optional restocking fee (GBP) from a real backend field. When
   *  omitted the restocking row is not rendered — absence of data is
   *  never rendered as "No restocking fee" (a fabricated claim). */
  restockingFeeGbp?: number | null;
}

export function ShippingReturnsInfo({
  commerce,
  carbonNeutral = false,
  restockingFeeGbp = null }: ShippingReturnsInfoProps) {
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const { formatFromFiat, currencyCode } = useFormattedPrice();
  const [expanded, setExpanded] = useState(false);

  const toggle = useCallback(() => {
    haptic.light();
    setExpanded((prev) => !prev);
  }, [haptic]);

  // ── Shipping summary line (always visible) ──
  const isFreeShipping = commerce.shippingPayer === 'seller';
  const hasKnownShippingCost = !isFreeShipping && commerce.shippingPrice != null;
  const shippingCostLabel = (() => {
    if (isFreeShipping) return 'Free shipping';
    if (commerce.shippingPrice != null) {
      return `Shipping: ${formatFromFiat(commerce.shippingPrice, (commerce.currency || currencyCode) as SupportedCurrencyCode, { displayMode: 'fiat' })}`;
    }
    return 'Shipping calculated at checkout';
  })();

  const returnsLabel = commerce.returnPolicy
    ? commerce.returnPolicy.accepted === true
      ? commerce.returnPolicy.windowDays
        ? `${commerce.returnPolicy.windowDays}-day returns`
        : 'Returns accepted'
      : commerce.returnPolicy.accepted === false
        ? 'No returns'
        // accepted === null — undetermined; prefer the server-authored
        // summary, else the truthful checkout-confirmation fallback.
        : commerce.returnPolicy.summary ?? 'Confirmed at checkout'
    : 'Confirmed at checkout';

  const returnsSummary = commerce.returnPolicy?.accepted == null && !commerce.returnPolicy?.summary
    ? 'Return policy confirmed at checkout'
    : returnsLabel;
  const summaryLine = `${shippingCostLabel} · ${returnsSummary}`;

  return (
    <View style={styles.container}>
      <Pressable
        onPress={toggle}
        style={({ pressed }) => [styles.headerRow, pressed && styles.pressed]}
        accessibilityLabel={`Shipping and returns. ${summaryLine}`}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityHint={expanded ? 'Hide shipping and returns details' : 'Show shipping and returns details'}
      >
        <View style={styles.headerLeft}>
          <Text style={[styles.label, { color: colors.textPrimary }]}>
            Shipping & returns
          </Text>
          <Text style={[styles.summary, { color: colors.textSecondary }]}>
            {summaryLine}
          </Text>
        </View>
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={Control.iconCompact}
          color={colors.textMuted}
          accessible={false}
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
              ? formatFromFiat(commerce.shippingPrice, (commerce.currency || currencyCode) as SupportedCurrencyCode, { displayMode: 'fiat' })
              : 'Calculated at checkout'}
            muted={!isFreeShipping && commerce.shippingPrice == null}
          />
          <CommerceDetailMetricRow
            label="Estimated delivery"
            value="Confirmed at checkout"
            muted
          />
          <CommerceDetailMetricRow
            label="Carrier"
            value={commerce.shippingMethod ?? 'Confirmed at checkout'}
            muted={!commerce.shippingMethod}
          />
          {carbonNeutral ? (
            <View style={[styles.badgeRow, { backgroundColor: colors.successSubtle }]}>
              <Ionicons name="leaf" size={14} color={colors.successText} />
              <Text style={[styles.badgeText, { color: colors.successText }]}>
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
          {/* Restocking fee — only rendered when a real backend value
              exists. An explicit 0 means "No restocking fee"; null means
              unknown and the row is omitted rather than fabricating a
              negative claim. */}
          {restockingFeeGbp != null ? (
            <CommerceDetailMetricRow
              label="Restocking fee"
              value={restockingFeeGbp > 0
                ? formatFromFiat(restockingFeeGbp, (commerce.currency || currencyCode) as SupportedCurrencyCode, { displayMode: 'fiat' })
                : 'No restocking fee'}
            />
          ) : null}
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
    // The containing commerce section owns the page inset.
    paddingTop: Space.md,
    paddingBottom: Space.sm },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Space.sm,
    minHeight: 44 },
  pressed: {
    opacity: 0.85 },
  headerLeft: {
    flex: 1,
    gap: Space.xs / 2 },
  label: {
    fontSize: TypographyV2.bodyStrong.size,
    lineHeight: TypographyV2.bodyStrong.lineHeight,
    fontFamily: TypographyV2.bodyStrong.fontFamily },
  summary: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily },
  body: {
    paddingTop: Space.sm },
  groupLabel: {
    fontSize: TypographyV2.label.size,
    lineHeight: TypographyV2.label.lineHeight,
    fontFamily: TypographyV2.label.fontFamily,
    letterSpacing: TypographyV2.label.letterSpacing,
    paddingBottom: Space.xs },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    paddingHorizontal: Space.sm + 2,
    paddingVertical: Space.sm,
    borderRadius: Radius.md,
    marginTop: Space.sm,
    alignSelf: 'flex-start' },
  badgeText: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily },
  conditions: {
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight + 2,
    fontFamily: TypographyV2.body.fontFamily,
    paddingTop: Space.sm } });
