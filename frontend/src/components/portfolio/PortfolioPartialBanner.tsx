import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/ThemeContext';
import { Control, Space } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { portfolioScreenStyles as styles } from './portfolioScreenStyles';

export interface PortfolioPartialBannerProps {
  /** Re-runs the portfolio fetch — wired to the screen's refresh handler so
   *  recovery is discoverable without knowing the pull-to-refresh gesture. */
  onRetry?: () => void;
  /** True while a refresh is already in flight; the action stays visible but
   *  inert (busy) until the fetch settles. */
  refreshing?: boolean;
  /** Positions carrying a stale mark, derived from per-position mark
   *  provenance. Those rows already show a "Stale mark" badge — this line
   *  tells the reader what to look for instead of only a global warning. */
  staleCount?: number;
}

/**
 * Inline warning when some asset fetches failed — sits above the
 * positions list as an advisory; does not replace the list.
 *
 * The banner is also the qualifier for the summary totals rendered directly
 * below it: while this is visible, the total must never read as complete.
 * No line clamps — the warning must reflow at large text sizes.
 */
export function PortfolioPartialBanner({
  onRetry,
  refreshing = false,
  staleCount = 0,
}: PortfolioPartialBannerProps) {
  const { colors } = useAppTheme();
  return (
    <View style={[styles.partialBanner, { backgroundColor: colors.warningSubtle, borderColor: colors.warningBorder }]}>
      <Ionicons name="alert-circle-outline" size={16} color={colors.warningText} />
      <View style={localStyles.body}>
        <Text style={[styles.partialBannerText, { color: colors.textSecondary }]}>
          Some positions are unavailable. Totals may be incomplete.
        </Text>
        {staleCount > 0 ? (
          <Text style={[styles.partialBannerText, { color: colors.textSecondary }]}>
            {staleCount} {staleCount === 1 ? 'position shows' : 'positions show'} a stale mark — flagged on the row below.
          </Text>
        ) : null}
        {onRetry ? (
          <Pressable
            onPress={onRetry}
            disabled={refreshing}
            style={({ pressed }) => [localStyles.retry, pressed && !refreshing && localStyles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="Retry loading portfolio"
            accessibilityState={{ busy: refreshing, disabled: refreshing }}
          >
            {refreshing ? (
              <ActivityIndicator size="small" color={colors.textSecondary} />
            ) : (
              <Text style={[localStyles.retryText, { color: colors.warningText }]}>Try again</Text>
            )}
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const localStyles = StyleSheet.create({
  body: {
    flex: 1,
    minWidth: 0,
    gap: Space.xs,
  },
  // Quiet text action — transparent 44pt target, no button chrome (§4:
  // separate hit area from visible shape).
  retry: {
    minHeight: Control.hit,
    alignSelf: 'flex-start',
    justifyContent: 'center',
    paddingHorizontal: Space.xs,
    marginHorizontal: -Space.xs,
  },
  retryText: {
    fontSize: TypographyV2.bodyStrong.size,
    lineHeight: TypographyV2.bodyStrong.lineHeight,
    fontFamily: TypographyV2.bodyStrong.fontFamily,
    letterSpacing: TypographyV2.bodyStrong.letterSpacing,
  },
  pressed: {
    opacity: 0.68,
  },
});
