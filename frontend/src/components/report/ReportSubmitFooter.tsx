import React from 'react';
import { ActivityIndicator, Text } from 'react-native';
import { AnimatedPressable } from '../AnimatedPressable';
import { useAppTheme } from '../../theme/ThemeContext';
import { useAppTranslation } from '../../i18n/useAppTranslation';
import type { ReportScreenStyles } from './reportScreenStyles';

interface ReportSubmitFooterProps {
  canSubmit: boolean;
  isSubmitting: boolean;
  onSubmit: () => void;
  styles: ReportScreenStyles;
}

/** Sticky-footer submit action for the report form. */
export function ReportSubmitFooter({ canSubmit, isSubmitting, onSubmit, styles }: ReportSubmitFooterProps) {
  const { colors } = useAppTheme();
  const { t } = useAppTranslation('report');

  return (
    <AnimatedPressable
      style={[styles.submitAction, !canSubmit && styles.submitDisabled]}
      onPress={onSubmit}
      activeOpacity={0.78}
      scaleValue={0.985}
      disabled={!canSubmit}
      accessibilityRole="button"
      accessibilityLabel={t('submit.label')}
      accessibilityState={{ disabled: !canSubmit, busy: isSubmitting }}
    >
      {isSubmitting ? (
        <ActivityIndicator size="small" color={colors.textInverse} />
      ) : (
        <Text style={styles.submitText}>{t('submit.label')}</Text>
      )}
    </AnimatedPressable>
  );
}
