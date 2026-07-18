import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import { Space, Radius } from '../../theme/designTokens';
import { AnimatedPressable } from '../AnimatedPressable';
import { CachedImage } from '../CachedImage';
import { AppStatusPill } from '../ui/AppStatusPill';
import { Meta, BodyEmphasis, Body } from '../ui/Text';

export type OrderSide = 'buy' | 'sell';
// Use the canonical OrderStatus from coOwnModels (12-state machine per spec 10 §2.1-2.2)
export type OrderStatus = import('../../data/coOwnModels').OrderStatus;

const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  submitted: 'Submitted',
  accepted: 'Accepted',
  open: 'Open',
  partial: 'Partial',
  filled: 'Filled',
  cancel_pending: 'Cancelling',
  cancelled: 'Cancelled',
  replace_pending: 'Replacing',
  halted_open: 'Halted',
  expired: 'Expired',
  rejected: 'Rejected',
  // Legacy compat — map old status to display label
  partially_filled: 'Partial',
};

function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status;
}

interface OrderHistoryRowProps {
  id: string;
  side: OrderSide;
  type: 'market' | 'limit';
  assetTitle: string;
  quantity: number;
  pricePerShare: string;
  totalAmount: string;
  fee?: string;
  status: OrderStatus;
  timestamp: string;
  onPress?: () => void;
  issuerHandle?: string;
  issuerAvatar?: string;
  canMessageIssuer?: boolean;
  onPressIssuer?: () => void;
  onMessageIssuer?: () => void;
}

function resolveSideIcon(side: OrderSide): keyof typeof Ionicons.glyphMap {
  return side === 'buy' ? 'wallet-outline' : 'cash-outline';
}

function resolveSideColor(side: OrderSide): string {
  return side === 'buy' ? Colors.brand : Colors.textSecondary;
}

function resolveStatusTone(status: string) {
  switch (status) {
    case 'filled':
      return 'positive' as const;
    case 'open':
    case 'accepted':
    case 'submitted':
      return 'warning' as const;
    case 'partial':
    case 'partially_filled':
    case 'replace_pending':
      return 'accent' as const;
    case 'cancel_pending':
    case 'halted_open':
      return 'warning' as const;
    case 'cancelled':
    case 'expired':
    case 'draft':
      return 'neutral' as const;
    case 'rejected':
      return 'negative' as const;
    default:
      return 'neutral' as const;
  }
}

export function OrderHistoryRow({
  side,
  type,
  assetTitle,
  quantity,
  pricePerShare,
  totalAmount,
  status,
  timestamp,
  onPress,
  issuerHandle,
  issuerAvatar,
  canMessageIssuer = false,
  onPressIssuer,
  onMessageIssuer,
}: OrderHistoryRowProps) {
  return (
    <AnimatedPressable
      style={styles.container}
      onPress={onPress}
      activeOpacity={0.92}
      disableAnimation={false}
      scaleValue={0.985}
      accessibilityRole="button"
      accessibilityLabel={`${side} ${quantity} units of ${assetTitle}`}
    >
      <View
        style={[
          styles.iconWrap,
          { borderColor: resolveSideColor(side) + '40', backgroundColor: resolveSideColor(side) + '12' },
        ]}
      >
        <Ionicons
          name={resolveSideIcon(side)}
          size={16}
          color={resolveSideColor(side)}
        />
      </View>

      <View style={styles.body}>
        <View style={styles.topRow}>
          <BodyEmphasis style={styles.title} numberOfLines={1}>
            {assetTitle}
          </BodyEmphasis>
          <AppStatusPill tone={resolveStatusTone(status)} label={statusLabel(status)} size="sm" />
        </View>

        <View style={styles.metaRow}>
          <Meta style={styles.metaLabel} numberOfLines={1}>
            {side.toUpperCase()}  {type}  {quantity} units
          </Meta>
          <Meta style={styles.timestamp} numberOfLines={1}>{timestamp}</Meta>
        </View>

        <View style={styles.priceRow}>
          <Body style={styles.price} numberOfLines={1}>{pricePerShare} / share</Body>
          <BodyEmphasis style={styles.total} numberOfLines={1}>{totalAmount}</BodyEmphasis>
        </View>

        {issuerHandle && onPressIssuer && (
          <View style={styles.issuerRow}>
            <AnimatedPressable
              style={styles.issuerChip}
              onPress={onPressIssuer}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={`Open @${issuerHandle} profile`}
              accessibilityHint="Shows issuer profile details"
            >
              {issuerAvatar ? (
                <CachedImage uri={issuerAvatar} style={styles.issuerAvatar} containerStyle={styles.issuerAvatarWrap} contentFit="cover" />
              ) : (
                <View style={styles.issuerAvatarPlaceholder}>
                  <Ionicons name="person-outline" size={12} color={Colors.textMuted} />
                </View>
              )}
              <Meta style={styles.issuerText} numberOfLines={1}>@{issuerHandle}</Meta>
            </AnimatedPressable>
            {onMessageIssuer && (
              <AnimatedPressable
                style={[styles.messageBtn, !canMessageIssuer && styles.messageBtnDisabled]}
                onPress={onMessageIssuer}
                disabled={!canMessageIssuer}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel={canMessageIssuer ? `Message @${issuerHandle}` : 'Issuer is you'}
                accessibilityHint={canMessageIssuer ? 'Opens chat with issuer' : 'Messaging yourself is disabled'}
              >
                <Ionicons name={canMessageIssuer ? 'chatbubble-ellipses-outline' : 'checkmark'} size={12} color={Colors.textPrimary} />
              </AnimatedPressable>
            )}
          </View>
        )}
      </View>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm + 4,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: Radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Space.sm,
    marginTop: 2,
  },
  body: {
    flex: 1,
    minWidth: 0,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
    gap: Space.sm,
  },
  title: {
    flex: 1,
    minWidth: 0,
    flexShrink: 1,
    marginRight: Space.sm,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
    gap: Space.sm,
  },
  metaLabel: {
    flexShrink: 1,
    minWidth: 0,
  },
  timestamp: {
    textTransform: 'lowercase',
    flexShrink: 0,
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Space.sm,
  },
  price: {
    color: Colors.textSecondary,
    flexShrink: 1,
    minWidth: 0,
  },
  total: {
    fontVariant: ['tabular-nums'],
    flexShrink: 0,
  },
  issuerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Space.sm,
    paddingTop: Space.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  issuerChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  issuerAvatarWrap: {
    width: 20,
    height: 20,
    borderRadius: Radius.full,
    overflow: 'hidden',
  },
  issuerAvatar: {
    width: 20,
    height: 20,
    borderRadius: Radius.full,
  },
  issuerAvatarPlaceholder: {
    width: 20,
    height: 20,
    borderRadius: Radius.full,
    backgroundColor: Colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  issuerText: {
    color: Colors.textSecondary,
  },
  messageBtn: {
    width: 28,
    height: 28,
    borderRadius: Radius.full,
    backgroundColor: Colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  messageBtnDisabled: {
    opacity: 0.5,
  },
});