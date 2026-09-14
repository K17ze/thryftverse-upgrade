import React from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BottomSheet } from '../BottomSheet';
import { Space } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { useFormattedPrice } from '../../hooks/useFormattedPrice';
import { toEtaLabelFromRange } from '../../utils/checkoutFlow';
import type { ShippingQuoteItem } from '../../services/commerceApi';

interface Props {
  visible: boolean;
  onDismiss: () => void;
  /** Persisted server-issued quotes — each carries a quoteId that
   *  POST /orders accepts directly. */
  quotes: ShippingQuoteItem[];
  /** quoteId of the currently applied option (null = carrier fallback). */
  selectedQuoteId: string | null;
  onSelect: (quote: ShippingQuoteItem) => void | Promise<void>;
}

/**
 * Per-option delivery selector — the checkout's shipping picker.
 *
 * Every row is a real server quote (label, price, ETA range, tracking) —
 * no estimated catalog prices are shown here; the fallback carrier option
 * stays on the delivery row when quoting failed, and this sheet only opens
 * when multiple persisted quotes exist.
 */
export function CheckoutDeliverySelector({
  visible,
  onDismiss,
  quotes,
  selectedQuoteId,
  onSelect,
}: Props) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const { formatFromFiat } = useFormattedPrice();

  return (
    <BottomSheet visible={visible} onDismiss={onDismiss} snapPoint={0.55}>
      <Text style={styles.title}>Delivery speed</Text>
      <ScrollView
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      >
        {quotes.map((quote) => {
          const isSelected = quote.quoteId != null && quote.quoteId === selectedQuoteId;
          const eta = toEtaLabelFromRange(quote.etaMinDays, quote.etaMaxDays);
          const priceLabel = formatFromFiat(quote.priceFromGbp, 'GBP');
          const meta = [
            eta,
            quote.tracking ? 'Tracked' : null,
            quote.live ? 'Live quote' : 'Estimated',
          ]
            .filter(Boolean)
            .join(' · ');
          return (
            <Pressable
              key={quote.quoteId ?? quote.carrierId}
              onPress={() => onSelect(quote)}
              hitSlop={{ top: 4, bottom: 4, left: 8, right: 8 }}
              style={({ pressed }) => [
                styles.row,
                isSelected && styles.rowSelected,
                pressed && styles.rowPressed,
              ]}
              accessibilityRole="radio"
              accessibilityState={{ selected: isSelected }}
              accessibilityLabel={`${quote.label}, ${priceLabel}, ${meta}${isSelected ? ', selected' : ''}`}
            >
              <View style={styles.rowInfo}>
                <Text style={styles.optionLabel}>{quote.label}</Text>
                <Text style={styles.optionMeta}>{meta}</Text>
              </View>
              <Text style={styles.optionPrice}>{priceLabel}</Text>
              {isSelected ? (
                <Ionicons name="checkmark-circle" size={22} color={colors.brand} />
              ) : (
                <Ionicons name="radio-button-off" size={22} color={colors.textMuted} />
              )}
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={styles.noteFooter}>
        <Ionicons name="information-circle-outline" size={12} color={colors.textMuted} />
        <Text style={styles.noteText}>Delivery price updates the order total</Text>
      </View>
    </BottomSheet>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  title: {
    fontSize: TypographyV2.sectionTitle.size,
    fontFamily: TypographyV2.sectionTitle.fontFamily,
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: Space.md },
  listContent: {
    paddingHorizontal: Space.md,
    paddingBottom: Space.xl },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
    paddingVertical: Space.md,
    paddingHorizontal: Space.md,
    gap: Space.sm + 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border },
  rowSelected: {
    backgroundColor: colors.brandSubtle },
  rowPressed: {
    opacity: 0.7 },
  rowInfo: {
    flex: 1,
    gap: 2 },
  optionLabel: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    color: colors.textPrimary },
  optionMeta: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.textSecondary },
  optionPrice: {
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: TypographyV2.bodyStrong.fontFamily,
    fontVariant: ['tabular-nums'],
    color: colors.textPrimary },
  noteFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: Space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border },
  noteText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.textMuted,
    letterSpacing: 0.2 } });
