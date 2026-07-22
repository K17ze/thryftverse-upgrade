import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import { Space, Radius, Type , Typography  } from '../../theme/designTokens';
import { AnimatedPressable } from '../AnimatedPressable';
import { CommerceStateCard, CommerceStateType } from './CommerceStateCard';

interface OfferData {
  price: number;
  originalPrice: number;
  status?: 'pending' | 'declined' | 'countered' | 'accepted' | 'expired';
  /** ISO date string when the offer expires */
  expiresAt?: string;
  /** Counter-offer chain depth (0 = initial offer, 1 = first counter, etc.) */
  counterRound?: number;
}

interface MarketplaceChatCardProps {
  type: 'offer' | 'purchase_status' | 'listing_share' | 'safety_notice' | 'system' | 'commerce_state';
  isMe?: boolean;
  senderLabel?: string;
  offer?: OfferData;
  text?: string;
  systemTitle?: string;
  systemVerified?: boolean;
  formattedPrice?: string;
  formattedOriginalPrice?: string;
  commerceState?: {
    type: CommerceStateType;
    orderId: string;
    orderShortId?: string;
    itemTitle?: string;
    itemImage?: string | null;
    trackingNumber?: string | null;
    carrier?: string | null;
  };
  onAccept?: () => void;
  onDecline?: () => void;
  onCounter?: () => void;
  onViewListing?: () => void;
  onViewOrder?: () => void;
  /** Called when the offer countdown reaches zero */
  onExpire?: () => void;
}

/**
 * Formats a remaining time delta into a compact countdown string.
 * "23h 14m" for >1h, "14m 32s" for <1h, "expired" for <=0.
 */
function formatCountdown(msRemaining: number): string {
  if (msRemaining <= 0) return 'expired';
  const totalSeconds = Math.floor(msRemaining / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

function getExpiryTone(msRemaining: number): { color: string; icon: keyof typeof Ionicons.glyphMap } {
  if (msRemaining <= 0) return { color: Colors.textMuted, icon: 'time-outline' };
  if (msRemaining <= 60 * 60 * 1000) return { color: Colors.danger, icon: 'timer-outline' };
  if (msRemaining <= 12 * 60 * 60 * 1000) return { color: Colors.warning, icon: 'timer-outline' };
  return { color: Colors.textSecondary, icon: 'time-outline' };
}

/**
 * Live countdown hook — ticks every second, returns ms remaining.
 * Calls onExpire exactly once when the countdown hits zero.
 */
function useOfferCountdown(expiresAt: string | undefined, onExpire?: () => void): number {
  const [msRemaining, setMsRemaining] = useState(() => {
    if (!expiresAt) return Infinity;
    return Math.max(0, new Date(expiresAt).getTime() - Date.now());
  });

  useEffect(() => {
    if (!expiresAt) return;
    const target = new Date(expiresAt).getTime();
    const tick = () => {
      const remaining = Math.max(0, target - Date.now());
      setMsRemaining(remaining);
      if (remaining <= 0) {
        onExpire?.();
      }
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [expiresAt, onExpire]);

  return msRemaining;
}

export function MarketplaceChatCard({
  type,
  isMe = false,
  senderLabel,
  offer,
  text,
  systemTitle,
  systemVerified = false,
  formattedPrice,
  formattedOriginalPrice,
  commerceState,
  onAccept,
  onDecline,
  onCounter,
  onViewListing,
  onViewOrder,
  onExpire,
}: MarketplaceChatCardProps) {
  // Stable callback so the countdown hook doesn't re-run every render
  const handleExpire = useCallback(() => {
    onExpire?.();
  }, [onExpire]);

  const msRemaining = useOfferCountdown(offer?.expiresAt, offer?.status === 'pending' ? handleExpire : undefined);
  const isExpired = offer?.expiresAt ? msRemaining <= 0 : false;
  const effectiveStatus = isExpired && offer?.status === 'pending' ? 'expired' : offer?.status;

  if (type === 'offer' && offer) {
    const status = effectiveStatus;
    const priceLabel = formattedPrice ?? `£${offer.price.toFixed(2)}`;
    const origLabel = formattedOriginalPrice ?? `£${offer.originalPrice.toFixed(2)}`;
    const showCountdown = offer.expiresAt && (status === 'pending' || status === 'countered');
    const tone = getExpiryTone(msRemaining);
    const counterRoundLabel = offer.counterRound && offer.counterRound > 0
      ? `Counter #${offer.counterRound}`
      : null;
    const discountPct = offer.originalPrice > offer.price
      ? Math.round(((offer.originalPrice - offer.price) / offer.originalPrice) * 100)
      : 0;
    return (
      <View style={[styles.offerBlock, isMe && styles.offerBlockMe]}>
        {senderLabel && !isMe ? (
          <Text style={styles.offerSender}>{senderLabel}</Text>
        ) : null}
        {counterRoundLabel && (
          <View style={styles.counterRoundRow}>
            <Ionicons name="swap-horizontal" size={11} color={Colors.textMuted} />
            <Text style={styles.counterRoundText}>{counterRoundLabel}</Text>
          </View>
        )}
        <View style={styles.offerPriceRow}>
          <View style={styles.offerPriceIdentity}>
            <Ionicons name="pricetag-outline" size={15} color={Colors.textMuted} />
            <Text style={styles.offerPrice} numberOfLines={1}>{priceLabel}</Text>
            <Text style={styles.offerStrike} numberOfLines={1}>{origLabel}</Text>
          </View>
          {discountPct >= 5 ? (
            <View style={styles.offerDiscountBadge}>
              <Text style={styles.offerDiscountText}>-{discountPct}%</Text>
            </View>
          ) : null}
        </View>
        {/* Expiry countdown — live timer */}
        {showCountdown ? (
          <View style={[styles.offerExpiryRow, { backgroundColor: `${tone.color}12` }]}>
            <Ionicons name={tone.icon} size={11} color={tone.color} />
            <Text style={[styles.offerExpiryText, { color: tone.color }]}>
              Expires in {formatCountdown(msRemaining)}
            </Text>
          </View>
        ) : null}
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
        {status === 'expired' && (
          <View style={styles.offerStatusRow}>
            <Ionicons name="time-outline" size={12} color={Colors.textMuted} />
            <Text style={[styles.offerStatusText, { color: Colors.textMuted }]}>Expired</Text>
          </View>
        )}
        {!status && isMe && (
          <View style={styles.offerStatusRow}>
            <Ionicons name="time-outline" size={12} color={Colors.textMuted} />
            <Text style={[styles.offerStatusText, { color: Colors.textMuted }]}>Waiting for response</Text>
          </View>
        )}
        {/* Action buttons — only show when pending and not expired */}
        {!isMe && (status === undefined || status === 'pending') && !isExpired && (
          <View style={styles.offerActions}>
            <AnimatedPressable style={styles.offerPass} onPress={onDecline} activeOpacity={0.85} scaleValue={0.96} hapticFeedback="light" accessibilityRole="button" accessibilityLabel="Decline offer">
              <Text style={styles.offerPassText} numberOfLines={1}>Pass</Text>
            </AnimatedPressable>
            {onCounter && (
              <AnimatedPressable style={styles.offerCounter} onPress={onCounter} activeOpacity={0.85} scaleValue={0.96} hapticFeedback="light" accessibilityRole="button" accessibilityLabel="Counter offer">
                <Text style={styles.offerCounterText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.88}>Counter</Text>
              </AnimatedPressable>
            )}
            <AnimatedPressable style={styles.offerAccept} onPress={onAccept} activeOpacity={0.85} scaleValue={0.96} hapticFeedback="medium" accessibilityRole="button" accessibilityLabel="Accept offer">
              <Text style={styles.offerAcceptText} numberOfLines={1}>Accept</Text>
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
        <View style={styles.statusInlineIcon}>
          <Ionicons name="cube-outline" size={16} color={Colors.textSecondary} />
        </View>
        <View style={styles.statusInlineCopy}>
          <Text style={styles.statusInlineTitle}>{lines[0]}</Text>
          {lines.length > 1 ? <Text style={styles.statusInlineBody}>{lines.slice(1).join('\n')}</Text> : null}
        </View>
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

  if (type === 'commerce_state' && commerceState) {
    return (
      <CommerceStateCard
        type={commerceState.type}
        orderId={commerceState.orderId}
        orderShortId={commerceState.orderShortId}
        itemTitle={commerceState.itemTitle}
        itemImage={commerceState.itemImage}
        trackingNumber={commerceState.trackingNumber}
        carrier={commerceState.carrier}
        onPress={onViewOrder}
      />
    );
  }

  if (type === 'system') {
    return (
      <View style={styles.systemEvent}>
        <View style={styles.systemEventIcon}>
          <Ionicons name="shield-checkmark-outline" size={16} color={Colors.textSecondary} />
        </View>
        <View style={styles.systemEventCopy}>
          <View style={styles.systemEventHeading}>
            {systemTitle ? <Text style={styles.systemEventTitle}>{systemTitle}</Text> : null}
            {systemVerified ? (
              <View style={styles.verifiedPill} accessibilityLabel="Verified system update">
                <Ionicons name="checkmark" size={10} color={Colors.textSecondary} />
                <Text style={styles.verifiedText}>Verified</Text>
              </View>
            ) : null}
          </View>
          {text ? <Text style={styles.systemEventText}>{text}</Text> : null}
        </View>
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
    width: '86%',
    maxWidth: 340,
    minWidth: 270,
    gap: Space.xs,
    backgroundColor: Colors.surfaceAlt,
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
    padding: Space.sm + 2,
    marginHorizontal: Space.md,
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
    justifyContent: 'space-between',
    gap: Space.sm,
  },
  offerPriceIdentity: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
  },
  offerPrice: {
    fontSize: Type.bodyEmphasis.size,
    fontFamily: Typography.family.bold,
    color: Colors.textPrimary,
  },
  offerStrike: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
    textDecorationLine: 'line-through',
    flexShrink: 1,
  },
  offerDiscountBadge: {
    backgroundColor: `${Colors.success}18`,
    borderRadius: Radius.sm,
    paddingHorizontal: 5,
    paddingVertical: 1,
    marginLeft: 2,
  },
  offerDiscountText: {
    fontSize: 10,
    fontFamily: Typography.family.bold,
    color: Colors.success,
    fontVariant: ['tabular-nums'],
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
  counterRoundRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 2,
  },
  counterRoundText: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.semibold,
    color: Colors.textMuted,
    letterSpacing: 0.3,
  },
  offerExpiryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Space.xs + 2,
    paddingVertical: 4,
    borderRadius: Radius.sm,
    alignSelf: 'flex-start',
  },
  offerExpiryText: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.semibold,
    letterSpacing: 0.2,
  },
  offerActions: {
    flexDirection: 'row',
    gap: Space.xs,
    marginTop: Space.xs,
  },
  offerPass: {
    flex: 1,
    minWidth: 0,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Space.xs,
    borderRadius: Radius.md,
    backgroundColor: Colors.surface,
  },
  offerPassText: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.semibold,
    color: Colors.textPrimary,
  },
  offerCounter: {
    flex: 1,
    minWidth: 0,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 2,
    borderRadius: Radius.md,
    backgroundColor: Colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
  },
  offerCounterText: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.semibold,
    color: Colors.textPrimary,
  },
  offerAccept: {
    flex: 1,
    minWidth: 0,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Space.xs,
    borderRadius: Radius.md,
    backgroundColor: Colors.textPrimary,
  },
  offerAcceptText: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.semibold,
    color: Colors.textInverse,
  },
  statusInline: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: 352,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Space.sm,
    paddingVertical: Space.sm + 2,
    paddingHorizontal: Space.sm + 2,
    backgroundColor: Colors.surfaceAlt,
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
  },
  statusInlineIcon: {
    width: 34,
    height: 34,
    borderRadius: Radius.full,
    backgroundColor: Colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  statusInlineCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  statusInlineTitle: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.semibold,
    color: Colors.textPrimary,
    textAlign: 'left',
  },
  statusInlineBody: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.regular,
    color: Colors.textSecondary,
    textAlign: 'left',
    lineHeight: Type.meta.lineHeight + 2,
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
  systemEvent: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: 352,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Space.sm,
    paddingVertical: Space.sm + 2,
    paddingHorizontal: Space.sm + 2,
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
  },
  systemEventIcon: {
    width: 34,
    height: 34,
    borderRadius: Radius.full,
    backgroundColor: Colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  systemEventCopy: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  systemEventHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: Space.xs,
  },
  systemEventTitle: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.semibold,
    color: Colors.textPrimary,
    textAlign: 'left',
    flexShrink: 1,
  },
  systemEventText: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.regular,
    color: Colors.textSecondary,
    textAlign: 'left',
    lineHeight: Type.meta.lineHeight + 2,
  },
  verifiedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: Space.xs,
    paddingVertical: 2,
    borderRadius: Radius.full,
    backgroundColor: Colors.surfaceAlt,
  },
  verifiedText: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.medium,
    color: Colors.textSecondary,
  },
});
