import React from 'react';
import { View, Text } from 'react-native';
import { useAppTheme } from '../../theme/ThemeContext';
import { AppIcon } from '../common/AppIcon';
import { IconSize } from '../../theme/iconTokens';
import type { EditListingSaveStage } from './editListingViewModels';
import { editListingStyles as styles, useEditListingThemedStyles } from './editListingStyles';

/**
 * The flat inline feedback rows at the foot of the edit-listing form: the
 * staged save error (only shown once a save attempt has run) and the
 * category-aware completeness indicator — truthful completeness based on
 * the category policy, flat inline with no card chrome (§4 surface budget).
 * Extracted verbatim from EditListingScreen.
 */

export function EditListingInlineError({
  errorMsg,
  saveStage,
}: {
  errorMsg: string;
  saveStage: EditListingSaveStage;
}) {
  const themed = useEditListingThemedStyles();
  if (!errorMsg || saveStage === 'idle') return null;
  return (
    <View style={styles.inlineErrorRow}>
      <AppIcon name="alert-circle" size={16} color="danger" opticalCenter accessible={false} />
      <Text style={[styles.inlineErrorText, themed.inlineErrorText]}>{errorMsg}</Text>
    </View>
  );
}

export function EditListingCompletenessRow({
  canActivate,
  completenessLabel,
  recommendedLabel,
}: {
  canActivate: boolean;
  completenessLabel: string;
  recommendedLabel: string | null;
}) {
  const { colors } = useAppTheme();
  return (
    <View style={styles.completenessRow}>
      <AppIcon
        name={canActivate ? 'checkmark-circle' : 'alert-circle-outline'}
        size={IconSize.sm}
        color={canActivate ? 'success' : 'warning'}
        opticalCenter
        accessible={false}
      />
      <View style={styles.completenessTextWrap}>
        <Text style={[styles.completenessLabel, { color: canActivate ? colors.success : colors.textSecondary }]}>
          {completenessLabel}
        </Text>
        {recommendedLabel && !canActivate ? (
          <Text style={[styles.completenessHint, { color: colors.textMuted }]}>
            {recommendedLabel}
          </Text>
        ) : null}
      </View>
    </View>
  );
}
