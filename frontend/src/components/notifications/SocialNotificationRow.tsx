import React, { useMemo } from 'react';
import { View, Text, StyleSheet, AccessibilityActionEvent, AccessibilityActionInfo } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { CachedImage } from '../CachedImage';
import {
  NotificationRowBase,
  NotificationThumbnail } from './NotificationRowBase';
import {
  Radius,
  FontFamily,
  Stroke } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import type { NotificationEventV2 } from '../../services/notificationsApi';

// ---------------------------------------------------------------------------
// SocialNotificationRow — actor-driven engagement events
// ---------------------------------------------------------------------------
// Covers: review_received, chat_message, and any social-role event.
// Layout: actor avatar (with unread ring) → "X liked your item" → object thumbnail
// ---------------------------------------------------------------------------

export interface SocialNotificationRowProps {
  event: NotificationEventV2;
  time: string;
  aggregatedCount?: number;
  aggregatedActors?: string[];
  inAttentionSection?: boolean;
  onPress: () => void;
  onActorPress?: () => void;
  actionLabel?: string;
  onActionPress?: () => void;
  accessibilityActions?: AccessibilityActionInfo[];
  onAccessibilityAction?: (event: AccessibilityActionEvent) => void;
}

export function SocialNotificationRow({
  event,
  time,
  aggregatedCount,
  aggregatedActors,
  inAttentionSection = false,
  onPress,
  onActorPress,
  actionLabel,
  onActionPress,
  accessibilityActions,
  onAccessibilityAction }: SocialNotificationRowProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const actor = event.actorRef;
  const isUnread = !event.readAt;
  const objectLabel = event.objectRef?.label;
  const objectImage = event.objectRef?.imageUrl ?? event.imageUrl ?? undefined;

  // Build the description text from structured data, not regex.
  const actorName = aggregatedCount && aggregatedCount > 1
    ? `${aggregatedActors?.[0] ?? actor?.displayName ?? 'Someone'} and ${aggregatedCount - 1} other${aggregatedCount - 1 === 1 ? '' : 's'}`
    : actor?.displayName ?? 'Someone';

  const description = useMemo(
    () => describeSocialEvent(event, actorName, objectLabel),
    [event, actorName, objectLabel]
  );

  const accessibilityLabel = `${isUnread ? 'Unread. ' : ''}${description}, ${time}${onActorPress ? '. Tap to open' : ''}`;

  // Leading: actor avatar (unread state shown via dot in the base)
  const leading = (
    <View style={styles.avatarWrap}>
      {actor?.avatarUrl ? (
        <CachedImage
          uri={actor.avatarUrl}
          style={styles.avatar}
          contentFit="cover"
        />
      ) : (
        <View style={[styles.avatar, styles.avatarFallback]}>
          <Ionicons name="person" size={18} color={colors.textSecondary} />
        </View>
      )}
    </View>
  );

  // Trailing: object thumbnail (smaller, secondary)
  const trailing = event.objectRef ? (
    <NotificationThumbnail
      uri={objectImage}
      fallbackIcon="notifications-outline"
      size={40}
      colors={colors}
    />
  ) : undefined;

  return (
    <NotificationRowBase
      event={event}
      time={time}
      aggregatedCount={aggregatedCount}
      inAttentionSection={inAttentionSection}
      onPress={onPress}
      actionLabel={actionLabel}
      onActionPress={onActionPress}
      accessibilityActions={accessibilityActions}
      onAccessibilityAction={onAccessibilityAction}
      leading={leading}
      trailing={trailing}
      accessibilityLabel={accessibilityLabel}
    >
      <Text style={[styles.title, isUnread && styles.titleUnread]} numberOfLines={1}>
        {event.title || actorName}
      </Text>
      <Text style={styles.body} numberOfLines={2}>
        {description}
      </Text>
    </NotificationRowBase>
  );
}

/**
 * Build the social sentence from the event type — never from body text.
 * Each event type owns its sentence shape so actor-less events (follows)
 * never fabricate an object, and object-less events (chat, live) never
 * fabricate an "about your item" clause.
 */
function describeSocialEvent(
  event: NotificationEventV2,
  actorName: string,
  objectLabel: string | undefined
): string {
  switch (event.eventType) {
    case 'review_received':
      return `${actorName} reviewed ${objectLabel ?? 'your item'}`;
    case 'review_response_received':
      return `${actorName} responded to your review`;
    case 'chat_message':
      return objectLabel
        ? `${actorName} messaged you about ${objectLabel}`
        : `${actorName} sent you a message`;
    case 'new_follower':
    case 'follow_received':
      return `${actorName} started following you`;
    case 'new_listing_from_followed_seller':
      return `${actorName} listed ${objectLabel ?? 'a new item'}`;
    case 'live_started':
      return objectLabel
        ? `${actorName} is live — ${objectLabel}`
        : `${actorName} is live`;
    default:
      return objectLabel
        ? `${actorName} interacted with ${objectLabel}`
        : `${actorName} interacted with you`;
  }
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    avatarWrap: {
      alignItems: 'center',
      justifyContent: 'center' },
    avatar: {
      width: 40,
      height: 40,
      borderRadius: Radius.full },
    avatarFallback: {
      borderWidth: Stroke.standard,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center' },
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
