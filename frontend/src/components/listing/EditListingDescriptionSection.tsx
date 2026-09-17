import React from 'react';
import { View, Text, TextInput } from 'react-native';
import { useAppTheme } from '../../theme/ThemeContext';
import { t } from '../../i18n';
import { EditListingFieldLabel } from './EditListingFieldChrome';
import { editListingStyles as styles, useEditListingThemedStyles } from './editListingStyles';

interface EditListingDescriptionSectionProps {
  description: string;
  onChangeDescription: (v: string) => void;
  isEditingRestricted: boolean;
}

/**
 * The DESCRIPTION section of the edit-listing form: multiline input plus the
 * live character counter with its three-tier copy (min/more/count).
 * Extracted verbatim from EditListingScreen.
 */
export function EditListingDescriptionSection({
  description,
  onChangeDescription,
  isEditingRestricted,
}: EditListingDescriptionSectionProps) {
  const { colors } = useAppTheme();
  const themed = useEditListingThemedStyles();
  const trimmedLen = description.trim().length;

  return (
    <View style={styles.sectionGroup}>
      <Text style={[styles.sectionHeading, themed.sectionHeading]}>{t('listing.create.description')}</Text>
      <View style={styles.fieldGroup}>
        <EditListingFieldLabel
          label={t('listing.create.description')}
          status={trimmedLen >= 10 ? 'filled' : 'required'}
        />
        <TextInput
          style={[styles.descInput, themed.descInput, isEditingRestricted && styles.fieldInputDisabled]}
          value={description}
          onChangeText={onChangeDescription}
          placeholder={t('listing.edit.descriptionPlaceholder')}
          placeholderTextColor={colors.textMuted}
          multiline
          numberOfLines={4}
          textAlignVertical="top"
          editable={!isEditingRestricted}
        />
        <Text style={[styles.charCount, trimmedLen < 10 ? themed.charCountWarn : themed.charCount]}>
          {trimmedLen < 10 ? t('listing.create.charCountMin', { count: trimmedLen }) : description.length < 60 ? t('listing.create.charCountMore', { count: description.length }) : t('listing.create.charCount', { count: description.length })}
        </Text>
      </View>
    </View>
  );
}
