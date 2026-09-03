import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Space, Radius, Typography, Stroke, FontFamily } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { useFormattedPrice } from '../../hooks/useFormattedPrice';
import { AnimatedPressable } from '../AnimatedPressable';
import { CachedImage } from '../CachedImage';
import { CommerceStateCard, CommerceStateType } from './CommerceStateCard';
import { useAppTranslation } from '../../i18n/useAppTranslation';

// ── Types ────────────────────────────────────────────────────────────────────

export interface OfferData {
  offerId?: string;
  price: number;
  originalPrice: number;
  status?: 'pending' | 'declined' | 'countered' | 'accepted' | 'expired' | 'cancelled';
  /** ISO date string when the offer expires */
  expiresAt?: string;
  /** Counter-offer chain depth (0 = initial offer, 1 = first counter, etc.) */
  counterRound?: number;
  /** Product anchor context */
  itemId?: string;
  itemTitle?: string;
  itemImage?: string | null;
  itemBrand?: string | null;
  itemSize?: string | null;
  itemCondition?: string | null;
}

export interface ListingShareData {
  id: string;
  title: string;
  price: number;
  originalPrice?: number;
  image: string;
  brand?: string;
  size?: string;
  condition?: string;
  sellerUsername?: string;
  sellerRating?: number;
  isSold?: boolean;
}

export interface PurchaseStatusData {
  orderId?: string;
  orderShortId?: string;
  itemTitle?: string;
  itemImage?: string | null;
  amount?: number;
  deliveryEstimate?: string;
}

export interface MarketplaceChatCardProps {
  type: 'offer' | 'purchase_status' | 'listing_share' | 'safety_notice' | 'system' | 'commerce_state';
  isMe?: boolean;
  senderLabel?: string;
  offer?: OfferData;
  listing?: ListingShareData;
  purchaseStatus?: PurchaseStatusData;
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
  onMakeOffer?: () => void;
  onViewOrder?: () => void;
  /** Called when the offer countdown reaches zero */
  onExpire?: () => void;
}

// ── Helper Functions ─────────────────────────────────────────────────────────

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

function getExpiryTone(msRemaining: number, colors: ThemeColors): { color: string; icon: keyof typeof Ionicons.glyphMap } {
  if (msRemaining <= 0) return { color: colors.textMuted, icon: 'time-outline' };
  if (msRemaining <= 60 * 60 * 1000) return { color: colors.danger, icon: 'timer-outline' };
  if (msRemaining <= 12 * 60 * 60 * 1000) return { color: colors.warning, icon: 'timer-outline' };
  return { color: colors.textSecondary, icon: 'time-outline' };
}

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

// ── Component ────────────────────────────────────────────────────────────────

export function MarketplaceChatCard({
  type,
  isMe = false,
  senderLabel,
  offer,
  listing,
  purchaseStatus,
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
  onMakeOffer,
  onViewOrder,
  onExpire,
}: MarketplaceChatCardProps) {
  const { colors } = useAppTheme();
  const { t } = useAppTranslation('messaging');
  const { currencySymbol } = useFormattedPrice();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const handleExpire = useCallback(() => {
    onExpire?.();
  }, [onExpire]);

  const msRemaining = useOfferCountdown(offer?.expiresAt, offer?.status === 'pending' ? handleExpire : undefined);
  const isExpired = offer?.expiresAt ? msRemaining <= 0 : false;
  const effectiveStatus = isExpired && offer?.status === 'pending' ? 'expired' : offer?.status;

  // ── 1. IN-CHAT OFFER CARD (Grailed & Instagram Direct 2026 standard) ───────
  if (type === 'offer' && offer) {
    const status = effectiveStatus;
    const priceLabel = formattedPrice ?? `${currencySymbol}${offer.price.toFixed(2)}`;
    const origLabel = formattedOriginalPrice ?? `${currencySymbol}${offer.originalPrice.toFixed(2)}`;
    const showCountdown = offer.expiresAt && (status === 'pending' || status === 'countered');
    const tone = getExpiryTone(msRemaining, colors);
    const counterRoundLabel =
      offer.counterRound && offer.counterRound > 0
        ? t('offers.counterRound', { round: offer.counterRound })
        : null;
    const discountPct =
      offer.originalPrice > offer.price
        ? Math.round(((offer.originalPrice - offer.price) / offer.originalPrice) * 100)
        : 0;

    const isPending = (status === undefined || status === 'pending') && !isExpired;
    const hasProductContext = !!(offer.itemTitle || offer.itemImage || offer.itemBrand);

    return (
      <View
        style={[
          styles.offerCard,
          isMe ? styles.offerCardMe : styles.offerCardThem,
        ]}
      >
        {/* Product Media Anchor Header */}
        {hasProductContext && (
          <AnimatedPressable
            style={styles.offerItemHeader}
            onPress={onViewListing}
            disabled={!onViewListing}
            activeOpacity={0.85}
            scaleValue={0.99}
            hapticFeedback="light"
            accessibilityRole="button"
            accessibilityLabel={offer.itemTitle ?? 'View listing'}
          >
            {offer.itemImage ? (
              <CachedImage uri={offer.itemImage} style={styles.offerItemThumb} contentFit="cover" />
            ) : (
              <View style={[styles.offerItemThumb, styles.offerItemThumbFallback]}>
                <Ionicons name="shirt-outline" size={16} color={colors.textMuted} />
              </View>
            )}
            <View style={styles.offerItemMeta}>
              {offer.itemBrand && (
                <Text style={styles.offerBrandEyebrow} numberOfLines={1}>
                  {offer.itemBrand.toUpperCase()}
                </Text>
              )}
              <Text style={styles.offerItemTitle} numberOfLines={1}>
                {offer.itemTitle ?? 'Listing negotiation'}
              </Text>
              {(offer.itemSize || offer.itemCondition) && (
                <View style={styles.offerTagRow}>
                  {offer.itemSize && (
                    <Text style={styles.offerTagText}>{offer.itemSize}</Text>
                  )}
                  {offer.itemSize && offer.itemCondition && (
                    <Text style={styles.offerTagDot}>·</Text>
                  )}
                  {offer.itemCondition && (
                    <Text style={styles.offerTagText}>{offer.itemCondition}</Text>
                  )}
                </View>
              )}
            </View>
            {onViewListing && (
              <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
            )}
          </AnimatedPressable>
        )}

        {/* Sender Label (if in group or incoming) */}
        {senderLabel && !isMe && !hasProductContext && (
          <Text style={styles.offerSender}>{senderLabel}</Text>
        )}

        {/* Price Hero Section */}
        <View style={styles.offerHeroBody}>
          <View style={styles.offerHeroTop}>
            <Text style={styles.offerHeroEyebrow}>
              {counterRoundLabel ? counterRoundLabel.toUpperCase() : 'OFFER AMOUNT'}
            </Text>
            {showCountdown && (
              <View style={[styles.offerUrgencyChip, { backgroundColor: `${tone.color}14` }]}>
                <Ionicons name={tone.icon} size={11} color={tone.color} />
                <Text style={[styles.offerUrgencyText, { color: tone.color }]}>
                  {formatCountdown(msRemaining)}
                </Text>
              </View>
            )}
          </View>

          <View style={styles.offerPriceRow}>
            <Text style={styles.offerPrice} numberOfLines={1}>
              {priceLabel}
            </Text>
            {offer.originalPrice > offer.price && (
              <Text style={styles.offerStrike} numberOfLines={1}>
                {origLabel}
              </Text>
            )}
            {discountPct >= 5 && (
              <View style={styles.offerDiscountBadge}>
                <Text style={styles.offerDiscountText}>-{discountPct}%</Text>
              </View>
            )}
          </View>
        </View>

        {/* Status Indicators */}
        {status === 'accepted' && (
          <View style={[styles.offerStatusBanner, styles.offerStatusAccepted]}>
            <Ionicons name="checkmark-circle" size={16} color={colors.success} />
            <View style={styles.offerStatusTextWrap}>
              <Text style={[styles.offerStatusTitle, { color: colors.success }]}>
                {t('offers.accepted')}
              </Text>
              <Text style={styles.offerStatusSubtitle}>
                Agreed at {priceLabel}
              </Text>
            </View>
            {onViewOrder && (
              <AnimatedPressable
                style={styles.offerStatusActionBtn}
                onPress={onViewOrder}
                activeOpacity={0.8}
                scaleValue={0.96}
                hapticFeedback="light"
              >
                <Text style={styles.offerStatusActionText}>View Order</Text>
              </AnimatedPressable>
            )}
          </View>
        )}

        {status === 'declined' && (
          <View style={[styles.offerStatusBanner, styles.offerStatusDeclined]}>
            <Ionicons name="close-circle-outline" size={16} color={colors.danger} />
            <View style={styles.offerStatusTextWrap}>
              <Text style={[styles.offerStatusTitle, { color: colors.danger }]}>
                {t('offers.declined')}
              </Text>
              <Text style={styles.offerStatusSubtitle}>
                Offer was not accepted
              </Text>
            </View>
            {onCounter && !isMe && (
              <AnimatedPressable
                style={styles.offerStatusActionBtn}
                onPress={onCounter}
                activeOpacity={0.8}
                scaleValue={0.96}
                hapticFeedback="light"
              >
                <Text style={styles.offerStatusActionText}>New Offer</Text>
              </AnimatedPressable>
            )}
          </View>
        )}

        {status === 'expired' && (
          <View style={[styles.offerStatusBanner, styles.offerStatusExpired]}>
            <Ionicons name="time-outline" size={16} color={colors.textMuted} />
            <View style={styles.offerStatusTextWrap}>
              <Text style={[styles.offerStatusTitle, { color: colors.textMuted }]}>
                {t('offers.expired')}
              </Text>
              <Text style={styles.offerStatusSubtitle}>
                No response within 24h
              </Text>
            </View>
            {onCounter && (
              <AnimatedPressable
                style={styles.offerStatusActionBtn}
                onPress={onCounter}
                activeOpacity={0.8}
                scaleValue={0.96}
                hapticFeedback="light"
              >
                <Text style={styles.offerStatusActionText}>Retry</Text>
              </AnimatedPressable>
            )}
          </View>
        )}

        {/* Sender Outgoing State: Waiting for response */}
        {isPending && isMe && (
          <View style={styles.offerWaitingRow}>
            <Ionicons name="paper-plane-outline" size={13} color={colors.textSecondary} />
            <Text style={styles.offerWaitingText}>
              Offer sent · Waiting for seller response
            </Text>
          </View>
        )}

        {/* Recipient Incoming State: Action buttons */}
        {isPending && !isMe && (
          <View style={styles.offerActions}>
            <AnimatedPressable
              style={styles.offerPass}
              onPress={onDecline}
              activeOpacity={0.8}
              scaleValue={0.96}
              hapticFeedback="light"
              accessibilityRole="button"
              accessibilityLabel={t('offers.declineOffer')}
            >
              <Text style={styles.offerPassText}>{t('offers.pass')}</Text>
            </AnimatedPressable>

            {onCounter && (
              <AnimatedPressable
                style={styles.offerCounter}
                onPress={onCounter}
                activeOpacity={0.85}
                scaleValue={0.96}
                hapticFeedback="light"
                accessibilityRole="button"
                accessibilityLabel={t('offers.counterOffer')}
              >
                <Text style={styles.offerCounterText}>{t('offers.counter')}</Text>
              </AnimatedPressable>
            )}

            <AnimatedPressable
              style={styles.offerAccept}
              onPress={onAccept}
              activeOpacity={0.85}
              scaleValue={0.96}
              hapticFeedback="medium"
              accessibilityRole="button"
              accessibilityLabel={t('offers.acceptOffer')}
            >
              <Text style={styles.offerAcceptText}>{t('offers.accept')}</Text>
            </AnimatedPressable>
          </View>
        )}
      </View>
    );
  }

  // ── 2. PRODUCT SHARE CARD (Pinterest & Instagram Direct 2026 standard) ─────
  if (type === 'listing_share' && listing) {
    const displayPrice = formattedPrice ?? `${currencySymbol}${listing.price.toFixed(2)}`;
    return (
      <View style={[styles.shareCard, isMe ? styles.shareCardMe : styles.shareCardThem]}>
        {/* Editorial Product Image with floating price badge */}
        <View style={styles.shareImageContainer}>
          <CachedImage uri={listing.image} style={styles.shareImage} contentFit="cover" />
          <View style={styles.shareFloatingPill}>
            <Text style={styles.shareFloatingPrice}>{displayPrice}</Text>
            {listing.condition && (
              <>
                <View style={styles.sharePillDot} />
                <Text style={styles.shareFloatingCondition}>{listing.condition}</Text>
              </>
            )}
          </View>
          {listing.isSold && (
            <View style={styles.shareSoldOverlay}>
              <Text style={styles.shareSoldText}>SOLD</Text>
            </View>
          )}
        </View>

        {/* Product Details */}
        <View style={styles.shareContent}>
          {listing.brand && (
            <Text style={styles.shareBrandEyebrow} numberOfLines={1}>
              {listing.brand.toUpperCase()}
            </Text>
          )}
          <Text style={styles.shareTitle} numberOfLines={2}>
            {listing.title}
          </Text>

          {/* Seller / Trust row */}
          {listing.sellerUsername && (
            <View style={styles.shareSellerRow}>
              <Ionicons name="person-circle-outline" size={14} color={colors.textSecondary} />
              <Text style={styles.shareSellerText}>@{listing.sellerUsername}</Text>
              {listing.sellerRating && (
                <View style={styles.shareRatingChip}>
                  <Ionicons name="star" size={10} color="#F59E0B" />
                  <Text style={styles.shareRatingText}>{listing.sellerRating.toFixed(1)}</Text>
                </View>
              )}
            </View>
          )}

          {/* Action Dock */}
          <View style={styles.shareActions}>
            <AnimatedPressable
              style={styles.sharePrimaryBtn}
              onPress={onViewListing}
              activeOpacity={0.85}
              scaleValue={0.97}
              hapticFeedback="light"
              accessibilityRole="button"
              accessibilityLabel={`View ${listing.title}`}
            >
              <Text style={styles.sharePrimaryText}>View item</Text>
              <Ionicons name="arrow-forward" size={13} color={colors.textInverse} />
            </AnimatedPressable>

            {onMakeOffer && !listing.isSold && (
              <AnimatedPressable
                style={styles.shareSecondaryBtn}
                onPress={onMakeOffer}
                activeOpacity={0.85}
                scaleValue={0.97}
                hapticFeedback="light"
                accessibilityRole="button"
                accessibilityLabel="Make an offer"
              >
                <Text style={styles.shareSecondaryText}>Make offer</Text>
              </AnimatedPressable>
            )}
          </View>
        </View>
      </View>
    );
  }

  // ── 3. PURCHASE & ORDER CONFIRMATION ─────────────────────────────────────────
  if (type === 'purchase_status') {
    const lines = (text || '').split('\n');
    const headerTitle = lines[0] || 'Order Confirmed';
    const bodyCopy = lines.slice(1).join('\n');
    return (
      <View style={styles.purchaseReceiptCard}>
        <View style={styles.purchaseReceiptHeader}>
          <View style={[styles.receiptIconCircle, { backgroundColor: `${colors.success}18` }]}>
            <Ionicons name="checkmark" size={16} color={colors.success} />
          </View>
          <View style={styles.receiptTitleWrap}>
            <Text style={styles.receiptTitle}>{headerTitle}</Text>
            {bodyCopy ? <Text style={styles.receiptBody}>{bodyCopy}</Text> : null}
          </View>
        </View>
        {onViewOrder && (
          <AnimatedPressable
            style={styles.receiptActionRow}
            onPress={onViewOrder}
            activeOpacity={0.8}
            scaleValue={0.98}
            hapticFeedback="light"
          >
            <Text style={styles.receiptActionText}>View order receipt</Text>
            <Ionicons name="chevron-forward" size={13} color={colors.brand} />
          </AnimatedPressable>
        )}
      </View>
    );
  }

  // ── 4. TRUST & SAFETY NOTICE BANNER ──────────────────────────────────────────
  if (type === 'safety_notice' && text) {
    return (
      <View style={styles.safetyCard}>
        <View style={styles.safetyIconSquircle}>
          <Ionicons name="shield-checkmark" size={16} color="#0D9488" />
        </View>
        <View style={styles.safetyContent}>
          <Text style={styles.safetyHeadline}>ThryftVerse Buyer Protection</Text>
          <Text style={styles.safetyBody}>{text}</Text>
        </View>
      </View>
    );
  }

  // ── 5. COMMERCE LOGISTICS STATE CARD ─────────────────────────────────────────
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

  // ── 6. FROSTED SYSTEM NOTICE PILL ───────────────────────────────────────────
  if (type === 'system') {
    return (
      <View style={styles.systemPillWrap}>
        <View style={styles.systemPill}>
          {systemVerified && (
            <Ionicons name="shield-checkmark" size={11} color={colors.brand} style={{ marginRight: 4 }} />
          )}
          <Text style={styles.systemPillText}>
            {text || systemTitle}
          </Text>
        </View>
      </View>
    );
  }

  return null;
}

// ── Styles ───────────────────────────────────────────────────────────────────

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    // ── Offer Card Styles ─────────────────────────────
    offerCard: {
      width: '88%',
      maxWidth: 340,
      backgroundColor: colors.surface,
      borderRadius: Radius.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.borderSubtle,
      padding: Space.md - 2,
      gap: Space.sm,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.05,
      shadowRadius: 8,
      elevation: 2,
    },
    offerCardThem: {
      alignSelf: 'flex-start',
      borderBottomLeftRadius: 3,
    },
    offerCardMe: {
      alignSelf: 'flex-end',
      borderBottomRightRadius: 3,
      backgroundColor: colors.surfaceAlt,
      borderColor: colors.border,
    },
    offerSender: {
      fontSize: TypographyV2.meta.size,
      fontFamily: FontFamily.medium,
      color: colors.textSecondary,
      marginBottom: 2,
    },
    offerItemHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm,
      paddingBottom: Space.sm - 2,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.borderSubtle,
    },
    offerItemThumb: {
      width: 48,
      height: 48,
      borderRadius: Radius.md - 2,
      backgroundColor: colors.surfaceAlt,
    },
    offerItemThumbFallback: {
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.borderSubtle,
    },
    offerItemMeta: {
      flex: 1,
      gap: 2,
    },
    offerBrandEyebrow: {
      fontSize: 9,
      fontFamily: FontFamily.bold,
      color: colors.textMuted,
      letterSpacing: 1.1,
    },
    offerItemTitle: {
      fontSize: 13,
      fontFamily: FontFamily.semibold,
      color: colors.textPrimary,
    },
    offerTagRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    offerTagText: {
      fontSize: 11,
      fontFamily: TypographyV2.meta.fontFamily,
      color: colors.textSecondary,
    },
    offerTagDot: {
      fontSize: 11,
      color: colors.textMuted,
    },
    offerHeroBody: {
      gap: 4,
    },
    offerHeroTop: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    offerHeroEyebrow: {
      fontSize: 10,
      fontFamily: FontFamily.semibold,
      color: colors.textMuted,
      letterSpacing: 0.8,
    },
    offerUrgencyChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 7,
      paddingVertical: 2,
      borderRadius: Radius.full,
    },
    offerUrgencyText: {
      fontSize: 11,
      fontFamily: FontFamily.medium,
      fontVariant: ['tabular-nums'],
    },
    offerPriceRow: {
      flexDirection: 'row',
      alignItems: 'baseline',
      gap: Space.xs + 2,
    },
    offerPrice: {
      fontSize: 24,
      fontFamily: FontFamily.bold,
      color: colors.textPrimary,
      fontVariant: ['tabular-nums'],
      letterSpacing: -0.4,
    },
    offerStrike: {
      fontSize: 13,
      fontFamily: TypographyV2.meta.fontFamily,
      color: colors.textMuted,
      textDecorationLine: 'line-through',
      fontVariant: ['tabular-nums'],
    },
    offerDiscountBadge: {
      backgroundColor: colors.successSubtle,
      borderRadius: Radius.sm,
      paddingHorizontal: 6,
      paddingVertical: 2,
      marginLeft: 2,
    },
    offerDiscountText: {
      fontSize: 11,
      fontFamily: FontFamily.bold,
      color: colors.success,
      fontVariant: ['tabular-nums'],
    },
    offerWaitingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingTop: Space.xs,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.borderSubtle,
    },
    offerWaitingText: {
      fontSize: 12,
      fontFamily: TypographyV2.meta.fontFamily,
      color: colors.textSecondary,
    },
    offerStatusBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm,
      padding: Space.sm,
      borderRadius: Radius.md,
      marginTop: 2,
    },
    offerStatusAccepted: {
      backgroundColor: `${colors.success}14`,
    },
    offerStatusDeclined: {
      backgroundColor: `${colors.danger}12`,
    },
    offerStatusExpired: {
      backgroundColor: colors.surfaceAlt,
    },
    offerStatusTextWrap: {
      flex: 1,
      gap: 1,
    },
    offerStatusTitle: {
      fontSize: 12,
      fontFamily: FontFamily.semibold,
    },
    offerStatusSubtitle: {
      fontSize: 11,
      fontFamily: TypographyV2.meta.fontFamily,
      color: colors.textSecondary,
    },
    offerStatusActionBtn: {
      backgroundColor: colors.surface,
      paddingHorizontal: Space.sm,
      paddingVertical: 5,
      borderRadius: Radius.sm,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.borderSubtle,
    },
    offerStatusActionText: {
      fontSize: 11,
      fontFamily: FontFamily.medium,
      color: colors.textPrimary,
    },
    offerActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs + 2,
      marginTop: Space.xs,
      paddingTop: Space.sm - 2,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.borderSubtle,
    },
    offerPass: {
      paddingHorizontal: Space.sm,
      minHeight: 38,
      alignItems: 'center',
      justifyContent: 'center',
    },
    offerPassText: {
      fontSize: 13,
      fontFamily: FontFamily.medium,
      color: colors.textMuted,
    },
    offerCounter: {
      flex: 1,
      minHeight: 38,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: Radius.md,
      backgroundColor: colors.surfaceAlt,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    offerCounterText: {
      fontSize: 13,
      fontFamily: FontFamily.semibold,
      color: colors.textPrimary,
    },
    offerAccept: {
      flex: 1.3,
      minHeight: 38,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: Radius.md,
      backgroundColor: colors.brand,
    },
    offerAcceptText: {
      fontSize: 13,
      fontFamily: FontFamily.semibold,
      color: colors.textInverse,
    },

    // ── Listing Share Card Styles ─────────────────────
    shareCard: {
      width: '88%',
      maxWidth: 320,
      backgroundColor: colors.surface,
      borderRadius: Radius.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.borderSubtle,
      overflow: 'hidden',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: 0.06,
      shadowRadius: 10,
      elevation: 3,
    },
    shareCardThem: {
      alignSelf: 'flex-start',
      borderBottomLeftRadius: 3,
    },
    shareCardMe: {
      alignSelf: 'flex-end',
      borderBottomRightRadius: 3,
    },
    shareImageContainer: {
      width: '100%',
      aspectRatio: 1.2,
      backgroundColor: colors.surfaceAlt,
      position: 'relative',
    },
    shareImage: {
      width: '100%',
      height: '100%',
    },
    shareFloatingPill: {
      position: 'absolute',
      bottom: 10,
      left: 10,
      backgroundColor: 'rgba(0,0,0,0.72)',
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: Radius.full,
      gap: 6,
    },
    shareFloatingPrice: {
      fontSize: 13,
      fontFamily: FontFamily.bold,
      color: '#FFFFFF',
      fontVariant: ['tabular-nums'],
    },
    sharePillDot: {
      width: 3,
      height: 3,
      borderRadius: 1.5,
      backgroundColor: 'rgba(255,255,255,0.6)',
    },
    shareFloatingCondition: {
      fontSize: 11,
      fontFamily: FontFamily.medium,
      color: 'rgba(255,255,255,0.85)',
    },
    shareSoldOverlay: {
      ...StyleSheet.absoluteFill,
      backgroundColor: 'rgba(0,0,0,0.5)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    shareSoldText: {
      fontSize: 16,
      fontFamily: FontFamily.bold,
      color: '#FFFFFF',
      letterSpacing: 2,
    },
    shareContent: {
      padding: Space.md - 2,
      gap: 6,
    },
    shareBrandEyebrow: {
      fontSize: 9,
      fontFamily: FontFamily.bold,
      color: colors.textMuted,
      letterSpacing: 1.1,
    },
    shareTitle: {
      fontSize: 14,
      fontFamily: FontFamily.semibold,
      color: colors.textPrimary,
      lineHeight: 18,
    },
    shareSellerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginTop: 2,
    },
    shareSellerText: {
      fontSize: 12,
      fontFamily: TypographyV2.meta.fontFamily,
      color: colors.textSecondary,
    },
    shareRatingChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 2,
      backgroundColor: colors.surfaceAlt,
      paddingHorizontal: 5,
      paddingVertical: 1,
      borderRadius: Radius.sm,
    },
    shareRatingText: {
      fontSize: 10,
      fontFamily: FontFamily.bold,
      color: colors.textPrimary,
    },
    shareActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
      marginTop: Space.xs + 2,
      paddingTop: Space.xs + 2,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.borderSubtle,
    },
    sharePrimaryBtn: {
      flex: 1,
      minHeight: 36,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      backgroundColor: colors.brand,
      borderRadius: Radius.md,
      paddingHorizontal: Space.sm,
    },
    sharePrimaryText: {
      fontSize: 12,
      fontFamily: FontFamily.semibold,
      color: colors.textInverse,
    },
    shareSecondaryBtn: {
      flex: 1,
      minHeight: 36,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surfaceAlt,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      borderRadius: Radius.md,
      paddingHorizontal: Space.sm,
    },
    shareSecondaryText: {
      fontSize: 12,
      fontFamily: FontFamily.semibold,
      color: colors.textPrimary,
    },

    // ── Purchase Receipt Styles ───────────────────────
    purchaseReceiptCard: {
      alignSelf: 'center',
      width: '90%',
      maxWidth: 340,
      backgroundColor: colors.surface,
      borderRadius: Radius.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.borderSubtle,
      padding: Space.md - 2,
      gap: Space.sm,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.04,
      shadowRadius: 6,
      elevation: 2,
    },
    purchaseReceiptHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm,
    },
    receiptIconCircle: {
      width: 32,
      height: 32,
      borderRadius: Radius.full,
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    receiptTitleWrap: {
      flex: 1,
      gap: 2,
    },
    receiptTitle: {
      fontSize: 13,
      fontFamily: FontFamily.semibold,
      color: colors.textPrimary,
    },
    receiptBody: {
      fontSize: 12,
      fontFamily: TypographyV2.meta.fontFamily,
      color: colors.textSecondary,
      lineHeight: 16,
    },
    receiptActionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingTop: Space.xs,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.borderSubtle,
    },
    receiptActionText: {
      fontSize: 12,
      fontFamily: FontFamily.semibold,
      color: colors.brand,
    },

    // ── Safety Card Styles ────────────────────────────
    safetyCard: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: Space.sm,
      alignSelf: 'center',
      width: '90%',
      maxWidth: 340,
      backgroundColor: `${colors.brandSubtle ?? colors.surfaceAlt}`,
      borderRadius: Radius.md,
      padding: Space.sm + 2,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.borderSubtle,
    },
    safetyIconSquircle: {
      width: 28,
      height: 28,
      borderRadius: Radius.sm,
      backgroundColor: '#CCFBF1',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    safetyContent: {
      flex: 1,
      gap: 2,
    },
    safetyHeadline: {
      fontSize: 12,
      fontFamily: FontFamily.semibold,
      color: colors.textPrimary,
    },
    safetyBody: {
      fontSize: 11,
      fontFamily: TypographyV2.meta.fontFamily,
      color: colors.textSecondary,
      lineHeight: 15,
    },

    // ── System Notice Pill Styles ─────────────────────
    systemPillWrap: {
      alignItems: 'center',
      justifyContent: 'center',
      marginVertical: Space.xs + 2,
      paddingHorizontal: Space.md,
      width: '100%',
    },
    systemPill: {
      flexDirection: 'row',
      backgroundColor: colors.surfaceAlt,
      paddingHorizontal: Space.md,
      paddingVertical: Space.xs + 1,
      borderRadius: Radius.full,
      maxWidth: '86%',
      alignItems: 'center',
      justifyContent: 'center',
    },
    systemPillText: {
      fontSize: TypographyV2.meta.size,
      fontFamily: FontFamily.medium,
      color: colors.textSecondary,
      textAlign: 'center',
      lineHeight: TypographyV2.meta.lineHeight,
    },
  });
