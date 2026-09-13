import React from 'react';
import { ActivityIndicator, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AnimatedPressable } from '../AnimatedPressable';
import { useAppTheme } from '../../theme/ThemeContext';
import { useAppTranslation } from '../../i18n/useAppTranslation';
import { MAX_REPORT_EVIDENCE } from '../../utils/reportLogic';
import type { EvidenceItem } from '../../utils/reportLogic';
import type { ReportScreenStyles } from './reportScreenStyles';
import { ReportEvidenceGrid } from './ReportEvidenceGrid';

interface ReportDetailsSectionProps {
  details: string;
  onChangeDetails: (text: string) => void;
  evidenceItems: EvidenceItem[];
  isUploading: boolean;
  onTakeEvidence: () => void;
  onPickEvidence: () => void;
  onRemoveEvidence: (id: string) => void;
  styles: ReportScreenStyles;
}

/**
 * Free-text details + evidence photo capture section. Rendered only once
 * a report reason has been selected (the screen controls visibility).
 */
export function ReportDetailsSection({
  details,
  onChangeDetails,
  evidenceItems,
  isUploading,
  onTakeEvidence,
  onPickEvidence,
  onRemoveEvidence,
  styles,
}: ReportDetailsSectionProps) {
  const { colors } = useAppTheme();
  const { t } = useAppTranslation('report');

  return (
    <View style={styles.details}>
      <Text style={styles.detailsLabel}>{t('details.label')}</Text>
      <TextInput
        style={styles.detailsInput}
        value={details}
        onChangeText={onChangeDetails}
        placeholder={t('details.placeholder')}
        placeholderTextColor={colors.textMuted}
        multiline
        maxLength={500}
        textAlignVertical="top"
        accessibilityLabel={t('accessibility.detailsInput')}
      />
      <Text style={styles.characterCount}>{t('details.characterCount', { current: details.length, max: 500 })}</Text>

      {/* Evidence photo upload */}
      <Text style={styles.evidenceLabel}>{t('evidence.label')}</Text>
      {evidenceItems.length > 0 ? (
        <ReportEvidenceGrid
          items={evidenceItems}
          mode="editable"
          styles={styles}
          onRemove={onRemoveEvidence}
        />
      ) : null}
      {evidenceItems.length < MAX_REPORT_EVIDENCE ? (
        <View style={styles.evidenceUploadRow}>
          <AnimatedPressable
            style={[styles.evidenceUploadBtn, { borderColor: colors.border, backgroundColor: colors.surface }]}
            onPress={onTakeEvidence}
            scaleValue={0.97}
            hapticFeedback="light"
            accessibilityRole="button"
            accessibilityLabel={t('accessibility.takeEvidenceCamera')}
          >
            <Ionicons name="camera-outline" size={18} color={colors.textPrimary} />
            <Text style={styles.evidenceUploadText}>{t('evidence.camera')}</Text>
          </AnimatedPressable>
          <AnimatedPressable
            style={[styles.evidenceUploadBtn, { borderColor: colors.border, backgroundColor: colors.surface }]}
            onPress={onPickEvidence}
            scaleValue={0.97}
            hapticFeedback="light"
            accessibilityRole="button"
            accessibilityLabel={t('accessibility.chooseEvidenceGallery')}
          >
            {isUploading ? (
              <ActivityIndicator size="small" color={colors.textPrimary} />
            ) : (
              <Ionicons name="images-outline" size={18} color={colors.textPrimary} />
            )}
            <Text style={styles.evidenceUploadText}>{t('evidence.gallery')}</Text>
          </AnimatedPressable>
        </View>
      ) : null}
      <Text style={styles.evidenceCount}>
        {t('evidence.count', { count: evidenceItems.length })}
      </Text>
    </View>
  );
}
