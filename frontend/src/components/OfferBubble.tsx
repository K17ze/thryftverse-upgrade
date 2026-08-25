import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { CachedImage } from './CachedImage';
import { AppButton } from './ui/AppButton';
import { ChatCard } from './chat/ChatCard';
import { Caption, BodyEmphasis, Meta } from './ui/Text';
import { AnimatedPressable } from './AnimatedPressable';

import { Space, Radius, Type, Typography } from '../theme/designTokens';
export type OfferType = 'offer' | 'counter' | 'accept' | 'decline' | 'expired';

interface OfferBubbleProps {
  type: OfferType;
  amount: number;
  originalPrice?: number;
  currency?: string;
  itemName?: string;
  itemImage?: string;
  senderName?: string;
  isMe?: boolean;
  timestamp: string;
  status?: 'pending' | 'accepted' | 'declined' | 'expired';
  onAccept?: () => void;
  onDecline?: () => void;
  onCounter?: () => void;
  onViewItem?: () => void;
  style?: ViewStyle;
}

export function OfferBubble({
  type,
  amount,
  originalPrice,
  currency = '$',
  itemName,
  itemImage,
  senderName,
  isMe = false,
  timestamp,
  status = 'pending',
  onAccept,
  onDecline,
  onCounter,
  onViewItem,
  style,
}: OfferBubbleProps) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  const getTypeConfig = (): { icon: React.ComponentProps<typeof Ionicons>['name']; color: string; label: string; bgColor: string } => {
    switch (type) {
      case 'offer':
        return {
          icon: 'pricetag',
          color: colors.brand,
          label: 'Offer',
          bgColor: `${colors.brand}15`,
        };
      case 'counter':
        return {
          icon: 'swap-horizontal',
          color: colors.textSecondary,
          label: 'Counter Offer',
          bgColor: colors.surfaceAlt,
        };
      case 'accept':
        return {
          icon: 'checkmark-circle',
          color: colors.success,
          label: 'Accepted',
          bgColor: `${colors.success}15`,
        };
      case 'decline':
        return {
          icon: 'close-circle',
          color: colors.danger,
          label: 'Declined',
          bgColor: `${colors.danger}15`,
        };
      case 'expired':
        return {
          icon: 'time',
          color: colors.textMuted,
          label: 'Expired',
          bgColor: colors.border,
        };
    }
  };

  const typeConfig = getTypeConfig();
  const discountPercent = originalPrice
    ? Math.round(((originalPrice - amount) / originalPrice) * 100)
    : 0;

  const showActions = type === 'offer' && status === 'pending' && !isMe;

  return (
    <ChatCard
      variant={isMe ? 'tint' : 'surface'}
      style={[styles.container, isMe && styles.containerMe, style]}
    >
      {/* Header */}
      <View style={[styles.header, { backgroundColor: typeConfig.bgColor }]}>
        <Ionicons name={typeConfig.icon} size={18} color={typeConfig.color} />
        <Caption color={typeConfig.color} style={styles.typeLabel}>
          {typeConfig.label}
        </Caption>
      </View>

      {/* Content */}
      <View style={styles.content}>
        {/* Item Preview */}
        {itemName && (
          <AnimatedPressable
            style={styles.itemRow}
            onPress={onViewItem}
            accessibilityRole="button"
            accessibilityLabel={`View ${itemName}`}
            activeOpacity={0.7}
            scaleValue={0.98}
            hapticFeedback="light"
          >
            {itemImage && (
              <CachedImage uri={itemImage} style={styles.itemImage} contentFit="cover" />
            )}
            <View style={styles.itemInfo}>
              <BodyEmphasis numberOfLines={1}>{itemName}</BodyEmphasis>
              {originalPrice && (
                <Caption color={colors.textMuted} style={styles.originalPrice}>
                  Listed: {currency}{originalPrice.toLocaleString()}
                </Caption>
              )}
            </View>
          </AnimatedPressable>
        )}

        {/* Offer Amount */}
        <View style={styles.amountRow}>
          <Text style={styles.amount}>
            {currency}{amount.toLocaleString()}
          </Text>
          {discountPercent > 0 && type === 'offer' && (
            <View style={styles.discountBadge}>
              <Caption color={colors.textInverse} style={styles.discountText}>-{discountPercent}%</Caption>
            </View>
          )}
        </View>

        {/* Status */}
        {status !== 'pending' && (
          <View style={styles.statusRow}>
            <Ionicons
              name={
                status === 'accepted'
                  ? 'checkmark-circle'
                  : status === 'declined'
                  ? 'close-circle'
                  : 'time'
              }
              size={16}
              color={
                status === 'accepted'
                  ? colors.success
                  : status === 'declined'
                  ? colors.danger
                  : colors.textMuted
              }
            />
            <Caption
              color={
                status === 'accepted'
                  ? colors.success
                  : status === 'declined'
                  ? colors.danger
                  : colors.textMuted
              }
              style={styles.statusText}
            >
              {status === 'accepted'
                ? 'This offer was accepted'
                : status === 'declined'
                ? 'This offer was declined'
                : 'This offer has expired'}
            </Caption>
          </View>
        )}

        {/* Action Buttons */}
        {showActions && (
          <View style={styles.actions}>
            <AppButton
              style={[styles.actionButton, styles.declineButton]}
              variant="secondary"
              size="sm"
              title="Decline"
              onPress={onDecline}
              accessibilityLabel="Decline offer"
              accessibilityRole="button"
            />
            <AppButton
              style={[styles.actionButton, styles.counterButton]}
              variant="secondary"
              size="sm"
              title="Counter"
              onPress={onCounter}
              accessibilityLabel="Counter offer"
              accessibilityRole="button"
            />
            <AppButton
              style={[styles.actionButton, styles.acceptButton]}
              variant="primary"
              size="sm"
              title="Accept"
              onPress={onAccept}
              accessibilityLabel="Accept offer"
              accessibilityRole="button"
            />
          </View>
        )}
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        <Caption color={colors.textMuted}>{timestamp}</Caption>
        {senderName && (
          <Caption color={colors.textMuted}> \u00b7 {senderName}</Caption>
        )}
      </View>
    </ChatCard>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      maxWidth: 300,
      borderRadius: Radius.xl,
      overflow: 'hidden',
      marginVertical: Space.xs,
    },
    containerMe: {
      alignSelf: 'flex-end',
      borderBottomRightRadius: Space.xs,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: Space.smMd,
      paddingVertical: Space.sm,
    },
    typeLabel: {
      fontFamily: Typography.family.semibold,
    },
    content: {
      padding: Space.smMd,
      paddingTop: Space.sm,
    },
    itemRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm + 2,
      backgroundColor: `${colors.textPrimary}08`,
      padding: Space.sm,
      borderRadius: Radius.md,
      marginBottom: Space.smMd,
    },
    itemImage: {
      width: 40,
      height: 40,
      borderRadius: Radius.sm,
    },
    itemInfo: {
      flex: 1,
    },
    originalPrice: {
      textDecorationLine: 'line-through',
    },
    amountRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm + 2,
      marginBottom: Space.xs + 4,
    },
    amount: {
      fontSize: Type.priceHero.size,
      fontFamily: Typography.family.bold,
      color: colors.textPrimary,
      letterSpacing: -1,
    },
    discountBadge: {
      backgroundColor: colors.success,
      paddingHorizontal: Space.sm,
      paddingVertical: Space.xs,
      borderRadius: Radius.full,
    },
    discountText: {
      fontFamily: Typography.family.bold,
    },
    statusRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginBottom: Space.xs + 4,
    },
    statusText: {
      fontFamily: Typography.family.medium,
    },
    actions: {
      flexDirection: 'row',
      gap: Space.sm + 2,
      marginTop: Space.smMd,
    },
    actionButton: {
      flex: 1,
      height: 38,
      borderRadius: Radius.md,
    },
    declineButton: {
      backgroundColor: colors.surfaceAlt,
    },
    counterButton: {
      backgroundColor: colors.surfaceAlt,
    },
    acceptButton: {
      backgroundColor: colors.brand,
    },
    footer: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: Space.smMd,
      paddingVertical: Space.sm,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
  });
}
