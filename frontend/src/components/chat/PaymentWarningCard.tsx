import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Space, Radius, Stroke} from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { useAppTheme } from '../../theme/ThemeContext';
import { useAppTranslation } from '../../i18n/useAppTranslation';

export interface PaymentWarningCardProps {
  /** Whether this warning has been dismissed by the user */
  dismissed: boolean;
  /** Called when the user dismisses the warning */
  onDismiss: () => void;
  /** Called when the user taps "Report" */
  onReport?: () => void;
  /** Whether the warning is shown for the current user's own message */
  isMe: boolean;
}

/**
 * Inline warning card shown below chat messages that contain off-platform
 * payment patterns (PayPal, bank transfer, WhatsApp, etc.).
 *
 * Non-blocking: the message is still sent. The card appears below the message
 * bubble to educate the user about Buyer Protection.
 *
 * Per spec 10.9: "warning renders under the triggering message locally;
 * no false-block of sending; events logged for trust ops."
 */
export function PaymentWarningCard({ dismissed, onDismiss, onReport, isMe }: PaymentWarningCardProps) {
  const { colors } = useAppTheme();
  const { t } = useAppTranslation('messaging');
  if (dismissed) return null;

  return (
    <View style={[styles.container, { backgroundColor: colors.dangerSubtle, borderColor: colors.dangerBorder }, isMe && styles.containerMe]}>
      <Ionicons name="warning" size={20} color={colors.danger} />
      <View style={styles.textCol}>
        <Text style={[styles.title, { color: colors.danger }]}>
          {t('safety.title')}
        </Text>
        <Text style={[styles.body, { color: colors.textSecondary }]}>
          {t('safety.body')}
        </Text>
        {onReport && (
          <Pressable
            style={styles.reportBtn}
            onPress={onReport}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel={t('safety.reportConversation')}
          >
            <Ionicons name="flag-outline" size={12} color={colors.danger} />
            <Text style={[styles.reportBtnText, { color: colors.danger }]}>{t('common.report')}</Text>
          </Pressable>
        )}
      </View>
      <Pressable
        style={styles.closeBtn}
        onPress={onDismiss}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        accessibilityRole="button"
        accessibilityLabel={t('safety.dismiss')}
      >
        <Ionicons name="close" size={14} color={colors.textMuted} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: Space.sm + 2,
    marginTop: Space.xs + 2,
    marginHorizontal: Space.md,
    paddingHorizontal: Space.md + 2,
    paddingVertical: Space.md,
    borderRadius: Radius.lg,
    borderWidth: Stroke.standard },
  containerMe: {
    marginHorizontal: 0,
    alignSelf: 'flex-end',
    maxWidth: '85%' },
  textCol: {
    flex: 1,
    gap: Space.xs },
  title: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily },
  body: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight + 2,
    fontFamily: TypographyV2.meta.fontFamily },
  reportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    marginTop: Space.xs + 2,
    alignSelf: 'flex-start',
    minHeight: 32 },
  reportBtnText: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily },
  closeBtn: {
    paddingTop: 2,
    flexShrink: 0,
    minHeight: 32 } });
