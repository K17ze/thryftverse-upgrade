import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Space, Radius, Stroke, Typography } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { useCurrencyContext } from '../../context/CurrencyContext';
import { toIze, formatIzeAmount, type SupportedCurrencyCode } from '../../utils/currency';

interface AuctionBidLadderPreviewProps {
  startingBid: number;
  reservePrice?: number;
  buyNowPrice?: number;
  currencyCode: SupportedCurrencyCode | string;
}

export function AuctionBidLadderPreview({
  startingBid,
  reservePrice,
  buyNowPrice,
  currencyCode,
}: AuctionBidLadderPreviewProps) {
  const { colors, isDark } = useAppTheme();
  const { fxRates } = useCurrencyContext();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  // Calculate dynamic increment based on price band
  const increment = useMemo(() => {
    if (startingBid <= 0) return 5;
    if (startingBid < 50) return 2;
    if (startingBid < 200) return 5;
    if (startingBid < 500) return 10;
    if (startingBid < 2000) return 25;
    return 50;
  }, [startingBid]);

  const nextBid = startingBid > 0 ? startingBid + increment : 0;

  const startingIze = useMemo(() => {
    if (startingBid <= 0) return null;
    return formatIzeAmount(toIze(startingBid, currencyCode as SupportedCurrencyCode, fxRates));
  }, [startingBid, currencyCode, fxRates]);

  const reserveIze = useMemo(() => {
    if (!reservePrice || reservePrice <= 0) return null;
    return formatIzeAmount(toIze(reservePrice, currencyCode as SupportedCurrencyCode, fxRates));
  }, [reservePrice, currencyCode, fxRates]);

  const buyNowIze = useMemo(() => {
    if (!buyNowPrice || buyNowPrice <= 0) return null;
    return formatIzeAmount(toIze(buyNowPrice, currencyCode as SupportedCurrencyCode, fxRates));
  }, [buyNowPrice, currencyCode, fxRates]);

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <View style={styles.headerTitleWrap}>
          <Ionicons name="podium-outline" size={16} color={colors.brand} />
          <Text style={styles.headerTitle}>BID PROGRESSION LADDER</Text>
        </View>
        <Text style={styles.headerSubtitle}>Simulation</Text>
      </View>

      <View style={styles.ladderList}>
        {/* Level 1: Starting Floor */}
        <View style={styles.rungRow}>
          <View style={styles.rungIndicatorCol}>
            <View style={[styles.rungDot, styles.rungDotStart]}>
              <Ionicons name="play" size={10} color={colors.textInverse} />
            </View>
            <View style={styles.rungLine} />
          </View>
          <View style={styles.rungContent}>
            <View style={styles.rungLabelRow}>
              <Text style={styles.rungTitle}>Opening Hammer (Floor)</Text>
              <Text style={styles.rungBadge}>Step 1</Text>
            </View>
            <View style={styles.rungValuesRow}>
              <Text style={styles.rungPrimaryValue}>
                {startingBid > 0 ? `${currencyCode} ${startingBid.toFixed(2)}` : '—'}
              </Text>
              {startingIze ? <Text style={styles.rungSecondaryValue}>{startingIze}</Text> : null}
            </View>
          </View>
        </View>

        {/* Level 2: Minimum Next Bid */}
        <View style={styles.rungRow}>
          <View style={styles.rungIndicatorCol}>
            <View style={[styles.rungDot, styles.rungDotNext]}>
              <Ionicons name="arrow-up" size={11} color={colors.textSecondary} />
            </View>
            <View style={styles.rungLine} />
          </View>
          <View style={styles.rungContent}>
            <View style={styles.rungLabelRow}>
              <Text style={styles.rungTitle}>Min Next Valid Bid</Text>
              <Text style={styles.rungIncrementTag}>+{currencyCode} {increment}</Text>
            </View>
            <View style={styles.rungValuesRow}>
              <Text style={styles.rungPrimaryValue}>
                {nextBid > 0 ? `${currencyCode} ${nextBid.toFixed(2)}` : '—'}
              </Text>
              <Text style={styles.rungNote}>Standard ladder increment</Text>
            </View>
          </View>
        </View>

        {/* Level 3: Reserve Threshold */}
        <View style={styles.rungRow}>
          <View style={styles.rungIndicatorCol}>
            <View style={[styles.rungDot, reservePrice ? styles.rungDotReserveActive : styles.rungDotReserveMuted]}>
              <Ionicons
                name={reservePrice ? 'shield-checkmark' : 'shield-outline'}
                size={11}
                color={reservePrice ? colors.brand : colors.textMuted}
              />
            </View>
            {buyNowPrice ? <View style={styles.rungLine} /> : null}
          </View>
          <View style={styles.rungContent}>
            <View style={styles.rungLabelRow}>
              <Text style={styles.rungTitle}>Reserve Safeguard</Text>
              <Text style={[styles.rungBadge, reservePrice ? styles.rungBadgeConfidential : styles.rungBadgeNone]}>
                {reservePrice ? 'Confidential' : 'No Reserve'}
              </Text>
            </View>
            <View style={styles.rungValuesRow}>
              <Text style={[styles.rungPrimaryValue, !reservePrice && styles.rungValueMuted]}>
                {reservePrice ? `${currencyCode} ${reservePrice.toFixed(2)}` : 'Will sell at any bid'}
              </Text>
              {reserveIze ? <Text style={styles.rungSecondaryValue}>{reserveIze}</Text> : null}
            </View>
          </View>
        </View>

        {/* Level 4: Buy Now (Instant Buyout) */}
        {buyNowPrice && buyNowPrice > 0 ? (
          <View style={styles.rungRow}>
            <View style={styles.rungIndicatorCol}>
              <View style={[styles.rungDot, styles.rungDotBuyNow]}>
                <Ionicons name="flash" size={11} color="#f59e0b" />
              </View>
            </View>
            <View style={styles.rungContent}>
              <View style={styles.rungLabelRow}>
                <Text style={styles.rungTitle}>Instant Buyout Ceiling</Text>
                <Text style={styles.rungBadgeBuyNow}>Instant Escrow</Text>
              </View>
              <View style={styles.rungValuesRow}>
                <Text style={styles.rungPrimaryValueHighlight}>
                  {currencyCode} {buyNowPrice.toFixed(2)}
                </Text>
                {buyNowIze ? <Text style={styles.rungSecondaryValue}>{buyNowIze}</Text> : null}
              </View>
            </View>
          </View>
        ) : null}
      </View>
    </View>
  );
}

function createStyles(colors: ThemeColors, isDark: boolean) {
  return StyleSheet.create({
    container: {
      backgroundColor: colors.surfaceAlt,
      borderRadius: Radius.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      padding: Space.md,
      marginVertical: Space.sm,
    },
    headerRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: Space.md,
      paddingBottom: Space.xs,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    headerTitleWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
    },
    headerTitle: {
      fontSize: TypographyV2.meta.size - 1,
      fontFamily: Typography.family.bold,
      color: colors.textPrimary,
      letterSpacing: 0.8,
    },
    headerSubtitle: {
      fontSize: TypographyV2.meta.size - 1,
      fontFamily: Typography.family.medium,
      color: colors.textMuted,
    },
    ladderList: {
      gap: 0,
    },
    rungRow: {
      flexDirection: 'row',
      minHeight: 52,
    },
    rungIndicatorCol: {
      width: 24,
      alignItems: 'center',
      marginRight: Space.sm,
    },
    rungDot: {
      width: 20,
      height: 20,
      borderRadius: Radius.md,
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 2,
    },
    rungDotStart: {
      backgroundColor: colors.brand,
    },
    rungDotNext: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    rungDotReserveActive: {
      backgroundColor: isDark ? 'rgba(59, 130, 246, 0.2)' : 'rgba(37, 99, 235, 0.1)',
      borderWidth: 1,
      borderColor: colors.brand,
    },
    rungDotReserveMuted: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    rungDotBuyNow: {
      backgroundColor: isDark ? 'rgba(245, 158, 11, 0.2)' : 'rgba(245, 158, 11, 0.1)',
      borderWidth: 1,
      borderColor: '#f59e0b',
    },
    rungLine: {
      width: Stroke.emphasis,
      flex: 1,
      backgroundColor: colors.border,
      marginVertical: 2,
    },
    rungContent: {
      flex: 1,
      paddingBottom: Space.sm,
    },
    rungLabelRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 2,
    },
    rungTitle: {
      fontSize: TypographyV2.meta.size,
      fontFamily: Typography.family.semibold,
      color: colors.textPrimary,
    },
    rungBadge: {
      fontSize: 10,
      fontFamily: Typography.family.bold,
      paddingHorizontal: Space.xs + 2,
      paddingVertical: 1,
      borderRadius: Radius.sm,
      backgroundColor: colors.surface,
      color: colors.textMuted,
      overflow: 'hidden',
    },
    rungBadgeConfidential: {
      backgroundColor: isDark ? 'rgba(59, 130, 246, 0.2)' : 'rgba(37, 99, 235, 0.12)',
      color: colors.brand,
    },
    rungBadgeNone: {
      backgroundColor: colors.surface,
      color: colors.textMuted,
    },
    rungBadgeBuyNow: {
      fontSize: 10,
      fontFamily: Typography.family.bold,
      paddingHorizontal: Space.xs + 2,
      paddingVertical: 1,
      borderRadius: Radius.sm,
      backgroundColor: isDark ? 'rgba(245, 158, 11, 0.2)' : 'rgba(245, 158, 11, 0.12)',
      color: '#f59e0b',
      overflow: 'hidden',
    },
    rungIncrementTag: {
      fontSize: 10,
      fontFamily: Typography.family.bold,
      color: colors.textSecondary,
    },
    rungValuesRow: {
      flexDirection: 'row',
      alignItems: 'baseline',
      gap: Space.xs + 2,
    },
    rungPrimaryValue: {
      fontSize: TypographyV2.body.size,
      fontFamily: Typography.family.bold,
      color: colors.textPrimary,
      fontVariant: ['tabular-nums'],
    },
    rungPrimaryValueHighlight: {
      fontSize: TypographyV2.body.size,
      fontFamily: Typography.family.bold,
      color: '#f59e0b',
      fontVariant: ['tabular-nums'],
    },
    rungValueMuted: {
      color: colors.textMuted,
      fontFamily: Typography.family.medium,
      fontSize: TypographyV2.meta.size,
    },
    rungSecondaryValue: {
      fontSize: TypographyV2.meta.size - 1,
      fontFamily: TypographyV2.meta.fontFamily,
      color: colors.textMuted,
      fontVariant: ['tabular-nums'],
    },
    rungNote: {
      fontSize: TypographyV2.meta.size - 1,
      fontFamily: TypographyV2.meta.fontFamily,
      color: colors.textMuted,
    },
  });
}
