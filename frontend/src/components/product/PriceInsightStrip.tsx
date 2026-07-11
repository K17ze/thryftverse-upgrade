import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import { Typography, Space, Radius } from '../../theme/designTokens';

export interface PriceInsightStripProps {
  /** Current listing price in fiat */
  price: number;
  /** Original price if the item was discounted */
  originalPrice?: number | null;
  /** ISO date string when the listing was created */
  listedAt?: string | null;
  /** Number of likes (interest signal) */
  likes?: number;
  /** Whether price drop alerts are enabled for this item */
  alertEnabled?: boolean;
  /** Toggle price drop alerts */
  onToggleAlert?: () => void;
  /** Sold comparables: price range of similar sold items */
  soldComps?: {
    minPrice: number;
    maxPrice: number;
    medianPrice: number;
    sampleSize: number;
  } | null;
  /** Price history entries (chronological, oldest first) */
  priceHistory?: { price: number; date: string }[] | null;
}

interface InsightRow {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  tone: 'neutral' | 'positive' | 'demand';
}

/**
 * Price insight strip — shows truthful market context derived from listing data.
 *
 * Renders only when there is meaningful insight to show:
 * - Price drop (originalPrice > price)
 * - Time on market (listedAt > 3 days ago)
 * - Demand signal (likes >= 10)
 *
 * No fabricated data. All signals derive from authoritative listing fields.
 *
 * Visual language matches ProductCommerceSummary — surface card, semibold
 * section title, Ionicons row icons, hairline dividers.
 */
export function PriceInsightStrip({
  price,
  originalPrice,
  listedAt,
  likes,
  alertEnabled = false,
  onToggleAlert,
  soldComps,
  priceHistory,
}: PriceInsightStripProps) {
  const hasDiscount = originalPrice != null && originalPrice > price;
  const discountPercent = hasDiscount && originalPrice
    ? Math.round(((originalPrice - price) / originalPrice) * 100)
    : null;

  const daysListed = listedAt
    ? Math.max(0, Math.floor((Date.now() - new Date(listedAt).getTime()) / (1000 * 60 * 60 * 24)))
    : null;

  const showPriceDrop = hasDiscount && discountPercent! > 0;
  const showDaysListed = daysListed != null && daysListed >= 3;
  const showDemand = likes != null && likes >= 10;

  if (!showPriceDrop && !showDaysListed && !showDemand && !soldComps && !priceHistory) return null;

  const rows: InsightRow[] = [];

  if (showPriceDrop) {
    rows.push({
      icon: 'trending-down',
      label: 'Price drop',
      value: `-${discountPercent}%`,
      tone: 'positive',
    });
  }

  // Sold comparables — truthful market context from similar sold items
  if (soldComps && soldComps.sampleSize > 0) {
    rows.push({
      icon: 'pricetag-outline',
      label: 'Similar sold',
      value: `£${soldComps.minPrice.toFixed(0)}–£${soldComps.maxPrice.toFixed(0)}`,
      tone: 'neutral',
    });
  }

  // Price history — show if price has changed over time
  if (priceHistory && priceHistory.length > 1) {
    const firstPrice = priceHistory[0].price;
    const lastPrice = priceHistory[priceHistory.length - 1].price;
    const historyChange = firstPrice > 0 ? Math.round(((lastPrice - firstPrice) / firstPrice) * 100) : 0;
    if (historyChange !== 0) {
      rows.push({
        icon: 'bar-chart-outline',
        label: 'Price history',
        value: `${historyChange > 0 ? '+' : ''}${historyChange}% (${priceHistory.length} changes)`,
        tone: historyChange < 0 ? 'positive' : 'neutral',
      });
    }
  }

  // Price drop alert toggle — only when there's a price drop and a toggle handler
  const showAlertToggle = showPriceDrop && onToggleAlert;

  if (showDaysListed) {
    const dayLabel = daysListed! === 1 ? '1 day listed' : `${daysListed} days listed`;
    rows.push({
      icon: 'time-outline',
      label: 'Time on market',
      value: dayLabel,
      tone: 'neutral',
    });
  }

  if (showDemand) {
    rows.push({
      icon: 'heart',
      label: 'Demand',
      value: `${likes} likes`,
      tone: 'demand',
    });
  }

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Ionicons name="analytics-outline" size={16} color={Colors.textSecondary} />
        <Text style={styles.sectionTitle}>Price insights</Text>
      </View>

      {rows.map((row, index) => {
        const valueColor =
          row.tone === 'positive' ? Colors.brand
          : row.tone === 'demand' ? Colors.danger
          : Colors.textPrimary;
        return (
          <View
            key={row.label}
            style={[styles.row, index < rows.length - 1 && styles.rowBorder]}
          >
            <View style={styles.rowLeft}>
              <Ionicons name={row.icon} size={18} color={Colors.textSecondary} />
              <Text style={styles.rowLabel}>{row.label}</Text>
            </View>
            <Text style={[styles.rowValue, { color: valueColor }]} numberOfLines={1}>
              {row.value}
            </Text>
          </View>
        );
      })}

      {/* Price drop alert toggle */}
      {showAlertToggle ? (
        <Pressable
          style={[styles.row, styles.rowBorder, styles.alertRow]}
          onPress={onToggleAlert}
          accessibilityRole="switch"
          accessibilityState={{ checked: alertEnabled }}
          accessibilityLabel={alertEnabled ? 'Disable price drop alert' : 'Enable price drop alert'}
        >
          <View style={styles.rowLeft}>
            <Ionicons
              name={alertEnabled ? 'notifications' : 'notifications-outline'}
              size={18}
              color={alertEnabled ? Colors.brand : Colors.textSecondary}
            />
            <Text style={styles.rowLabel}>Price drop alerts</Text>
          </View>
          <View style={[styles.toggleTrack, alertEnabled && styles.toggleTrackActive]}>
            <View style={[styles.toggleThumb, alertEnabled && styles.toggleThumbActive]} />
          </View>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: Space.sm,
    marginHorizontal: Space.md,
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    paddingVertical: Space.sm,
    paddingHorizontal: Space.md,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: Space.sm,
  },
  sectionTitle: {
    fontSize: 13,
    fontFamily: Typography.family.semibold,
    color: Colors.textSecondary,
    letterSpacing: 0.2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    minHeight: 44,
  },
  rowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    flex: 1,
  },
  rowLabel: {
    fontSize: 14,
    fontFamily: Typography.family.regular,
    color: Colors.textSecondary,
  },
  rowValue: {
    fontSize: 14,
    fontFamily: Typography.family.semibold,
    textAlign: 'right',
  },
  alertRow: {
    paddingRight: Space.xs,
  },
  toggleTrack: {
    width: 36,
    height: 20,
    borderRadius: 10,
    backgroundColor: Colors.surfaceAlt,
    borderWidth: 1,
    borderColor: Colors.border,
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  toggleTrackActive: {
    backgroundColor: `${Colors.brand}20`,
    borderColor: Colors.brand,
  },
  toggleThumb: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: Colors.textMuted,
    alignSelf: 'flex-start',
  },
  toggleThumbActive: {
    backgroundColor: Colors.brand,
    alignSelf: 'flex-end',
  },
});
