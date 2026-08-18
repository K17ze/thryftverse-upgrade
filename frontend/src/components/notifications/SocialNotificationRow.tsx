import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { CachedImage } from '../CachedImage';
import {
  NotificationRowBase,
  NotificationThumbnail,
} from './NotificationRowBase';
import {
  Space,
  Radius,
  Stroke,
  Control,
  Type,
  FontFamily,
} from '../../theme/designTokens';
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
}

export function SocialNotificationRow({
  event,
  time,
  aggregatedCount,
  aggregatedActors,
  inAttentionSection = false,
  onPress,
  onActorPress,
}: SocialNotificationRowProps) {
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

  const verb = useMemo(() => deriveSocialVerb(event), [event]);
  const objectNoun = objectLabel ?? 'your item';
  const description = `${actorName} ${verb} ${objectNoun}`;

  const accessibilityLabel = `${isUnread ? 'Unread. ' : ''}${description}, ${time}${onActorPress ? '. Tap to open' : ''}`;

  // Leading: actor avatar with unread ring
  const leading = (
    <View style={styles.avatarWrap}>
      <View style={[styles.avatarRing, isUnread && styles.avatarRingUnread]}>
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
      leading={leading}
      trailing={trailing}
      accessibilityLabel={accessibilityLabel}
    >
      <Text style={[styles.title, isUnread && styles.titleUnread]} numberOfLines={1}>
        {event.title || actorName}
      </Text>
      <Text style={[styles.body, isUnread && styles.bodyUnread]} numberOfLines={2}>
        {description}
      </Text>
    </NotificationRowBase>
  );
}

/** Derive the social verb from the event type — never from body text. */
function deriveSocialVerb(event: NotificationEventV2): string {
  switch (event.eventType) {
    case 'review_received':
      return 'reviewed';
    case 'chat_message':
      return 'messaged you about';
    default:
      return 'interacted with';
  }
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    avatarWrap: {
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarRing: {
      width: 44,
      height: 44,
      borderRadius: Radius.full,
      borderWidth: 0,
      borderColor: 'transparent',
      overflow: 'hidden',
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarRingUnread: {
      borderWidth: Stroke.emphasis - 0.5,
      borderColor: colors.brand,
    },
    avatar: {
      width: 40,
      height: 40,
      borderRadius: Radius.full,
    },
    avatarFallback: {
      backgroundColor: colors.surfaceAlt,
      alignItems: 'center',
      justifyContent: 'center',
    },
    title: {
      fontSize: Type.body.size,
      fontFamily: FontFamily.regular,
      color: colors.textSecondary,
      lineHeight: Type.body.lineHeight,
    },
    titleUnread: {
      color: colors.textPrimary,
      fontFamily: FontFamily.semibold,
    },
    body: {
      fontSize: Type.body.size,
      fontFamily: FontFamily.regular,
      color: colors.textSecondary,
      lineHeight: Type.body.lineHeight,
    },
    bodyUnread: {
      color: colors.textPrimary,
      fontFamily: FontFamily.medium,
    },
  });
}
