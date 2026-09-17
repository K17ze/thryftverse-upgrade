import React from 'react';
import { View, Text, TextInput, type LayoutChangeEvent } from 'react-native';
import { useAppTheme } from '../../theme/ThemeContext';
import { useCurrencyPref } from '../../hooks/useCurrencyPref';
import { CURRENCIES } from '../../constants/currencies';
import { AppIcon } from '../common/AppIcon';
import type { SoldCompsResult } from '../../hooks/useSoldComps';
import type { PriceVsMarket } from './editListingViewModels';
import { t } from '../../i18n';
import { EditListingHairline, EditListingFieldLabel } from './EditListingFieldChrome';
import { editListingStyles as styles, useEditListingThemedStyles } from './editListingStyles';

interface EditListingPricingSectionProps {
  price: string;
  onChangePrice: (v: string) => void;
  originalPrice: string;
  onChangeOriginalPrice: (v: string) => void;
  hasValidPrice: boolean;
  hasDiscount: boolean;
  discountPercent: number;
  soldComps: SoldCompsResult;
  priceVsMarket: PriceVsMarket;
  isEditingRestricted: boolean;
  /** Layout tracker for the 'price' deep-link scroll target. */
  onSectionLayout: (e: LayoutChangeEvent) => void;
}

/**
 * The PRICING section of the edit-listing form: price input with currency
 * symbol, discount-off-original preview, sold-comparables pricing guidance
 * (range / suggested / vs-market signals) and the original-price input.
 * Extracted verbatim from EditListingScreen.
 */
export function EditListingPricingSection({
  price,
  onChangePrice,
  originalPrice,
  onChangeOriginalPrice,
  hasValidPrice,
  hasDiscount,
  discountPercent,
  soldComps,
  priceVsMarket,
  isEditingRestricted,
  onSectionLayout,
}: EditListingPricingSectionProps) {
  const { colors } = useAppTheme();
  const themed = useEditListingThemedStyles();
  const { currencyCode } = useCurrencyPref();
  const currencySymbol = CURRENCIES[currencyCode].symbol;

  return (
    <View style={styles.sectionGroup} onLayout={onSectionLayout}>
      <Text style={[styles.sectionHeading, themed.sectionHeading]}>{t('listing.edit.pricing')}</Text>

      <View style={styles.fieldGroup}>
        <EditListingFieldLabel
          label={t('listing.create.price')}
          status={hasValidPrice ? 'filled' : 'required'}
        />
        <View style={styles.priceRow}>
          <Text style={[styles.currencySymbol, themed.currencySymbol]}>{currencySymbol}</Text>
          <TextInput
            style={[styles.fieldInput, themed.fieldInput, styles.priceInput, isEditingRestricted && styles.fieldInputDisabled]}
            value={price}
            onChangeText={onChangePrice}
            placeholder="0.00"
            placeholderTextColor={colors.textMuted}
            keyboardType="decimal-pad"
            editable={!isEditingRestricted}
          />
        </View>
        {hasDiscount && (
          <Text style={[styles.discountPreview, themed.discountPreview]}>{t('listing.create.discountOffOriginal', { percent: discountPercent })}</Text>
        )}
        {soldComps.hasComps && soldComps.minPrice != null && soldComps.maxPrice != null ? (
          <View style={styles.priceSuggestionBlock}>
            <View style={styles.soldCompsHint}>
              <AppIcon name="cash-outline" size={12} color="textMuted" opticalCenter accessible={false} />
              <Text style={[styles.soldCompsText, themed.soldCompsText]}>
                {t('listing.create.soldCompsRange', { min: `${currencySymbol}${soldComps.minPrice.toFixed(0)}`, max: `${currencySymbol}${soldComps.maxPrice.toFixed(0)}`, count: soldComps.sampleSize })}
              </Text>
            </View>
            {soldComps.medianPrice != null && (
              <View style={styles.soldCompsHint}>
                <AppIcon name="bulb-outline" size={12} color="brand" opticalCenter accessible={false} />
                <Text style={[styles.soldCompsText, themed.priceSuggestion]}>
                  {t('listing.create.suggestedPrice', { amount: `${currencySymbol}${soldComps.medianPrice.toFixed(0)}` })}
                </Text>
              </View>
            )}
            {priceVsMarket === 'above' && (
              <View style={styles.soldCompsHint}>
                <AppIcon name="trending-up-outline" size={12} color="warning" opticalCenter accessible={false} />
                <Text style={[styles.soldCompsText, themed.priceMarketHigh]}>
                  {t('listing.create.pricedAboveRange')}
                </Text>
              </View>
            )}
            {priceVsMarket === 'below' && (
              <View style={styles.soldCompsHint}>
                <AppIcon name="trending-down-outline" size={12} color="textMuted" opticalCenter accessible={false} />
                <Text style={[styles.soldCompsText, themed.priceMarketLow]}>
                  {t('listing.create.pricedBelowRange')}
                </Text>
              </View>
            )}
            {priceVsMarket === 'in_range' && (
              <View style={styles.soldCompsHint}>
                <AppIcon name="checkmark-circle" size={12} color="success" opticalCenter accessible={false} />
                <Text style={[styles.soldCompsText, themed.priceMarketGood]}>
                  {t('listing.create.pricedInRange')}
                </Text>
              </View>
            )}
          </View>
        ) : (
          <View style={styles.soldCompsHint}>
            <AppIcon name="information-circle-outline" size={12} color="textMuted" opticalCenter accessible={false} />
            <Text style={[styles.soldCompsText, themed.priceNoCompsHint]}>
              {t('listing.create.priceCompetitively')}
            </Text>
          </View>
        )}
        <EditListingHairline />
      </View>

      <View style={styles.fieldGroup}>
        <Text style={[styles.fieldLabel, themed.fieldLabel]}>{t('listing.create.originalPrice')}</Text>
        <View style={styles.priceRow}>
          <Text style={[styles.currencySymbol, themed.currencySymbol]}>{currencySymbol}</Text>
          <TextInput
            style={[styles.fieldInput, themed.fieldInput, styles.priceInput, isEditingRestricted && styles.fieldInputDisabled]}
            value={originalPrice}
            onChangeText={onChangeOriginalPrice}
            placeholder="0.00"
            placeholderTextColor={colors.textMuted}
            keyboardType="decimal-pad"
            editable={!isEditingRestricted}
          />
        </View>
      </View>
    </View>
  );
}
