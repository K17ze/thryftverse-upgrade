import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BottomSheet } from '../BottomSheet';
import { CommerceDetailMetricRow } from '../commerce/detail';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space, Control, FontFamily } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { useFormattedPrice } from '../../hooks/useFormattedPrice';
import type { ListingCommerceContext } from '../../platform/product/listingDetailContract';
import type { SupportedCurrencyCode } from '../../constants/currencies';
import type { CurrencyDisplayMode } from '../../utils/currency';

interface FormatOptions {
  displayMode?: CurrencyDisplayMode;
  fiatFractionDigits?: number;
  izeFractionDigits?: number;
  minimumFractionDigits?: number;
}

type FormatFromFiat = (
  fiatAmount: number,
  sourceCurrency?: SupportedCurrencyCode,
  options?: FormatOptions,
) => string;

export interface PurchaseDetailsSheetProps {
  visible: boolean;
  onDismiss: () => void;
  hasPrice: boolean;
  formattedPrice: string;
  commerce: ListingCommerceContext;
  formattedProtectionTotal: string | null;
  formatFromFiat: FormatFromFiat;
}

/**
 * Costs, delivery & protection bottom sheet — full commerce breakdown
 * for the current listing. Extracted from ItemDetailScreen to keep the
 * screen's render tree focused on composition.
 */
export function PurchaseDetailsSheet({
  visible,
  onDismiss,
  hasPrice,
  formattedPrice,
  commerce,
  formattedProtectionTotal,
  formatFromFiat,
}: PurchaseDetailsSheetProps) {
  const { colors } = useAppTheme();
  

  return (
    <BottomSheet visible={visible} onDismiss={onDismiss} snapPoint={0.72}>
      <View style={[styles.purchaseSheetHeader, { borderBottomColor: colors.borderSubtle }]}>
        <View>
          <Text style={[styles.purchaseSheetTitle, { color: colors.textPrimary }]} maxFontSizeMultiplier={2}>
            Costs, delivery & protection
          </Text>
          <Text style={[styles.purchaseSheetSubtitle, { color: colors.textMuted }]} maxFontSizeMultiplier={1}>
            Confirmed terms for this listing
          </Text>
        </View>
        <Pressable
          onPress={onDismiss}
          style={styles.sheetCloseTarget}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityLabel="Close costs, delivery and protection"
          accessibilityRole="button"
        >
          <Ionicons name="close" size={22} color={colors.textSecondary} />
        </Pressable>
      </View>
      <View style={styles.purchaseSheetBody}>
        {hasPrice ? (
          <CommerceDetailMetricRow label="Item price" value={formattedPrice} />
        ) : null}
        {commerce.buyerProtectionFee != null ? (
          <CommerceDetailMetricRow
            label="Buyer protection fee"
            value={formatFromFiat(commerce.buyerProtectionFee, 'GBP', { displayMode: 'fiat' })}
          />
        ) : null}
        <CommerceDetailMetricRow
          label="Shipping"
          value={
            commerce.shippingPayer === 'seller'
              ? 'Free'
              : 'Calculated at checkout'
          }
          muted={commerce.shippingPayer !== 'seller'}
        />
        {formattedProtectionTotal ? (
          <CommerceDetailMetricRow
            label="Estimated total"
            value={formattedProtectionTotal}
            subLabel={commerce.shippingPayer === 'seller' ? undefined : 'excl. shipping'}
            emphasis
            separated
          />
        ) : null}
        <CommerceDetailMetricRow
          label="Delivery method"
          value={commerce.shippingMethod ?? 'Confirmed at checkout'}
          muted={!commerce.shippingMethod}
        />
        <CommerceDetailMetricRow
          label="Buyer protection"
          value={commerce.protectionPolicy?.available ? commerce.protectionPolicy.label : 'Not included'}
          subLabel={commerce.protectionPolicy?.summary ?? undefined}
        />
        <CommerceDetailMetricRow
          label="Returns"
          value={
            commerce.returnPolicy?.accepted
              ? commerce.returnPolicy.windowDays
                ? `${commerce.returnPolicy.windowDays} days`
                : 'Accepted'
              : 'Not accepted'
          }
        />
        {commerce.authenticity && commerce.authenticity.status !== 'not_offered' && (
          <CommerceDetailMetricRow
            label="Authenticity"
            value={commerce.authenticity.label ?? 'Eligible'}
          />
        )}
        <CommerceDetailMetricRow label="Payment" value="Thryftverse checkout" muted />
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  purchaseSheetHeader: {
    minHeight: Space.md * 4,
    paddingLeft: Space.md,
    paddingRight: Space.xs,
    paddingVertical: Space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Space.sm,
  },
  purchaseSheetTitle: {
    fontSize: TypographyV2.sectionTitle.size,
    lineHeight: TypographyV2.sectionTitle.lineHeight,
    fontFamily: FontFamily.semibold,
  },
  purchaseSheetSubtitle: {
    marginTop: Space.xs / 2,
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: FontFamily.regular,
  },
  purchaseSheetBody: {
    paddingHorizontal: Space.md,
    paddingTop: Space.sm,
  },
  sheetCloseTarget: {
    width: Control.hit,
    height: Control.hit,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
