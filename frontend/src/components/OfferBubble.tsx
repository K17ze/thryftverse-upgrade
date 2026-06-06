import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/colors';
import { Space, Radius, Type } from '../theme/designTokens';
import { CachedImage } from './CachedImage';
import { AppButton } from './ui/AppButton';
import { ChatCard } from './chat/ChatCard';
import { Caption, BodyEmphasis, Meta } from './ui/Text';
import { Typography } from '../constants/typography';
import { AnimatedPressable } from './AnimatedPressable';

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
  const getTypeConfig = () => {
    switch (type) {
      case 'offer':
        return {
          icon: 'pricetag',
          color: Colors.brand,
          label: 'Offer',
          bgColor: `${Colors.brand}15`,
        };
      case 'counter':
        return {
          icon: 'swap-horizontal',
          color: Colors.textSecondary,
          label: 'Counter Offer',
          bgColor: Colors.surfaceAlt,
        };
      case 'accept':
        return {
          icon: 'checkmark-circle',
          color: Colors.success,
          label: 'Accepted',
          bgColor: `${Colors.success}15`,
        };
      case 'decline':
        return {
          icon: 'close-circle',
          color: Colors.danger,
          label: 'Declined',
          bgColor: `${Colors.danger}15`,
        };
      case 'expired':
        return {
          icon: 'time',
          color: Colors.textMuted,
          label: 'Expired',
          bgColor: Colors.border,
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
        <Ionicons name={typeConfig.icon as any} size={18} color={typeConfig.color} />
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
                <Caption color={Colors.textMuted} style={styles.originalPrice}>
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
              <Caption color={Colors.textInverse} style={styles.discountText}>-{discountPercent}%</Caption>
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
                  ? Colors.success
                  : status === 'declined'
                  ? Colors.danger
                  : Colors.textMuted
              }
            />
            <Caption
              color={
                status === 'accepted'
                  ? Colors.success
                  : status === 'declined'
                  ? Colors.danger
                  : Colors.textMuted
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
        <Caption color={Colors.textMuted}>{timestamp}</Caption>
        {senderName && (
          <Caption color={Colors.textMuted}> \u00b7 {senderName}</Caption>
        )}
      </View>
    </ChatCard>
  );
}

const styles = StyleSheet.create({
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
    paddingHorizontal: Space.sm + 4,
    paddingVertical: Space.sm,
  },
  typeLabel: {
    fontFamily: Typography.family.semibold,
  },
  content: {
    padding: Space.sm + 4,
    paddingTop: Space.sm,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm + 2,
    backgroundColor: `${Colors.textPrimary}08`,
    padding: Space.sm,
    borderRadius: Radius.md,
    marginBottom: Space.sm + 4,
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
    fontSize: Type.priceLarge.size,
    fontFamily: Typography.family.bold,
    color: Colors.textPrimary,
    letterSpacing: -1,
  },
  discountBadge: {
    backgroundColor: Colors.success,
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
    marginTop: Space.sm + 4,
  },
  actionButton: {
    flex: 1,
    height: 38,
    borderRadius: Radius.md,
  },
  declineButton: {
    backgroundColor: Colors.surfaceAlt,
  },
  counterButton: {
    backgroundColor: Colors.surfaceAlt,
  },
  acceptButton: {
    backgroundColor: Colors.brand,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Space.sm + 4,
    paddingVertical: Space.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
});

