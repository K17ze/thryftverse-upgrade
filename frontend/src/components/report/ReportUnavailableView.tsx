import React from 'react';
import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AnimatedPressable } from '../AnimatedPressable';
import { useAppTheme } from '../../theme/ThemeContext';
import { useAppTranslation } from '../../i18n/useAppTranslation';
import type { ReportScreenStyles } from './reportScreenStyles';

interface ReportUnavailableViewProps {
  onGoBack: () => void;
  styles: ReportScreenStyles;
}

/** Shown when the Report route is missing its targetId param. */
export function ReportUnavailableView({ onGoBack, styles }: ReportUnavailableViewProps) {
  const { colors } = useAppTheme();
  const { t } = useAppTranslation('report');

  return (
    <View style={styles.complete}>
      <Ionicons
        name="alert-circle-outline"
        size={28}
        color={colors.textMuted}
      />
      <Text style={styles.completeTitle}>{t('unavailable.title')}</Text>
      <Text style={styles.completeBody}>
        {t('unavailable.body')}
      </Text>
      <AnimatedPressable
        style={styles.secondaryDoneAction}
        onPress={onGoBack}
        activeOpacity={0.72}
        scaleValue={0.98}
        accessibilityRole="button"
        accessibilityLabel={t('unavailable.goBack')}
      >
        <Text style={styles.secondaryDoneText}>{t('unavailable.goBack')}</Text>
      </AnimatedPressable>
    </View>
  );
}
