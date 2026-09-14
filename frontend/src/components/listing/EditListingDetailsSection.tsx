import React from 'react';
import { View, Text, TextInput, type LayoutChangeEvent } from 'react-native';
import { useAppTheme } from '../../theme/ThemeContext';
import { AppIcon } from '../common/AppIcon';
import { IconSize } from '../../theme/iconTokens';
import { t } from '../../i18n';
import type { EditListingPickerMode } from './editListingViewModels';
import {
  EditListingHairline,
  EditListingFieldLabel,
  EditListingPickerRow,
} from './EditListingFieldChrome';
import { editListingStyles as styles, useEditListingThemedStyles } from './editListingStyles';

interface EditListingDetailsSectionProps {
  title: string;
  onChangeTitle: (v: string) => void;
  category: string;
  brand: string;
  size: string;
  condition: string;
  /** Category-policy flags — brand/size are "optional" when the policy allows. */
  brandlessValid: boolean;
  sizelessValid: boolean;
  isEditingRestricted: boolean;
  onOpenPicker: (mode: Exclude<EditListingPickerMode, null>) => void;
  /** Layout tracker for the 'format' deep-link scroll target. */
  onFormatLayout: (e: LayoutChangeEvent) => void;
}

/**
 * The DETAILS section of the edit-listing form: the read-only format row
 * (the format is fixed at creation — the update API accepts no format
 * field), the title input, and the category/brand/size/condition picker
 * rows. Extracted verbatim from EditListingScreen.
 */
export function EditListingDetailsSection({
  title,
  onChangeTitle,
  category,
  brand,
  size,
  condition,
  brandlessValid,
  sizelessValid,
  isEditingRestricted,
  onOpenPicker,
  onFormatLayout,
}: EditListingDetailsSectionProps) {
  const { colors } = useAppTheme();
  const themed = useEditListingThemedStyles();

  return (
    <View style={styles.sectionGroup}>
      <Text style={[styles.sectionHeading, themed.sectionHeading]}>{t('listing.create.details')}</Text>

      {/* ── Format (read-only) ──
          The listing format is chosen when a listing is created and the
          update API accepts no format field, so this row is deliberately
          read-only. It gives the ManageListing "Format" deep-link an
          honest destination instead of a dead control. */}
      <View onLayout={onFormatLayout}>
        <View style={styles.pickerRow}>
          <View style={styles.pickerRowInner}>
            <View style={styles.fieldLabelRow}>
              <Text style={[styles.fieldLabel, themed.fieldLabel]}>{t('listing.edit.format')}</Text>
            </View>
            <Text style={[styles.pickerValue, themed.pickerValue]}>
              {t('listing.edit.formatFixedPrice')}
            </Text>
          </View>
          <AppIcon name="lock-closed-outline" size={IconSize.sm} color="textMuted" opticalCenter accessible={false} />
        </View>
        <Text style={[styles.fieldRequiredHint, themed.fieldRequiredHint]}>
          {t('listing.edit.formatHelper')}
        </Text>
      </View>
      <EditListingHairline />

      <View style={styles.fieldGroup}>
        <EditListingFieldLabel
          label={t('listing.create.listingTitle')}
          status={title.trim().length > 0 ? 'filled' : 'required'}
        />
        <TextInput
          style={[styles.fieldInput, themed.fieldInput, isEditingRestricted && styles.fieldInputDisabled]}
          value={title}
          onChangeText={onChangeTitle}
          placeholder={t('listing.edit.titlePlaceholder')}
          placeholderTextColor={colors.textMuted}
          returnKeyType="next"
          editable={!isEditingRestricted}
        />
        <EditListingHairline />
      </View>

      <EditListingPickerRow
        label={t('listing.create.category')}
        value={category}
        placeholder={t('listing.edit.selectCategory')}
        status={category ? 'filled' : 'required'}
        icon="chevron-forward"
        onPress={() => onOpenPicker('Category')}
        disabled={isEditingRestricted}
        accessibilityLabel={t('listing.edit.selectCategory')}
      />
      <EditListingHairline />

      <EditListingPickerRow
        label={t('listing.create.brand')}
        value={brand}
        placeholder={t('listing.edit.selectBrand')}
        status={brand ? 'filled' : brandlessValid ? 'optional' : 'required'}
        icon="chevron-forward"
        onPress={() => onOpenPicker('Brand')}
        disabled={isEditingRestricted}
        accessibilityLabel={t('listing.edit.selectBrand')}
      />
      <EditListingHairline />

      <EditListingPickerRow
        label={t('listing.create.size')}
        value={size}
        placeholder={t('listing.edit.selectSize')}
        status={size ? 'filled' : sizelessValid ? 'optional' : 'required'}
        icon="chevron-forward"
        onPress={() => onOpenPicker('Size')}
        disabled={isEditingRestricted}
        accessibilityLabel={t('listing.edit.selectSize')}
      />
      <EditListingHairline />

      <EditListingPickerRow
        label={t('listing.create.condition')}
        value={condition}
        placeholder={t('listing.edit.selectCondition')}
        status={condition ? 'filled' : 'required'}
        icon="chevron-forward"
        onPress={() => onOpenPicker('Condition')}
        disabled={isEditingRestricted}
        accessibilityLabel={t('listing.edit.selectCondition')}
      />
    </View>
  );
}
