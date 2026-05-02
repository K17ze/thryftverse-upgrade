import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ViewStyle,
} from 'react-native';
import { Colors } from '../constants/colors';

interface Owner {
  id: string;
  name: string;
  handle?: string;
  percentage: number;
  value: number;
  isYou?: boolean;
}

interface OwnershipBreakdownProps {
  totalValue: number;
  yourShares: number;
  yourPercentage: number;
  yourValue: number;
  appreciation: {
    amount: number;
    percentage: number;
    isPositive: boolean;
  };
  owners: Owner[];
  currency?: string;
  style?: ViewStyle;
}

export function OwnershipBreakdown({
  totalValue,
  yourShares,
  yourPercentage,
  yourValue,
  appreciation,
  owners,
  currency = '$',
  style,
}: OwnershipBreakdownProps) {
  // Calculate segments for the bar
  const availablePercentage = 100 - owners.reduce((sum, o) => sum + o.percentage, 0);

  return (
    <View style={[styles.container, style]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Ownership Breakdown</Text>
      </View>

      {/* Value Display */}
      <View style={styles.valueContainer}>
        <Text style={styles.valueLabel}>Total Value</Text>
        <View style={styles.valueRow}>
          <Text style={styles.totalValue}>
            {currency}{totalValue.toLocaleString()}
          </Text>
          <View
            style={[
              styles.appreciationBadge,
              {
                backgroundColor: appreciation.isPositive
                  ? `${Colors.success}15`
                  : `${Colors.danger}15`,
              },
            ]}
          >
            <Text
              style={[
                styles.appreciationText,
                {
                  color: appreciation.isPositive
                    ? Colors.success
                    : Colors.danger,
                },
              ]}
            >
              {appreciation.isPositive ? '+' : ''}
              {appreciation.percentage}% YTD
            </Text>
          </View>
        </View>
        <Text style={styles.yourShareText}>
          Your {yourShares} shares ({yourPercentage}%) = {currency}
          {yourValue.toLocaleString()}
        </Text>
      </View>

      {/* Ownership Bar */}
      <View style={styles.barContainer}>
        <View style={styles.ownershipBar}>
          {/* Your segment */}
          <View
            style={[
              styles.segment,
              { width: `${yourPercentage}%`, backgroundColor: Colors.brand },
            ]}
          />
          {/* Other owners */}
          {owners
            .filter((o) => !o.isYou)
            .map((owner, index) => (
              <View
                key={owner.id}
                style={[
                  styles.segment,
                  {
                    width: `${owner.percentage}%`,
                    backgroundColor: getOwnerColor(index),
                  },
                ]}
              />
            ))}
          {/* Available */}
          {availablePercentage > 0 && (
            <View
              style={[
                styles.segment,
                {
                  width: `${availablePercentage}%`,
                  backgroundColor: Colors.border,
                },
              ]}
            />
          )}
        </View>

        {/* Legend */}
        <View style={styles.legend}>
          <View style={styles.legendItem}>
            <View
              style={[styles.legendDot, { backgroundColor: Colors.brand }]}
            />
            <Text style={styles.legendText}>You ({yourPercentage}%)</Text>
          </View>
          {owners
            .filter((o) => !o.isYou)
            .slice(0, 2)
            .map((owner, index) => (
              <View key={owner.id} style={styles.legendItem}>
                <View
                  style={[
                    styles.legendDot,
                    { backgroundColor: getOwnerColor(index) },
                  ]}
                />
                <Text style={styles.legendText}>
                  {owner.handle || owner.name} ({owner.percentage}%)
                </Text>
              </View>
            ))}
          {availablePercentage > 0 && (
            <View style={styles.legendItem}>
              <View
                style={[styles.legendDot, { backgroundColor: Colors.border }]}
              />
              <Text style={styles.legendText}>
                Available ({availablePercentage.toFixed(0)}%)
              </Text>
            </View>
          )}
        </View>
      </View>

      {/* Owners List */}
      <View style={styles.ownersList}>
        <Text style={styles.ownersTitle}>Current Owners</Text>
        {owners.map((owner) => (
          <View key={owner.id} style={styles.ownerRow}>
            <View style={styles.ownerInfo}>
              <View
                style={[
                  styles.ownerAvatar,
                  owner.isYou && styles.yourAvatar,
                ]}
              >
                <Text style={styles.ownerAvatarText}>
                  {owner.isYou ? '👤' : owner.name.charAt(0)}
                </Text>
              </View>
              <View>
                <Text
                  style={[styles.ownerName, owner.isYou && styles.yourName]}
                >
                  {owner.isYou ? 'You' : owner.handle || owner.name}
                </Text>
                {owner.isYou && (
                  <Text style={styles.ownerSubtitle}>Your shares</Text>
                )}
              </View>
            </View>
            <View style={styles.ownerValues}>
              <Text style={styles.ownerPercentage}>{owner.percentage}%</Text>
              <Text style={styles.ownerValue}>
                {currency}
                {owner.value.toLocaleString()}
              </Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

// Helper to generate distinct colors for other owners
const OWNER_COLORS = ['#64B5F6', '#FFB74D', '#81C784', '#E57373', '#BA68C8'];
const getOwnerColor = (index: number) =>
  OWNER_COLORS[index % OWNER_COLORS.length];

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.surface,
    padding: 16,
    borderRadius: 16,
    marginHorizontal: 16,
  },
  header: {
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  valueContainer: {
    marginBottom: 20,
  },
  valueLabel: {
    fontSize: 13,
    color: Colors.textMuted,
    marginBottom: 4,
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 4,
  },
  totalValue: {
    fontSize: 28,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  appreciationBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  appreciationText: {
    fontSize: 13,
    fontWeight: '600',
  },
  yourShareText: {
    fontSize: 14,
    color: Colors.textMuted,
  },
  barContainer: {
    marginBottom: 20,
  },
  ownershipBar: {
    height: 12,
    flexDirection: 'row',
    borderRadius: 6,
    overflow: 'hidden',
    marginBottom: 12,
  },
  segment: {
    height: '100%',
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendText: {
    fontSize: 13,
    color: Colors.textMuted,
  },
  ownersList: {
    backgroundColor: Colors.background,
    borderRadius: 12,
    padding: 16,
  },
  ownersTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textMuted,
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  ownerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  ownerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  ownerAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  yourAvatar: {
    backgroundColor: `${Colors.brand}20`,
  },
  ownerAvatarText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textMuted,
  },
  ownerName: {
    fontSize: 15,
    color: Colors.textPrimary,
    fontWeight: '500',
  },
  yourName: {
    fontWeight: '600',
    color: Colors.brand,
  },
  ownerSubtitle: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 2,
  },
  ownerValues: {
    alignItems: 'flex-end',
  },
  ownerPercentage: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  ownerValue: {
    fontSize: 13,
    color: Colors.textMuted,
    marginTop: 2,
  },
});
