import React from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/ThemeContext';
import { useFormattedPrice } from '../../hooks/useFormattedPrice';
import { AppButton } from '../ui/AppButton';
import { makeOfferScreenStyles as styles } from './makeOfferScreenStyles';

export interface MakeOfferFooterProps {
  isLoading: boolean;
  isCounterOffer: boolean;
  total: number;
  numericOffer: number;
  numericOfferGbp: number;
  title: string;
  isSubmitting: boolean;
  onReview: () => void;
}

/** Sticky footer CTA for MakeOfferScreen. In the compose phase the
 *  button advances to the review step; the review sheet carries its own
 *  confirm button. Per Design.md dock-geometry: single-action height,
 *  brand fill, full width. */
export function MakeOfferFooter({
  isLoading,
  isCounterOffer,
  total,
  numericOffer,
  numericOfferGbp,
  title,
  isSubmitting,
  onReview,
}: MakeOfferFooterProps) {
  const { colors } = useAppTheme();
  const { formatFromFiat } = useFormattedPrice();

  return (
    <View style={[styles.footer, { backgroundColor: colors.background, borderTopColor: colors.border }]}>
      {isLoading ? (
        <View style={styles.footerLoading}>
          <ActivityIndicator size="small" color={colors.brand} />
          <Text style={[styles.footerLoadingText, { color: colors.textMuted }]}>
            Loading listing…
          </Text>
        </View>
      ) : (
        <AppButton
          style={styles.sendBtn}
          title={isCounterOffer ? 'Review counter-offer' : 'Review offer'}
          subtitle={formatFromFiat(total, 'GBP')}
          icon={<Ionicons name="arrow-forward-outline" size={16} color={colors.textInverse} />}
          variant="primary"
          size="lg"
          onPress={onReview}
          disabled={numericOffer <= 0 || isSubmitting}
          loading={isSubmitting}
          accessibilityLabel={`Review ${isCounterOffer ? 'counter-offer' : 'offer'} of ${formatFromFiat(numericOfferGbp, 'GBP')} on ${title}`}
        />
      )}
    </View>
  );
}
