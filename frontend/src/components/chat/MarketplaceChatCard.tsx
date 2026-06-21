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
  formattedPrice?: string;
  formattedOriginalPrice?: string;
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
  formattedPrice,
  formattedOriginalPrice,
  onAccept,
  onDecline,
  onViewListing,
}: MarketplaceChatCardProps) {
  if (type === 'offer' && offer) {
    const status = offer.status;
    const priceLabel = formattedPrice ?? `£${offer.price.toFixed(2)}`;
    const origLabel = formattedOriginalPrice ?? `£${offer.originalPrice.toFixed(2)}`;
    return (
      <View style={[styles.offerBlock, isMe && styles.offerBlockMe]}>
        {senderLabel && !isMe ? (
          <Text style={styles.offerSender}>{senderLabel}</Text>
        ) : null}
        <View style={styles.offerPriceRow}>
          <Ionicons name="pricetag-outline" size={14} color={Colors.textMuted} />
          <Text style={styles.offerPrice}>{priceLabel}</Text>
          <Text style={styles.offerStrike}>{origLabel}</Text>
        </View>
        {status === 'declined' && (
          <View style={styles.offerStatusRow}>
            <Ionicons name="close-circle-outline" size={12} color={Colors.danger} />
            <Text style={[styles.offerStatusText, { color: Colors.danger }]}>Declined</Text>
          </View>
        )}
        {status === 'accepted' && (
          <View style={styles.offerStatusRow}>
            <Ionicons name="checkmark-circle-outline" size={12} color={Colors.success} />
            <Text style={[styles.offerStatusText, { color: Colors.success }]}>Accepted</Text>
          </View>
        )}
        {!status && isMe && (
          <View style={styles.offerStatusRow}>
            <Ionicons name="time-outline" size={12} color={Colors.textMuted} />
            <Text style={[styles.offerStatusText, { color: Colors.textMuted }]}>Waiting for response</Text>
          </View>
        )}
        {!isMe && !status && (
          <View style={styles.offerActions}>
            <AnimatedPressable style={styles.offerPass} onPress={onDecline} activeOpacity={0.85} scaleValue={0.96} hapticFeedback="light">
              <Text style={styles.offerPassText}>Pass</Text>
            </AnimatedPressable>
            <AnimatedPressable style={styles.offerAccept} onPress={onAccept} activeOpacity={0.85} scaleValue={0.96} hapticFeedback="medium">
              <Text style={styles.offerAcceptText}>Accept</Text>
            </AnimatedPressable>
          </View>
        )}
      </View>
    );
  }

  if (type === 'purchase_status' && text) {
    const lines = text.split('\n');
    return (
      <View style={styles.statusInline}>
        <Text style={styles.statusInlineTitle}>{lines[0]}</Text>
        <Text style={styles.statusInlineBody}>{lines.slice(1).join('\n')}</Text>
      </View>
    );
  }

  if (type === 'safety_notice' && text) {
    return (
      <View style={styles.noticeInline}>
        <Ionicons name="shield-checkmark-outline" size={14} color={Colors.textMuted} />
        <Text style={styles.noticeInlineText}>{text}</Text>
      </View>
    );
  }

  return null;
}

function StatusBadge({ tone, label, icon }: { tone: 'positive' | 'negative' | 'neutral'; label: string; icon: string }) {
  const colors = {
    positive: { text: Colors.success },
    negative: { text: Colors.danger },
    neutral: { text: Colors.textMuted },
  };
  const c = colors[tone];
  return (
    <View style={styles.offerStatusRow}>
      <Ionicons name={icon as any} size={12} color={c.text} />
      <Text style={[styles.offerStatusText, { color: c.text }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  offerBlock: {
    maxWidth: '80%',
    gap: Space.xs,
    backgroundColor: Colors.surfaceAlt,
    borderRadius: Radius.md,
    padding: Space.sm,
  },
  offerBlockMe: {
    alignSelf: 'flex-end',
    backgroundColor: Colors.surfaceAlt,
  },
  offerSender: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.semibold,
    color: Colors.textMuted,
  },
  offerPriceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
  },
  offerPrice: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.bold,
    color: Colors.textPrimary,
  },
  offerStrike: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
    textDecorationLine: 'line-through',
  },
  offerStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  offerStatusText: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.semibold,
  },
  offerActions: {
    flexDirection: 'row',
    gap: Space.sm,
    marginTop: 2,
  },
  offerPass: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: Radius.sm,
    backgroundColor: Colors.surface,
  },
  offerPassText: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.semibold,
    color: Colors.textPrimary,
  },
  offerAccept: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: Radius.sm,
    backgroundColor: Colors.textPrimary,
  },
  offerAcceptText: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.semibold,
    color: Colors.textInverse,
  },
  statusInline: {
    alignSelf: 'center',
    maxWidth: '85%',
    alignItems: 'center',
    gap: 2,
    paddingVertical: Space.xs,
    paddingHorizontal: Space.md,
  },
  statusInlineTitle: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.semibold,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  statusInlineBody: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
    textAlign: 'center',
  },
  noticeInline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    alignSelf: 'center',
    maxWidth: '85%',
    paddingVertical: Space.xs,
    paddingHorizontal: Space.md,
  },
  noticeInlineText: {
    flex: 1,
    fontSize: Type.meta.size,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
  },
});