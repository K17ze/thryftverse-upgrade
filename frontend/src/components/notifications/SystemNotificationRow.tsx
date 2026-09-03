import React, { useMemo } from 'react';
import { Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import {
  NotificationRowBase,
  NotificationStatusIcon,
  NotificationActionButton,
  NotificationThumbnail } from './NotificationRowBase';
import {
  FontFamily } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import {
  readPayloadString,
  type NotificationEventV2 } from '../../services/notificationsApi';

// ---------------------------------------------------------------------------
// SystemNotificationRow — resolution / dispute / system events
// ---------------------------------------------------------------------------
// Covers: resolution_opened, resolution_status_changed, generic system events.
// Layout: status icon → subject + status → optional "Respond" action button
// ---------------------------------------------------------------------------

export interface SystemNotificationRowProps {
  event: NotificationEventV2;
  time: string;
  aggregatedCount?: number;
  inAttentionSection?: boolean;
  onPress: () => void;
  onAction?: () => void;
}

interface SystemVisual {
  icon: keyof typeof Ionicons.glyphMap;
  accentKey: 'warning' | 'danger' | 'brand';
  statusLabel: string;
  actionLabel?: string;
}

function resolveSystemVisual(eventType: NotificationEventV2['eventType']): SystemVisual {
  switch (eventType) {
    case 'resolution_opened':
      return { icon: 'alert-circle-outline', accentKey: 'warning', statusLabel: 'Dispute opened', actionLabel: 'Respond' };
    case 'resolution_status_changed':
      return { icon: 'document-text-outline', accentKey: 'brand', statusLabel: 'Status updated' };
    default:
      return { icon: 'information-circle-outline', accentKey: 'brand', statusLabel: 'System update' };
  }
}

export function SystemNotificationRow({
  event,
  time,
  aggregatedCount,
  inAttentionSection = false,
  onPress,
  onAction }: SystemNotificationRowProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const visual = useMemo(() => resolveSystemVisual(event.eventType), [event.eventType]);
  const accentColor = colors[visual.accentKey] ?? colors.brand;
  const isUnread = !event.readAt;

  // Title vs Body deduplication:
  const titleText = event.title || visual.statusLabel;
  const rawBody = event.body?.trim();
  const bodyText = rawBody && rawBody !== titleText
    ? rawBody
    : visual.statusLabel !== titleText
      ? visual.statusLabel
      : event.eventType.replace(/_/g, ' ');

  const objectImage = event.objectRef?.imageUrl ?? event.imageUrl;

  const accessibilityLabel = `${isUnread ? 'Unread. ' : ''}${event.requiresAction ? 'Action required. ' : ''}${titleText}. ${bodyText}. ${time}${visual.actionLabel ? `. Button: ${visual.actionLabel}` : ''}`;

  const leading = (
    <NotificationStatusIcon
      icon={visual.icon}
      accentColor={accentColor}
      size={24}
    />
  );

  const trailing = visual.actionLabel && event.requiresAction ? (
    <NotificationActionButton
      label={visual.actionLabel}
      onPress={onAction ?? onPress}
      colors={colors}
      variant="primary"
    />
  ) : objectImage ? (
    <NotificationThumbnail
      uri={objectImage}
      colors={colors}
      fallbackIcon="information-circle-outline"
      size={44}
    />
  ) : undefined;

  return (
    <NotificationRowBase
      event={event}
      time={time}
      aggregatedCount={aggregatedCount}
      inAttentionSection={inAttentionSection}
      onPress={onPress}
      leading={leading}
      trailing={trailing}
      accessibilityLabel={accessibilityLabel}
    >
      <Text style={[styles.title, isUnread && styles.titleUnread]} numberOfLines={1}>
        {titleText}
      </Text>
      <Text style={styles.body} numberOfLines={2}>
        {bodyText}
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
    body: {
      fontSize: TypographyV2.body.size,
      fontFamily: FontFamily.regular,
      color: colors.textSecondary,
      lineHeight: TypographyV2.body.lineHeight } });
}
