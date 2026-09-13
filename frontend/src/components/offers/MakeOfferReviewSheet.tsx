import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/ThemeContext';
import { useFormattedPrice } from '../../hooks/useFormattedPrice';
import { CachedImage } from '../CachedImage';
import { AppButton } from '../ui/AppButton';
import { MakeOfferErrorBlock } from './MakeOfferErrorBlock';
import { makeOfferScreenStyles as styles } from './makeOfferScreenStyles';

export interface MakeOfferReviewSheetProps {
  isCounterOffer: boolean;
  previousOffer: number | undefined;
  itemImageUri: string | undefined;
  title: string;
  price: number;
  numericOfferGbp: number;
  platformChargeGbp: number;
  total: number;
  expiryHours: number;
  errorMsg: string;
  isSubmitting: boolean;
  onDismiss: () => void;
  onRetry: () => void;
  onConfirm: () => void | Promise<void>;
}

/** Full-screen confirmation step shown before the offer is submitted.
 *  Displays the offer amount, listing, and seller so the user can verify
 *  before committing. One dominant action (Confirm), one cancel (Back). */
export function MakeOfferReviewSheet({
  isCounterOffer,
  previousOffer,
  itemImageUri,
  title,
  price,
  numericOfferGbp,
  platformChargeGbp,
  total,
  expiryHours,
  errorMsg,
  isSubmitting,
  onDismiss,
  onRetry,
  onConfirm,
}: MakeOfferReviewSheetProps) {
  const { colors } = useAppTheme();
  const { formatFromFiat } = useFormattedPrice();

  return (
    <View style={styles.reviewOverlay}>
      <Pressable
        style={[styles.reviewBackdrop, { backgroundColor: colors.overlay }]}
        onPress={onDismiss}
        accessibilityLabel="Cancel review"
        accessibilityRole="button"
      />
      <View
        style={[styles.reviewSheet, { backgroundColor: colors.background }]}
      >
        <View style={[styles.reviewHandle, { backgroundColor: colors.border }]} />
        <Text style={[styles.reviewTitle, { color: colors.textPrimary }]}>
          {isCounterOffer ? 'Review counter-offer' : 'Review your offer'}
        </Text>

        {/* Listing context */}
        <View style={styles.reviewItemRow}>
          <View style={[styles.itemThumb, { backgroundColor: colors.surfaceAlt }]}>
            {itemImageUri ? (
              <CachedImage
                uri={itemImageUri}
                style={styles.itemThumbImage}
                contentFit="cover"
              />
            ) : (
              <Ionicons name="shirt-outline" size={20} color={colors.textMuted} />
            )}
          </View>
          <View style={styles.reviewItemInfo}>
            <Text style={[styles.reviewItemTitle, { color: colors.textPrimary }]} numberOfLines={2}>
              {title}
            </Text>
            <Text style={[styles.reviewItemPrice, { color: colors.textSecondary }]}>
              Listed at {formatFromFiat(price, 'GBP')}
            </Text>
          </View>
        </View>

        {/* Offer amount — dominant */}
        <View style={[styles.reviewAmountBox, { backgroundColor: colors.surfaceAlt }]}>
          <Text style={[styles.reviewAmountLabel, { color: colors.textMuted }]}>
            {isCounterOffer ? 'Counter-offer amount' : 'Offer amount'}
          </Text>
          <Text style={[styles.reviewAmountValue, { color: colors.brand }]}>
            {formatFromFiat(numericOfferGbp, 'GBP')}
          </Text>
          {isCounterOffer && previousOffer != null && (
            <View style={[styles.reviewCompareRow, { borderTopColor: colors.borderSubtle }]}>
              <View style={styles.reviewCompareItem}>
                <Text style={[styles.reviewCompareLabel, { color: colors.textMuted }]}>
                  Previous
                </Text>
                <Text style={[styles.reviewCompareValue, { color: colors.textSecondary }]}>
                  {formatFromFiat(previousOffer, 'GBP')}
                </Text>
              </View>
              <Ionicons name="arrow-forward" size={16} color={colors.textMuted} />
              <View style={styles.reviewCompareItem}>
                <Text style={[styles.reviewCompareLabel, { color: colors.textMuted }]}>
                  New offer
                </Text>
                <Text style={[styles.reviewCompareValue, { color: colors.brand }]}>
                  {formatFromFiat(numericOfferGbp, 'GBP')}
                </Text>
              </View>
            </View>
          )}
          <Text style={[styles.reviewExpiry, { color: colors.textMuted }]}>
            Valid for {expiryHours} hours · seller must respond before expiry
          </Text>
        </View>

        {/* Summary rows */}
        <View style={[styles.reviewSummaryRow, { borderBottomColor: colors.borderSubtle }]}>
          <Text style={[styles.reviewSummaryLabel, { color: colors.textSecondary }]}>
            Platform charge
          </Text>
          <Text style={[styles.reviewSummaryValue, { color: colors.textPrimary }]}>
            {formatFromFiat(platformChargeGbp, 'GBP')}
          </Text>
        </View>
        <View style={styles.reviewTotalRow}>
          <Text style={[styles.reviewTotalLabel, { color: colors.textPrimary }]}>
            Total
          </Text>
          <Text style={[styles.reviewTotalValue, { color: colors.brand }]}>
            {formatFromFiat(total, 'GBP')}
          </Text>
        </View>

        {/* Error within review */}
        {!!errorMsg && (
          <MakeOfferErrorBlock message={errorMsg} onRetry={onRetry} />
        )}

        {/* Actions */}
        <View style={styles.reviewActions}>
          <Pressable
            style={({ pressed }) => [
              styles.reviewCancelBtn,
              { borderColor: colors.border },
              pressed && { opacity: 0.7 },
            ]}
            onPress={onDismiss}
            disabled={isSubmitting}
            accessibilityRole="button"
            accessibilityLabel="Go back to edit offer"
          >
            <Text style={[styles.reviewCancelText, { color: colors.textSecondary }]}>
              Back
            </Text>
          </Pressable>
          <AppButton
            style={styles.reviewConfirmBtn}
            title={isSubmitting ? 'Sending…' : 'Confirm & send'}
            subtitle={formatFromFiat(total, 'GBP')}
            icon={isSubmitting ? undefined : <Ionicons name="paper-plane-outline" size={16} color={colors.textInverse} />}
            variant="primary"
            size="lg"
            onPress={onConfirm}
            disabled={isSubmitting}
            loading={isSubmitting}
            accessibilityLabel={`Confirm ${isCounterOffer ? 'counter-offer' : 'offer'} of ${formatFromFiat(numericOfferGbp, 'GBP')} on ${title}`}
          />
        </View>
      </View>
    </View>
  );
}
