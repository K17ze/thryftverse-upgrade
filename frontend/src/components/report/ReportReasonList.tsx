import React from 'react';
import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AnimatedPressable } from '../AnimatedPressable';
import { useAppTheme } from '../../theme/ThemeContext';
import { useAppTranslation } from '../../i18n/useAppTranslation';
import { REPORT_REASONS } from '../../utils/reportLogic';
import type { ReportReason } from '../../services/profileApi';
import type { ReportScreenStyles } from './reportScreenStyles';

interface ReportReasonListProps {
  selectedReason: ReportReason | null;
  onSelect: (reason: ReportReason) => void;
  styles: ReportScreenStyles;
}

/**
 * Report reason radio list — single-select rows with icon, label,
 * description and a trailing radio. Haptics and a11y roles/labels are
 * identical to the previous inline implementation.
 */
export function ReportReasonList({ selectedReason, onSelect, styles }: ReportReasonListProps) {
  const { colors } = useAppTheme();
  const { t } = useAppTranslation('report');

  return (
    <View style={styles.reasons}>
      {REPORT_REASONS.map((reason, index) => {
        const selected = selectedReason === reason.key;
        return (
          <AnimatedPressable
            key={reason.key}
            style={[
              styles.reason,
              index < REPORT_REASONS.length - 1 && styles.reasonDivider,
            ]}
            onPress={() => onSelect(reason.key)}
            activeOpacity={0.68}
            scaleValue={0.99}
            hapticFeedback="selection"
            accessibilityRole="radio"
            accessibilityLabel={t(reason.labelKey)}
            accessibilityHint={t(reason.descKey)}
            accessibilityState={{ selected }}
          >
            <View style={[styles.reasonIcon, selected && styles.reasonIconSelected]}>
              <Ionicons
                name={reason.icon}
                size={18}
                color={selected ? colors.textPrimary : colors.textMuted}
              />
            </View>
            <View style={styles.reasonCopy}>
              <Text style={styles.reasonLabel}>{t(reason.labelKey)}</Text>
              <Text style={styles.reasonDescription}>
                {t(reason.descKey)}
              </Text>
            </View>
            <View style={[styles.radio, selected && styles.radioSelected]}>
              {selected ? <View style={styles.radioDot} /> : null}
            </View>
          </AnimatedPressable>
        );
      })}
    </View>
  );
}
