import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import { Space, Radius, Type , Typography  } from '../../theme/designTokens';
import { AnimatedPressable } from '../AnimatedPressable';

interface OfferData {
  price: number;
  originalPrice: number;
  status?: 'pending' | 'declined' | 'countered' | 'accepted';
}

interface MarketplaceChatCardProps {
  type: 'offer' | 'purchase_status' | 'listing_share' | 'safety_notice';
  isMe?: boolean;
  senderLabel?: string;
  offer?: OfferData;
  text?: string;
  onAccept?: () => void;
  onDecline?: () => void;
  onViewListing?: () => void;
}

export function MarketplaceChatCard({
  type,
  isMe = false,
  senderLabel,
  offer,
  text,
  onAccept,
  onDecline,
  onViewListing,
}: MarketplaceChatCardProps) {
  if (type === 'offer' && offer) {
    const status = offer.status;
    return (
      <View style={[styles.card, isMe && styles.cardMe]}>
        {senderLabel && !isMe ? (
          <Text style={styles.senderName}>{senderLabel}</Text>
        ) : null}
        <View style={styles.priceRow}>
          <Text style={styles.priceText}>£{offer.price.toFixed(2)}</Text>
          <Text style={styles.strikeText}>£{offer.originalPrice.toFixed(2)}</Text>
        </View>
        {status === 'declined' && <StatusBadge tone="negative" label="Declined" icon="close-circle-outline" />}
        {status === 'accepted' && <StatusBadge tone="positive" label="Accepted" icon="checkmark-circle-outline" />}
        {!status && isMe && <StatusBadge tone="neutral" label="Waiting" icon="time-outline" />}
        {!isMe && !status && (
          <View style={styles.actions}>
            <AnimatedPressable style={styles.passBtn} onPress={onDecline} activeOpacity={0.85} scaleValue={0.96} hapticFeedback="light">
              <Ionicons name="close-outline" size={14} color={Colors.textPrimary} />
              <Text style={styles.passText}>Pass</Text>
            </AnimatedPressable>
            <AnimatedPressable style={styles.acceptBtn} onPress={onAccept} activeOpacity={0.85} scaleValue={0.96} hapticFeedback="medium">
              <Ionicons name="flash-outline" size={14} color={Colors.textInverse} />
              <Text style={styles.acceptText}>Accept</Text>
            </AnimatedPressable>
          </View>
        )}
      </View>
    );
  }

  if (type === 'purchase_status' && text) {
    const lines = text.split('\n');
    return (
      <View style={[styles.card, styles.statusCard]}>
        <Text style={styles.statusTitle}>{lines[0]}</Text>
        <Text style={styles.statusBody}>{lines.slice(1).join('\n')}</Text>
      </View>
    );
  }

  if (type === 'safety_notice' && text) {
    return (
      <View style={[styles.card, styles.noticeCard]}>
        <Ionicons name="shield-checkmark-outline" size={18} color={Colors.success} />
        <Text style={styles.noticeText}>{text}</Text>
      </View>
    );
  }

  return null;
}

function StatusBadge({ tone, label, icon }: { tone: 'positive' | 'negative' | 'neutral'; label: string; icon: string }) {
  const colors = {
    positive: { bg: `${Colors.success}15`, text: Colors.success },
    negative: { bg: `${Colors.danger}15`, text: Colors.danger },
    neutral: { bg: Colors.surfaceAlt, text: Colors.textMuted },
  };
  const c = colors[tone];
  return (
    <View style={[styles.badge, { backgroundColor: c.bg }]}>
      <Ionicons name={icon as any} size={12} color={c.text} />
      <Text style={[styles.badgeText, { color: c.text }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    maxWidth: '72%',
    backgroundColor: Colors.surfaceAlt,
    borderRadius: Radius.lg,
    padding: Space.md,
    gap: Space.xs,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
  },
  cardMe: {
    alignSelf: 'flex-end',
  },
  senderName: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.semibold,
    color: Colors.brand,
    marginBottom: 2,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Space.sm,
  },
  priceText: {
    fontSize: Type.price.size,
    fontFamily: Typography.family.bold,
    color: Colors.textPrimary,
  },
  strikeText: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
    textDecorationLine: 'line-through',
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: Radius.md,
    marginTop: 2,
  },
  badgeText: {
    fontSize: 11,
    fontFamily: Typography.family.semibold,
  },
  actions: {
    flexDirection: 'row',
    gap: Space.sm,
    marginTop: 4,
  },
  passBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: Radius.md,
    backgroundColor: Colors.surfaceAlt,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
  },
  passText: {
    fontSize: 12,
    fontFamily: Typography.family.semibold,
    color: Colors.textPrimary,
  },
  acceptBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: Radius.md,
    backgroundColor: Colors.brand,
  },
  acceptText: {
    fontSize: 12,
    fontFamily: Typography.family.semibold,
    color: Colors.textInverse,
  },
  statusCard: {
    alignSelf: 'center',
    maxWidth: '90%',
    backgroundColor: Colors.surface,
  },
  statusTitle: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.bold,
    color: Colors.textPrimary,
  },
  statusBody: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    color: Colors.textSecondary,
    lineHeight: Type.caption.lineHeight,
  },
  statusLink: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.semibold,
    color: Colors.brand,
    marginTop: Space.sm,
  },
  noticeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    alignSelf: 'center',
    maxWidth: '90%',
    backgroundColor: `${Colors.success}08`,
    borderColor: `${Colors.success}25`,
  },
  noticeText: {
    flex: 1,
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    color: Colors.textSecondary,
    lineHeight: Type.caption.lineHeight,
  },
});