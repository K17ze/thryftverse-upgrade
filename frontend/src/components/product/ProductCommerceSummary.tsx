import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import { Typography, Space, Radius } from '../../theme/designTokens';
import type { ListingCommerceContext } from '../../platform/product';
import { NativeSheet } from '../../platform/native';
import { ProductPolicySheet } from './ProductPolicySheet';

export interface ProductCommerceSummaryProps {
  commerce: ListingCommerceContext;
  formattedPrice: string;
  formattedProtectionTotal?: string | null;
}

interface CommerceRow {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  sheetContent?: { title: string; body: string };
}

export function ProductCommerceSummary({
  commerce,
  formattedPrice,
  formattedProtectionTotal,
}: ProductCommerceSummaryProps) {
  const [activeSheet, setActiveSheet] = useState<{ title: string; body: string } | null>(null);

  const rows: CommerceRow[] = [];

  if (commerce.estimatedTotal != null && formattedProtectionTotal) {
    rows.push({
      icon: 'cash-outline',
      label: 'Estimated total',
      value: formattedProtectionTotal,
      sheetContent: {
        title: 'Estimated total',
        body: `Item price: ${formattedPrice}\nBuyer protection fee: ${commerce.buyerProtectionFee != null ? `£${commerce.buyerProtectionFee.toFixed(2)}` : 'Included'}\n\nThe estimated total includes the item price and buyer protection fee. Shipping costs are confirmed at checkout.`,
      },
    });
  }

  if (commerce.shippingMethod) {
    rows.push({
      icon: 'cube-outline',
      label: 'Shipping',
      value: commerce.shippingMethod,
      sheetContent: {
        title: 'Shipping',
        body: `Shipping method: ${commerce.shippingMethod}\nShipping payer: ${commerce.shippingPayer === 'seller' ? 'Seller covers shipping' : 'Buyer pays shipping'}\n\nFinal shipping cost is confirmed at checkout based on your delivery address.`,
      },
    });
  }

  if (commerce.estimatedDeliveryStart && commerce.estimatedDeliveryEnd) {
    rows.push({
      icon: 'time-outline',
      label: 'Delivery estimate',
      value: `${commerce.estimatedDeliveryStart} – ${commerce.estimatedDeliveryEnd}`,
      sheetContent: {
        title: 'Delivery estimate',
        body: `Estimated delivery: ${commerce.estimatedDeliveryStart} to ${commerce.estimatedDeliveryEnd}\n\nThis is an estimate based on the seller's dispatch time and standard shipping. Actual delivery may vary.`,
      },
    });
  }

  if (commerce.protectionPolicy?.available) {
    rows.push({
      icon: 'shield-checkmark-outline',
      label: 'Buyer protection',
      value: commerce.protectionPolicy.label,
      sheetContent: {
        title: commerce.protectionPolicy.label,
        body: commerce.protectionPolicy.summary,
      },
    });
  }

  if (commerce.returnPolicy) {
    rows.push({
      icon: 'return-up-back-outline',
      label: 'Returns',
      value: commerce.returnPolicy.accepted
        ? commerce.returnPolicy.windowDays
          ? `Accepted within ${commerce.returnPolicy.windowDays} days`
          : 'Accepted'
        : 'Not accepted',
      sheetContent: {
        title: 'Return policy',
        body: commerce.returnPolicy.accepted
          ? `This seller accepts returns${commerce.returnPolicy.windowDays ? ` within ${commerce.returnPolicy.windowDays} days` : ''}.${commerce.returnPolicy.conditions ? `\n\n${commerce.returnPolicy.conditions}` : ''}`
          : 'This seller does not accept returns. Please check the item description carefully before purchasing.',
      },
    });
  }

  rows.push({
    icon: 'lock-closed-outline',
    label: 'Secure payment',
    value: 'Thryftverse checkout',
    sheetContent: {
      title: 'Secure payment',
      body: 'All payments are processed through Thryftverse secure checkout. Your payment details are encrypted and never shared with the seller.',
    },
  });

  if (commerce.authenticity && commerce.authenticity.status !== 'not_offered') {
    rows.push({
      icon: 'checkmark-circle-outline',
      label: 'Authenticity',
      value: commerce.authenticity.label ?? commerce.authenticity.status === 'verified' ? 'Verified' : 'Eligible',
      sheetContent: {
        title: 'Authenticity',
        body: commerce.authenticity.status === 'verified'
          ? 'This item has been verified for authenticity by Thryftverse.'
          : 'This item may be eligible for authenticity verification. Learn more at checkout.',
      },
    });
  }

  if (rows.length === 0) return null;

  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>Purchase confidence</Text>
      {rows.map((row, index) => (
        <Pressable
          key={row.label}
          style={[styles.row, index < rows.length - 1 && styles.rowBorder]}
          onPress={() => row.sheetContent && setActiveSheet(row.sheetContent)}
          disabled={!row.sheetContent}
          accessibilityRole={row.sheetContent ? 'button' : 'text'}
          accessibilityLabel={`${row.label}: ${row.value}${row.sheetContent ? '. Tap for details.' : ''}`}
        >
          <View style={styles.rowLeft}>
            <Ionicons name={row.icon} size={18} color={Colors.textSecondary} />
            <Text style={styles.rowLabel}>{row.label}</Text>
          </View>
          <View style={styles.rowRight}>
            <Text style={styles.rowValue} numberOfLines={1}>
              {row.value}
            </Text>
            {row.sheetContent && (
              <Ionicons name="chevron-forward" size={14} color={Colors.textMuted} />
            )}
          </View>
        </Pressable>
      ))}

      <NativeSheet
        visible={!!activeSheet}
        onDismiss={() => setActiveSheet(null)}
        showDragIndicator
      >
        {activeSheet && (
          <View style={styles.sheetContent}>
            <ProductPolicySheet title={activeSheet.title} body={activeSheet.body} />
          </View>
        )}
      </NativeSheet>
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
  sectionTitle: {
    fontSize: 13,
    fontFamily: Typography.family.semibold,
    color: Colors.textSecondary,
    marginBottom: Space.sm,
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
  rowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    flexShrink: 1,
  },
  rowValue: {
    fontSize: 14,
    fontFamily: Typography.family.semibold,
    color: Colors.textPrimary,
    textAlign: 'right',
  },
  sheetContent: {
    paddingHorizontal: Space.lg,
    paddingBottom: Space.lg,
  },
});
