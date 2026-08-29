import React, { useMemo } from 'react';
import { Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { useFormattedPrice } from '../../hooks/useFormattedPrice';
import {
  NotificationRowBase,
  NotificationStatusIcon } from './NotificationRowBase';
import {
  Space,
  FontFamily } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import {
  readPayloadNumber,
  readPayloadString,
  type NotificationEventV2 } from '../../services/notificationsApi';

// ---------------------------------------------------------------------------
// FinancialNotificationRow — payout / refund events
// ---------------------------------------------------------------------------
// Covers: payout_processed, refund_completed, order_refunded (financial role).
// Layout: amount icon → type + amount + status → (no trailing thumbnail)
// ---------------------------------------------------------------------------

export interface FinancialNotificationRowProps {
  event: NotificationEventV2;
  time: string;
  aggregatedCount?: number;
  inAttentionSection?: boolean;
  onPress: () => void;
}

interface FinancialVisual {
  icon: keyof typeof Ionicons.glyphMap;
  accentKey: 'success' | 'warning';
  typeLabel: string;
}

function resolveFinancialVisual(eventType: NotificationEventV2['eventType']): FinancialVisual {
  switch (eventType) {
    case 'payout_processed':
      return { icon: 'cash-outline', accentKey: 'success', typeLabel: 'Payout' };
    case 'refund_completed':
      return { icon: 'return-down-back-outline', accentKey: 'warning', typeLabel: 'Refund' };
    case 'order_refunded':
      return { icon: 'return-down-back-outline', accentKey: 'warning', typeLabel: 'Refund' };
    default:
      return { icon: 'wallet-outline', accentKey: 'success', typeLabel: 'Transaction' };
  }
}

export function FinancialNotificationRow({
  event,
  time,
  aggregatedCount,
  inAttentionSection = false,
  onPress }: FinancialNotificationRowProps) {
  const { colors } = useAppTheme();
  const { currencySymbol } = useFormattedPrice();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const visual = useMemo(() => resolveFinancialVisual(event.eventType), [event.eventType]);
  const accentColor = colors[visual.accentKey] ?? colors.brand;
  const isUnread = !event.readAt;

  // Structured amount from the payload — never from prose text.
  const amount = readPayloadNumber(event.payload, 'amountGbp') ?? readPayloadNumber(event.payload, 'amount');
  const currency = readPayloadString(event.payload, 'currency') ?? currencySymbol;
  const status = readPayloadString(event.payload, 'status') ?? 'processed';

  const amountText = amount != null ? `${currency}${amount.toFixed(2)}` : null;
  // The amount is the visual anchor of a financial notification — render it
  // as a dedicated tabular-figures element rather than burying it in prose.
  const description = `${visual.typeLabel} · ${status}`;

  const accessibilityLabel = `${isUnread ? 'Unread. ' : ''}${visual.typeLabel}${amountText ? ` of ${amountText}` : ''}. ${status}. ${time}`;

  const leading = (
    <NotificationStatusIcon
      icon={visual.icon}
      accentColor={accentColor}
      size={24}
    />
  );

  return (
    <NotificationRowBase
      event={event}
      time={time}
      aggregatedCount={aggregatedCount}
      inAttentionSection={inAttentionSection}
      onPress={onPress}
      leading={leading}
      accessibilityLabel={accessibilityLabel}
    >
      <Text style={[styles.title, isUnread && styles.titleUnread]} numberOfLines={1}>
        {event.title || visual.typeLabel}
      </Text>
      {amountText ? (
        <Text style={styles.amount} numberOfLines={1}>
          {amountText}
        </Text>
      ) : null}
      <Text style={styles.body} numberOfLines={2}>
        {description}
      </Text>
    </NotificationRowBase>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    title: {
      fontSize: TypographyV2.bodyStrong.size,
      fontFamily: FontFamily.regular,
      color: colors.textSecondary,
      lineHeight: TypographyV2.bodyStrong.lineHeight,
      flexShrink: 1 },
    titleUnread: {
      color: colors.textPrimary,
      fontFamily: FontFamily.semibold },
    amount: {
      fontSize: TypographyV2.body.size + 2,
      fontFamily: FontFamily.semibold,
      color: colors.textPrimary,
      lineHeight: TypographyV2.body.size + 8,
      fontVariant: ['tabular-nums'],
      marginTop: Space.xs / 2 },
    body: {
      fontSize: TypographyV2.body.size,
      fontFamily: FontFamily.regular,
      color: colors.textSecondary,
      lineHeight: TypographyV2.body.lineHeight } });
}
