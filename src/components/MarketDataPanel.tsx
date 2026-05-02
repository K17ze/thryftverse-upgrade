import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/colors';

interface PricePoint {
  date: string;
  price: number;
}

interface MarketDataPanelProps {
  weekRange: {
    low: number;
    high: number;
  };
  lastSale: {
    price: number;
    date: string;
  };
  priceHistory: PricePoint[];
  currency?: string;
  onViewFullHistory?: () => void;
  style?: ViewStyle;
}

export function MarketDataPanel({
  weekRange,
  lastSale,
  priceHistory,
  currency = '$',
  onViewFullHistory,
  style,
}: MarketDataPanelProps) {
  // Simple visualization of price trend
  const minPrice = Math.min(...priceHistory.map((p) => p.price), weekRange.low);
  const maxPrice = Math.max(...priceHistory.map((p) => p.price), weekRange.high);
  const range = maxPrice - minPrice || 1;

  const currentPrice = priceHistory[priceHistory.length - 1]?.price || lastSale.price;
  const firstPrice = priceHistory[0]?.price || currentPrice;
  const priceChange = currentPrice - firstPrice;
  const priceChangePercent = ((priceChange / firstPrice) * 100).toFixed(1);
  const isPositive = priceChange >= 0;

  return (
    <View style={[styles.container, style]}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Ionicons name="analytics-outline" size={20} color={Colors.textPrimary} />
          <Text style={styles.title}>Market Data</Text>
        </View>
        <TouchableOpacity onPress={onViewFullHistory}>
          <Text style={styles.viewAllText}>View History</Text>
        </TouchableOpacity>
      </View>

      {/* 52 Week Range */}
      <View style={styles.rangeContainer}>
        <Text style={styles.rangeLabel}>52-Week Range</Text>
        <View style={styles.rangeBar}>
          <View style={styles.rangeTrack}>
            <View
              style={[
                styles.rangeFill,
                {
                  left: `${((weekRange.low - minPrice) / range) * 100}%`,
                  width: `${((weekRange.high - weekRange.low) / range) * 100}%`,
                },
              ]}
            />
            <View
              style={[
                styles.currentPriceIndicator,
                {
                  left: `${Math.min(
                    ((currentPrice - minPrice) / range) * 100,
                    100
                  )}%`,
                },
              ]}
            />
          </View>
          <View style={styles.rangeLabels}>
            <Text style={styles.rangeValue}>
              {currency}{weekRange.low.toLocaleString()}
            </Text>
            <Text style={styles.rangeValue}>
              {currency}{weekRange.high.toLocaleString()}
            </Text>
          </View>
        </View>
      </View>

      {/* Last Sale */}
      <View style={styles.lastSaleContainer}>
        <View style={styles.lastSaleLeft}>
          <Text style={styles.lastSaleLabel}>Last Sale</Text>
          <Text style={styles.lastSaleDate}>{lastSale.date}</Text>
        </View>
        <Text style={styles.lastSalePrice}>
          {currency}{lastSale.price.toLocaleString()}
        </Text>
      </View>

      {/* Price History Graph */}
      <View style={styles.graphContainer}>
        <View style={styles.graphHeader}>
          <Text style={styles.graphLabel}>Price History</Text>
          <View style={styles.changeContainer}>
            <Ionicons
              name={isPositive ? 'trending-up' : 'trending-down'}
              size={16}
              color={isPositive ? Colors.success : Colors.danger}
            />
            <Text
              style={[
                styles.changeText,
                { color: isPositive ? Colors.success : Colors.danger },
              ]}
            >
              {isPositive ? '+' : ''}
              {priceChangePercent}%
            </Text>
          </View>
        </View>

        {/* Simple Bar Chart */}
        <View style={styles.chartContainer}>
          {priceHistory.slice(-12).map((point, index) => {
            const heightPercent = ((point.price - minPrice) / range) * 100;
            const isLast = index === priceHistory.slice(-12).length - 1;

            return (
              <View key={index} style={styles.barContainer}>
                <View
                  style={[
                    styles.bar,
                    {
                      height: `${Math.max(heightPercent, 10)}%`,
                      backgroundColor: isLast
                        ? Colors.brand
                        : `${Colors.brand}50`,
                    },
                  ]}
                />
              </View>
            );
          })}
        </View>

        {/* Time Labels */}
        <View style={styles.timeLabels}>
          <Text style={styles.timeLabel}>
            {priceHistory[0]?.date || 'Start'}
          </Text>
          <Text style={styles.timeLabel}>Today</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.surface,
    padding: 16,
    borderRadius: 16,
    marginHorizontal: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  viewAllText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.brand,
  },
  rangeContainer: {
    marginBottom: 20,
  },
  rangeLabel: {
    fontSize: 13,
    color: Colors.textMuted,
    marginBottom: 10,
  },
  rangeBar: {
    backgroundColor: Colors.background,
    padding: 16,
    borderRadius: 12,
  },
  rangeTrack: {
    height: 8,
    backgroundColor: Colors.border,
    borderRadius: 4,
    position: 'relative',
    marginBottom: 8,
  },
  rangeFill: {
    position: 'absolute',
    height: '100%',
    backgroundColor: `${Colors.brand}40`,
    borderRadius: 4,
  },
  currentPriceIndicator: {
    position: 'absolute',
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: Colors.brand,
    top: -2,
    marginLeft: -6,
    borderWidth: 2,
    borderColor: Colors.surface,
  },
  rangeLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  rangeValue: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  lastSaleContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.background,
    padding: 16,
    borderRadius: 12,
    marginBottom: 20,
  },
  lastSaleLeft: {},
  lastSaleLabel: {
    fontSize: 13,
    color: Colors.textMuted,
    marginBottom: 2,
  },
  lastSaleDate: {
    fontSize: 14,
    color: Colors.textPrimary,
  },
  lastSalePrice: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  graphContainer: {
    backgroundColor: Colors.background,
    padding: 16,
    borderRadius: 12,
  },
  graphHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  graphLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  changeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  changeText: {
    fontSize: 14,
    fontWeight: '600',
  },
  chartContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    height: 100,
    gap: 4,
  },
  barContainer: {
    flex: 1,
    height: '100%',
    justifyContent: 'flex-end',
  },
  bar: {
    width: '100%',
    borderRadius: 4,
    minHeight: 4,
  },
  timeLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  timeLabel: {
    fontSize: 12,
    color: Colors.textMuted,
  },
});
