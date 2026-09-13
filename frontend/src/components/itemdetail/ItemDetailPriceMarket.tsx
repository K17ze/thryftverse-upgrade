import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/ThemeContext';
import { AnimatedPressable } from '../AnimatedPressable';
import {
  CommerceDetailSection,
  CommerceDetailDisclosureRow,
  CommerceDetailMetricRow,
} from '../commerce/detail';
import { Space, FontFamily, Control, Stroke } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { RadiusRoleValue } from '../../theme/surfaceRadiusRules';
import type { ItemDetailPriceInsightRow } from '../../hooks/itemDetail/itemDetailDerived';

export interface ItemDetailPriceMarketProps {
  /** Truthful price-insight rows (empty → section hidden). */
  rows: ItemDetailPriceInsightRow[];
  /** One-line summary surfaced on the collapsed disclosure row. */
  summary: string | undefined;
  /** Progressive-disclosure state for the full breakdown. */
  expanded: boolean;
  onToggleExpanded: () => void;
  /** Whether the price-drop alert toggle row is offered. */
  showPriceAlert: boolean;
  priceAlertEnabled: boolean;
  priceAlertLoading: boolean;
  onTogglePriceAlert: () => void;
}

/**
 * Price history & market — consolidated disclosure: one inline insight
 * surfaces the most material fact (price drop, sold comparables, etc.);
 * the full breakdown expands on tap. Includes the price-drop alert
 * switch when a discount makes the alert meaningful.
 */
export function ItemDetailPriceMarket({
  rows,
  summary,
  expanded,
  onToggleExpanded,
  showPriceAlert,
  priceAlertEnabled,
  priceAlertLoading,
  onTogglePriceAlert,
}: ItemDetailPriceMarketProps) {
  const { colors } = useAppTheme();

  if (rows.length === 0) return null;

  return (
    <>
      <CommerceDetailDisclosureRow
        label={expanded ? 'Hide price history' : 'Price history & market'}
        summary={summary}
        onPress={onToggleExpanded}
        leadingIcon="trending-up-outline"
        accessibilityLabel="Toggle price history and market"
      />
      {expanded ? (
        <CommerceDetailSection label="Price history & market" variant="continuation">
          {rows.map((row) => (
            <CommerceDetailMetricRow
              key={row.label}
              label={row.label}
              value={row.value}
              muted={row.muted}
            />
          ))}
          {showPriceAlert ? (
            <AnimatedPressable
              onPress={onTogglePriceAlert}
              disabled={priceAlertLoading}
              style={styles.alertRow}
              scaleValue={0.98}
              hapticFeedback="light"
              accessibilityRole="switch"
              accessibilityState={{
                checked: priceAlertEnabled,
                disabled: priceAlertLoading,
                busy: priceAlertLoading,
              }}
              accessibilityLabel={priceAlertEnabled ? 'Disable price drop alert' : 'Enable price drop alert'}
            >
              <View style={styles.alertRowLeft}>
                <Ionicons
                  name={priceAlertEnabled ? 'notifications' : 'notifications-outline'}
                  size={18}
                  color={priceAlertEnabled ? colors.brand : colors.textSecondary}
                />
                <Text style={[styles.alertRowLabel, { color: colors.textSecondary }]} maxFontSizeMultiplier={2}>
                  Price drop alerts
                </Text>
              </View>
              <View style={[styles.toggleTrack, { borderColor: priceAlertEnabled ? colors.brand : colors.border, backgroundColor: priceAlertEnabled ? colors.brandSubtle : colors.surfaceAlt }]}>
                <View style={[styles.toggleThumb, { backgroundColor: priceAlertEnabled ? colors.brand : colors.textMuted, alignSelf: priceAlertEnabled ? 'flex-end' : 'flex-start' }]} />
              </View>
            </AnimatedPressable>
          ) : null}
        </CommerceDetailSection>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  // ── Price insight alert row ──
  alertRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Space.sm,
    minHeight: Control.hit,
  },
  alertRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    flex: 1,
  },
  alertRowLabel: {
    fontSize: TypographyV2.body.size,
    fontFamily: FontFamily.regular,
  },
  toggleTrack: {
    width: Control.chrome,
    height: Space.md + Space.xs,
    borderRadius: RadiusRoleValue.pillAvatar,
    borderWidth: Stroke.standard,
    justifyContent: 'center',
    paddingHorizontal: Space.xs / 2,
  },
  toggleThumb: {
    width: Space.md - 2,
    height: Space.md - 2,
    borderRadius: RadiusRoleValue.pillAvatar,
  },
});
