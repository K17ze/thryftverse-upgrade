import React from 'react';
import { View, Text, TextInput, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/ThemeContext';
import { useFormattedPrice } from '../../hooks/useFormattedPrice';
import { useCurrencyContext } from '../../context/CurrencyContext';
import { convertGbpToDisplayAmount } from '../../utils/currencyAuthoringFlows';
import { t } from '../../i18n';
import { makeOfferScreenStyles as styles } from './makeOfferScreenStyles';

export interface MakeOfferPriceSectionProps {
  isCounterOffer: boolean;
  previousOffer: number | undefined;
  price: number;
  listing: any;
  offerPrice: string;
  numericOfferGbp: number;
  discountPct: number | null;
  onChangeOffer: (value: string) => void;
  onQuickOffer: (percentage: number) => void;
}

/** Price entry section for MakeOfferScreen: the large centered amount
 *  input with a hairline underline, live discount readout, quick-offer
 *  chips (80/90/95% of asking), counter-offer compare strip and the
 *  seller minimum-offer floor notice. */
export function MakeOfferPriceSection({
  isCounterOffer,
  previousOffer,
  price,
  listing,
  offerPrice,
  numericOfferGbp,
  discountPct,
  onChangeOffer,
  onQuickOffer,
}: MakeOfferPriceSectionProps) {
  const { colors } = useAppTheme();
  const { currencySymbol, formatFromFiat } = useFormattedPrice();
  const { currencyCode, fxRates } = useCurrencyContext();
  const quickOfferPercentages = [0.8, 0.9, 0.95];

  return (
    /* ── Price input ──
       Large, centered price field. The currency symbol and amount
       are the dominant visual element. No heavy border — the input
       sits on the flat canvas with a subtle bottom hairline.
       Per Design.md form-field: input background, 52px height,
       Radius.xl. But for a price entry field, we want it to feel
       like a number, not a form field — so we use a larger,
       centered layout with a hairline underline. */
    <View>
    <View style={styles.priceSection}>
      <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>
        {isCounterOffer ? t('makeOffer.label.yourCounterOffer') : t('makeOffer.label.yourOffer')}
      </Text>

      <View style={[styles.priceInputContainer, { borderBottomColor: colors.border }]}>
        <Text style={[styles.currencySymbol, { color: colors.brand }]}>
          {currencySymbol}
        </Text>
        <TextInput
          style={[styles.priceInput, { color: colors.textPrimary }]}
          value={offerPrice}
          onChangeText={onChangeOffer}
          keyboardType="decimal-pad"
          selectionColor={colors.brand}
          placeholderTextColor={colors.textMuted}
          placeholder="0.00"
          accessibilityLabel={t('makeOffer.a11y.offerAmount')}
        />
      </View>

      {/* Discount indicator — dynamic, shows how much below asking */}
      {discountPct != null && (
        <View style={styles.discountRow}>
          <Text style={[styles.discountText, { color: colors.warning }]}>
            {t('makeOffer.discount.belowAsking', { percent: discountPct })}
          </Text>
        </View>
      )}

      {/* Quick offer chips — 80%, 90%, 95% of asking price */}
      <View style={styles.quickOfferRow}>
        {quickOfferPercentages.map((pct) => {
          const gbpAmount = price * pct;
          const displayAmount = convertGbpToDisplayAmount(gbpAmount, currencyCode, fxRates);
          const label = `${Math.round(pct * 100)}%`;
          const sublabel = Number.isFinite(displayAmount)
            ? `${currencySymbol}${displayAmount.toFixed(0)}`
            : '';
          return (
            <Pressable
              key={pct}
              style={[styles.quickOfferChip, { backgroundColor: colors.surfaceAlt, borderColor: colors.borderSubtle }]}
              onPress={() => onQuickOffer(pct)}
              accessibilityRole="button"
              accessibilityLabel={t('makeOffer.a11y.quickOffer', { percent: Math.round(pct * 100), amount: `${currencySymbol}${displayAmount.toFixed(0)}` })}
            >
              <Text style={[styles.quickOfferChipLabel, { color: colors.textPrimary }]}>
                {label}
              </Text>
              {sublabel ? (
                <Text style={[styles.quickOfferChipSub, { color: colors.textSecondary }]}>
                  {sublabel}
                </Text>
              ) : null}
            </Pressable>
          );
        })}
      </View>

      {/* Counter-offer context — previous vs new side by side */}
      {isCounterOffer && previousOffer != null && (
        <View style={[styles.counterCompareBox, { backgroundColor: colors.surfaceAlt }]}>
          <View style={styles.counterCompareCol}>
            <Text style={[styles.counterCompareLabel, { color: colors.textMuted }]}>
              {t('makeOffer.counter.previousOffer')}
            </Text>
            <Text style={[styles.counterCompareValue, { color: colors.textSecondary }]}>
              {formatFromFiat(previousOffer, 'GBP')}
            </Text>
          </View>
          <Ionicons name="arrow-forward" size={16} color={colors.textMuted} />
          <View style={styles.counterCompareCol}>
            <Text style={[styles.counterCompareLabel, { color: colors.brand }]}>
              {t('makeOffer.counter.yourCounter')}
            </Text>
            <Text style={[styles.counterCompareValue, { color: colors.brand }]}>
              {numericOfferGbp > 0 ? formatFromFiat(numericOfferGbp, 'GBP') : '—'}
            </Text>
          </View>
        </View>
      )}

      {/* Seller minimum offer floor notice */}
      {(() => {
        const sellerMinOffer = listing?.minimumOfferGbp ?? listing?.minimum_offer_gbp ?? 0;
        if (sellerMinOffer <= 0) return null;
        return (
          <View style={styles.contextRow}>
            <Ionicons name="information-circle-outline" size={14} color={colors.textSecondary} />
            <Text style={[styles.contextText, { color: colors.textSecondary }]}>
              {t('makeOffer.sellerMinOffer.label', { amount: formatFromFiat(sellerMinOffer, 'GBP') })}
            </Text>
          </View>
        );
      })()}
    </View>
    </View>
  );
}
