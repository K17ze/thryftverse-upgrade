import React from 'react';
import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/ThemeContext';
import { t } from '../../i18n';
import type { DispatchExtension } from './orderCapabilities';
import { orderDetailScreenStyles as styles } from './orderDetailScreenStyles';

interface DispatchExtensionBannerProps {
  /** Latest pending extension (server surfaces only PENDING ones). */
  extension: DispatchExtension | null;
  isBuyer: boolean;
  /** Canonical capability — buyer may accept/decline a pending extension. */
  canRespondExtension: boolean | undefined;
  proposedShipByLabel: string | null;
  isResponding: boolean;
  onRespond: (accept: boolean) => void;
}

/**
 * Pending dispatch extension — buyer approves/declines inline. For the
 * seller this is a single muted status line instead. The action card
 * requires the real capability so a stale pending extension on a
 * delivered/completed order can't offer dead CTAs.
 *
 * Relocated verbatim from OrderDetailScreen.
 */
export function DispatchExtensionBanner({
  extension,
  isBuyer,
  canRespondExtension,
  proposedShipByLabel,
  isResponding,
  onRespond }: DispatchExtensionBannerProps) {
  const { colors } = useAppTheme();

  if (!extension) return null;

  if (isBuyer && canRespondExtension) {
    return (
      <View style={[styles.extensionCard, { borderColor: colors.border }]}>
        <View style={styles.extensionHeader}>
          <Ionicons name="time-outline" size={16} color={colors.textSecondary} aria-hidden={true} />
          <View style={styles.extensionHeaderText}>
            <Text style={[styles.extensionTitle, { color: colors.textPrimary }]}>
              {extension.days === 1
                ? t('orderDetail.extension.requestedOne')
                : t('orderDetail.extension.requestedOther', { days: extension.days })}
            </Text>
            <Text style={[styles.extensionSub, { color: colors.textSecondary }]}>
              {proposedShipByLabel
                ? t('orderDetail.extension.newDeadline', { date: proposedShipByLabel })
                : t('orderDetail.extension.noDate')}
            </Text>
          </View>
        </View>
        <View style={styles.extensionActions}>
          <Pressable
            style={[styles.extensionAcceptBtn, { backgroundColor: colors.brand }]}
            onPress={() => onRespond(true)}
            disabled={isResponding}
            accessibilityRole="button"
            accessibilityLabel={t('orderDetail.extension.acceptA11y')}
          >
            {isResponding ? (
              <ActivityIndicator size="small" color={colors.textInverse} />
            ) : (
              <Text style={[styles.extensionActionText, { color: colors.textInverse }]}>{t('orderDetail.extension.accept')}</Text>
            )}
          </Pressable>
          <Pressable
            style={[styles.extensionDeclineBtn, { borderColor: colors.border }]}
            onPress={() => onRespond(false)}
            disabled={isResponding}
            accessibilityRole="button"
            accessibilityLabel={t('orderDetail.extension.declineA11y')}
          >
            <Text style={[styles.extensionActionText, { color: colors.textSecondary }]}>{t('orderDetail.extension.decline')}</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (isBuyer) return null;

  return (
    <Text style={[styles.extensionPendingLine, { color: colors.textMuted }]}>
      {proposedShipByLabel
        ? t('orderDetail.extension.pendingSellerDated', { date: proposedShipByLabel })
        : t('orderDetail.extension.pendingSeller')}
    </Text>
  );
}
