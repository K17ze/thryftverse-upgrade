import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import { Space, Radius } from '../../theme/designTokens';
import { AnimatedPressable } from '../AnimatedPressable';
import { AppStatusPill } from '../ui/AppStatusPill';
import { Meta, BodyEmphasis, Body } from '../ui/Text';

export type OrderSide = 'buy' | 'sell';
export type OrderStatus = 'filled' | 'pending' | 'partial' | 'cancelled';

interface OrderHistoryRowProps {
  id: string;
  side: OrderSide;
  type: 'market' | 'limit';
  assetTitle: string;
  quantity: number;
  pricePerShare: string;
  totalAmount: string;
  fee?: string;
  status: OrderStatus;
  timestamp: string;
  onPress?: () => void;
}

function resolveSideIcon(side: OrderSide): keyof typeof Ionicons.glyphMap {
  return side === 'buy' ? 'wallet-outline' : 'cash-outline';
}

function resolveSideColor(side: OrderSide): string {
  return side === 'buy' ? Colors.brand : Colors.textSecondary;
}

function resolveStatusTone(status: OrderStatus) {
  switch (status) {
    case 'filled':
      return 'positive' as const;
    case 'pending':
      return 'warning' as const;
    case 'partial':
      return 'accent' as const;
    case 'cancelled':
      return 'negative' as const;
    default:
      return 'neutral' as const;
  }
}

export function OrderHistoryRow({
  side,
  type,
  assetTitle,
  quantity,
  pricePerShare,
  totalAmount,
  status,
  timestamp,
  onPress,
}: OrderHistoryRowProps) {
  return (
    <AnimatedPressable
      style={styles.container}
      onPress={onPress}
      activeOpacity={0.92}
      disableAnimation={false}
      scaleValue={0.985}
      accessibilityRole="button"
      accessibilityLabel={`${side} ${quantity} units of ${assetTitle}`}
    >
      <View
        style={[
          styles.iconWrap,
          { borderColor: resolveSideColor(side) + '40', backgroundColor: resolveSideColor(side) + '12' },
        ]}
      >
        <Ionicons
          name={resolveSideIcon(side)}
          size={16}
          color={resolveSideColor(side)}
        />
      </View>

      <View style={styles.body}>
        <View style={styles.topRow}>
          <BodyEmphasis style={styles.title} numberOfLines={1}>
            {assetTitle}
          </BodyEmphasis>
          <AppStatusPill tone={resolveStatusTone(status)} label={status} size="sm" />
        </View>

        <View style={styles.metaRow}>
          <Meta>
            {side.toUpperCase()}  {type}  {quantity} units
          </Meta>
          <Meta style={styles.timestamp}>{timestamp}</Meta>
        </View>

        <View style={styles.priceRow}>
          <Body style={styles.price}>{pricePerShare} / share</Body>
          <BodyEmphasis style={styles.total}>{totalAmount}</BodyEmphasis>
        </View>
      </View>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm + 4,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: Radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Space.sm,
    marginTop: 2,
  },
  body: {
    flex: 1,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  title: {
    flex: 1,
    marginRight: Space.sm,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  timestamp: {
    textTransform: 'lowercase',
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  price: {
    color: Colors.textSecondary,
  },
  total: {
    fontVariant: ['tabular-nums'],
  },
});
