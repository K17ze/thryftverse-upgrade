import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/colors';

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
          color: '#FF9800',
          label: 'Counter Offer',
          bgColor: '#FF980015',
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
    <View style={[styles.container, isMe ? styles.containerMe : styles.containerThem, style]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: typeConfig.bgColor }]}>
        <Ionicons name={typeConfig.icon as any} size={18} color={typeConfig.color} />
        <Text style={[styles.typeLabel, { color: typeConfig.color }]}>
          {typeConfig.label}
        </Text>
      </View>

      {/* Content */}
      <View style={styles.content}>
        {/* Item Preview */}
        {itemName && (
          <TouchableOpacity style={styles.itemRow} onPress={onViewItem}>
            {itemImage && (
              <Image source={{ uri: itemImage }} style={styles.itemImage} />
            )}
            <View style={styles.itemInfo}>
              <Text style={styles.itemName} numberOfLines={1}>
                {itemName}
              </Text>
              {originalPrice && (
                <Text style={styles.originalPrice}>
                  Listed: {currency}{originalPrice.toLocaleString()}
                </Text>
              )}
            </View>
          </TouchableOpacity>
        )}

        {/* Offer Amount */}
        <View style={styles.amountRow}>
          <Text style={styles.amount}>
            {currency}{amount.toLocaleString()}
          </Text>
          {discountPercent > 0 && type === 'offer' && (
            <View style={styles.discountBadge}>
              <Text style={styles.discountText}>-{discountPercent}%</Text>
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
            <Text
              style={[
                styles.statusText,
                {
                  color:
                    status === 'accepted'
                      ? Colors.success
                      : status === 'declined'
                      ? Colors.danger
                      : Colors.textMuted,
                },
              ]}
            >
              {status === 'accepted'
                ? 'This offer was accepted'
                : status === 'declined'
                ? 'This offer was declined'
                : 'This offer has expired'}
            </Text>
          </View>
        )}

        {/* Action Buttons */}
        {showActions && (
          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.actionButton, styles.declineButton]}
              onPress={onDecline}
            >
              <Text style={styles.declineText}>Decline</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionButton, styles.counterButton]}
              onPress={onCounter}
            >
              <Text style={styles.counterText}>Counter</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionButton, styles.acceptButton]}
              onPress={onAccept}
            >
              <Text style={styles.acceptText}>Accept</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        <Text style={styles.timestamp}>{timestamp}</Text>
        {senderName && (
          <Text style={styles.senderName}>• {senderName}</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    maxWidth: 300,
    borderRadius: 16,
    overflow: 'hidden',
    marginVertical: 4,
  },
  containerMe: {
    backgroundColor: Colors.brand,
    alignSelf: 'flex-end',
    borderBottomRightRadius: 4,
  },
  containerThem: {
    backgroundColor: Colors.surface,
    alignSelf: 'flex-start',
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  typeLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  content: {
    padding: 12,
    paddingTop: 8,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    padding: 8,
    borderRadius: 8,
    marginBottom: 12,
  },
  itemImage: {
    width: 40,
    height: 40,
    borderRadius: 6,
  },
  itemInfo: {
    flex: 1,
  },
  itemName: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textPrimary,
    marginBottom: 2,
  },
  originalPrice: {
    fontSize: 12,
    color: Colors.textMuted,
    textDecorationLine: 'line-through',
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  amount: {
    fontSize: 24,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  discountBadge: {
    backgroundColor: Colors.success,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  discountText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
  },
  statusText: {
    fontSize: 13,
    fontWeight: '500',
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  actionButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  declineButton: {
    backgroundColor: Colors.background,
  },
  declineText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  counterButton: {
    backgroundColor: `${Colors.brand}20`,
  },
  counterText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.brand,
  },
  acceptButton: {
    backgroundColor: Colors.success,
  },
  acceptText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  footer: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingBottom: 8,
    paddingTop: 4,
    opacity: 0.7,
  },
  timestamp: {
    fontSize: 11,
    color: Colors.textMuted,
  },
  senderName: {
    fontSize: 11,
    color: Colors.textMuted,
  },
});
