import React from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AnimatedPressable } from '../AnimatedPressable';
import { useAppTheme } from '../../theme/ThemeContext';
import { useAppTranslation } from '../../i18n/useAppTranslation';
import type { EvidenceItem } from '../../utils/reportLogic';
import type { ReportScreenStyles } from './reportScreenStyles';
import { ReportEvidenceGrid } from './ReportEvidenceGrid';

interface ReportSuccessViewProps {
  reportId: string | null;
  submittedAt: string | null;
  evidenceItems: EvidenceItem[];
  showBlockButton: boolean;
  showBlockedNote: boolean;
  isBlocking: boolean;
  onBlock: () => void;
  onDone: () => void;
  styles: ReportScreenStyles;
}

/**
 * Post-submission receipt: report reference, attached evidence, and the
 * optional block-after-report action for user reports.
 */
export function ReportSuccessView({
  reportId,
  submittedAt,
  evidenceItems,
  showBlockButton,
  showBlockedNote,
  isBlocking,
  onBlock,
  onDone,
  styles,
}: ReportSuccessViewProps) {
  const { colors } = useAppTheme();
  const { t } = useAppTranslation('report');

  return (
    <View style={styles.complete}>
      <Ionicons
        name="checkmark-circle-outline"
        size={28}
        color={colors.textPrimary}
      />
      <Text style={styles.completeTitle}>{t('received.title')}</Text>
      {reportId ? (
        <Text style={styles.reportIdText}>
          {t('received.reportId', { reportId })}
        </Text>
      ) : null}
      <Text style={styles.completeBody}>
        {t('received.body')}
      </Text>
      {submittedAt ? (
        <Text style={styles.submittedAtText}>
          {t('received.receivedAt', { time: submittedAt })}
        </Text>
      ) : null}
      {evidenceItems.length > 0 ? (
        <ReportEvidenceGrid items={evidenceItems} mode="submitted" styles={styles} />
      ) : null}
      {reportId ? (
        <Text style={styles.reportIdNote}>
          {t('received.referenceNote')}
        </Text>
      ) : null}
      {showBlockButton ? (
        <AnimatedPressable
          style={styles.blockAction}
          onPress={onBlock}
          activeOpacity={0.78}
          scaleValue={0.98}
          disabled={isBlocking}
          accessibilityRole="button"
          accessibilityLabel={t('accessibility.blockUser')}
          accessibilityState={{ busy: isBlocking, disabled: isBlocking }}
        >
          {isBlocking ? (
            <ActivityIndicator size="small" color={colors.textInverse} />
          ) : (
            <>
              <Ionicons
                name="ban-outline"
                size={16}
                color={colors.textInverse}
              />
              <Text style={styles.blockActionText}>{t('received.blockUser')}</Text>
            </>
          )}
        </AnimatedPressable>
      ) : null}
      {showBlockedNote ? (
        <View style={styles.blockedNote}>
          <Ionicons
            name="checkmark-circle"
            size={16}
            color={colors.success}
          />
          <Text style={styles.blockedNoteText}>
            {t('received.blockedNote')}
          </Text>
        </View>
      ) : null}
      <AnimatedPressable
        style={styles.doneAction}
        onPress={onDone}
        activeOpacity={0.78}
        scaleValue={0.98}
        accessibilityRole="button"
        accessibilityLabel={t('received.done')}
      >
        <Text style={styles.doneActionText}>{t('received.done')}</Text>
      </AnimatedPressable>
    </View>
  );
}
