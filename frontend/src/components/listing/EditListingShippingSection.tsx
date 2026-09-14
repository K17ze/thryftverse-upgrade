import React from 'react';
import { View, Text, type LayoutChangeEvent } from 'react-native';
import { t } from '../../i18n';
import { EditListingHairline, EditListingPickerRow } from './EditListingFieldChrome';
import { editListingStyles as styles, useEditListingThemedStyles } from './editListingStyles';

interface EditListingShippingSectionProps {
  shippingMethod: 'standard' | 'express' | null;
  onToggleShippingMethod: () => void;
  shippingPayer: 'buyer' | 'seller' | null;
  onToggleShippingPayer: () => void;
  isEditingRestricted: boolean;
  /** Layout tracker for the 'shipping' deep-link scroll target. */
  onSectionLayout: (e: LayoutChangeEvent) => void;
}

/**
 * The SHIPPING section of the edit-listing form: two flat toggle rows —
 * method (standard ⇄ express) and payer (buyer ⇄ seller). Extracted
 * verbatim from EditListingScreen.
 */
export function EditListingShippingSection({
  shippingMethod,
  onToggleShippingMethod,
  shippingPayer,
  onToggleShippingPayer,
  isEditingRestricted,
  onSectionLayout,
}: EditListingShippingSectionProps) {
  const themed = useEditListingThemedStyles();

  return (
    <View style={styles.sectionGroup} onLayout={onSectionLayout}>
      <Text style={[styles.sectionHeading, themed.sectionHeading]}>{t('listing.edit.shipping')}</Text>

      <EditListingPickerRow
        label={t('listing.edit.shippingMethod')}
        value={shippingMethod === 'standard' ? t('listing.edit.shippingStandard') : shippingMethod === 'express' ? t('listing.edit.shippingExpress') : undefined}
        placeholder={t('listing.edit.selectMethod')}
        status="none"
        icon="swap-horizontal"
        onPress={onToggleShippingMethod}
        disabled={isEditingRestricted}
        accessibilityLabel={t('listing.edit.toggleShippingMethod')}
      />
      <EditListingHairline />

      <EditListingPickerRow
        label={t('listing.edit.whoPays')}
        value={shippingPayer === 'buyer' ? t('listing.edit.payerBuyer') : shippingPayer === 'seller' ? t('listing.edit.payerSeller') : undefined}
        placeholder={t('listing.edit.selectPayer')}
        status="none"
        icon="swap-horizontal"
        onPress={onToggleShippingPayer}
        disabled={isEditingRestricted}
        accessibilityLabel={t('listing.edit.toggleShippingPayer')}
      />
    </View>
  );
}
