import React, { useState, useMemo, useCallback } from 'react';
import { Space, Type, Typography, Radius, Stroke, Control } from '../theme/designTokens';
import {
  AnimatedPressable,
} from '../components/AnimatedPressable';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  ScrollView,
  Platform,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Reanimated, { FadeInDown } from 'react-native-reanimated';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { useAppTheme } from '../theme/ThemeContext';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { useConnectivity } from '../hooks/useConnectivity';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useCurrencyContext } from '../context/CurrencyContext';
import { CURRENCIES } from '../constants/currencies';
import { useToast } from '../context/ToastContext';
import {
  calculateOfferSummaryFromDisplay,
  convertGbpToDisplayAmount,
  sanitizeDecimalInput,
} from '../utils/currencyAuthoringFlows';
import { AppButton } from '../components/ui/AppButton';
import { FlagshipScreen, FlagshipHeader } from '../components/flagship';
import { CachedImage } from '../components/CachedImage';
import { fetchListingByIdFromApi } from '../services/listingsApi';
import {
  counterListingOfferOnApi,
  createListingOfferOnApi,
} from '../services/listingOffersApi';
import { haptics } from '../utils/haptics';
import { createStableId } from '../utils/createStableId';

type Props = NativeStackScreenProps<RootStackParamList, 'MakeOffer'>;

export default function MakeOfferScreen({ navigation, route }: Props) {
  const { itemId, price, title } = route.params;
  const { colors } = useAppTheme();
  const { formatFromFiat } = useFormattedPrice();
  const { currencyCode, goldRates } = useCurrencyContext();
  const { show } = useToast();
  const { isOffline } = useConnectivity();
  const reducedMotionEnabled = useReducedMotion();
  const currencySymbol = CURRENCIES[currencyCode].symbol;
  const [offerPrice, setOfferPrice] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [listing, setListing] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [expiryHours, setExpiryHours] = useState(48);
  const [showReview, setShowReview] = useState(false);
  const isCounterOffer = route.params.counterOffer ?? false;
  const previousOffer = route.params.previousOffer;
  const counterRound = route.params.counterRound ?? 0;
  const parentOfferId = route.params.parentOfferId;
  const idempotencyKeyRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    let mounted = true;
    setIsLoading(true);
    fetchListingByIdFromApi(itemId)
      .then((res) => {
        if (!mounted) return;
        if (res.ok && res.listing) setListing(res.listing);
      })
      .catch(() => { if (mounted) show('Could not load listing', 'error'); })
      .finally(() => { if (mounted) setIsLoading(false); });
    return () => { mounted = false; };
  }, [itemId, show]);

  React.useEffect(() => {
    // For counter-offers, default to halfway between previous offer and asking price
    const basePrice = isCounterOffer && previousOffer ? (previousOffer + price) / 2 : price;
    const defaultOffer = convertGbpToDisplayAmount(basePrice, currencyCode, goldRates);
    setOfferPrice((Number.isFinite(defaultOffer) ? defaultOffer : basePrice).toFixed(2));
  }, [currencyCode, goldRates, price, isCounterOffer, previousOffer]);

  const numericOffer = parseFloat(offerPrice) || 0;
  const {
    offerGbp: numericOfferGbp,
    platformChargeGbp,
    totalGbp: total,
  } = calculateOfferSummaryFromDisplay(numericOffer, currencyCode, goldRates);

  // Discount percentage relative to listing price — key trust signal
  // shown dynamically as the buyer adjusts their offer. Depop/Vinted/
  // Vestiaire all show this prominently.
  const discountPct = useMemo(() => {
    if (!price || price <= 0) return null;
    const pct = ((price - numericOfferGbp) / price) * 100;
    if (pct <= 0) return null;
    return Math.round(pct);
  }, [price, numericOfferGbp]);

  const handleOfferChange = (value: string) => {
    setOfferPrice(sanitizeDecimalInput(value));
    if (errorMsg) setErrorMsg('');
  };

  // Validation only — used by the "Review offer" button to advance to
  // the confirmation step without submitting.
  const validateOffer = useCallback((): string | null => {
    if (!numericOffer || !Number.isFinite(numericOfferGbp) || numericOfferGbp <= 0) {
      return 'Enter a valid offer amount.';
    }
    if (numericOfferGbp > price * 2) {
      return 'Offer seems too high. Review the amount.';
    }
    const sellerMinOffer = listing?.minimumOfferGbp ?? listing?.minimum_offer_gbp ?? 0;
    if (sellerMinOffer > 0 && numericOfferGbp < sellerMinOffer) {
      return `Seller's minimum offer is ${formatFromFiat(sellerMinOffer, 'GBP')}.`;
    }
    if (!listing?.sellerId) {
      return 'Could not load seller info. Try again.';
    }
    return null;
  }, [numericOffer, numericOfferGbp, price, listing, formatFromFiat]);

  const handleReviewOffer = useCallback(() => {
    const validationError = validateOffer();
    if (validationError) {
      setErrorMsg(validationError);
      return;
    }
    haptics.tap();
    setErrorMsg('');
    setShowReview(true);
  }, [validateOffer, haptics]);

  const handleSendOffer = async () => {
    // The review step already validated, but re-check defensively.
    const validationError = validateOffer();
    if (validationError) {
      setErrorMsg(validationError);
      setShowReview(false);
      return;
    }

    setIsSubmitting(true);
    try {
      // Persist the offer server-side so expiry, accept/decline and counter
      // chains are authoritative across devices. The server computes
      // expires_at — the frontend only suggests an expiryHours window.
      if (!idempotencyKeyRef.current) {
        idempotencyKeyRef.current = createStableId(isCounterOffer ? 'counter' : 'offer');
      }
      if (isCounterOffer && !parentOfferId) {
        throw new Error('The original offer is unavailable. Refresh the conversation and try again.');
      }
      const offer = isCounterOffer
        ? await counterListingOfferOnApi(parentOfferId!, {
          offerPriceGbp: numericOfferGbp,
          expiryHours,
          idempotencyKey: idempotencyKeyRef.current,
        })
        : await createListingOfferOnApi({
          listingId: itemId,
          offerPriceGbp: numericOfferGbp,
          expiryHours,
          idempotencyKey: idempotencyKeyRef.current,
          metadata: {
            originalPriceGbp: price,
            source: 'initial',
          },
        });

      const offerText = isCounterOffer
        ? `Counter-offer: ${formatFromFiat(numericOfferGbp, 'GBP')} (was ${formatFromFiat(previousOffer ?? 0, 'GBP')}). Valid for ${expiryHours}h.`
        : `Offer: ${formatFromFiat(numericOfferGbp, 'GBP')} for ${title}. Valid for ${expiryHours}h.`;

      navigation.navigate('Chat', {
        conversationId: `offer_${listing.sellerId}_${itemId}`,
        focusQuery: offerText,
        partnerUserId: listing.sellerId,
        offerPayload: {
          offerId: offer.id,
          price: numericOfferGbp,
          originalPrice: price,
          expiresAt: offer.expiresAt,
          counterRound: offer.counterRound,
        },
      });
      show('Opening chat to send your offer.', 'info');
    } catch (err) {
      const isNetworkError = isOffline || (err instanceof Error && /network|fetch|timeout/i.test(err.message));
      const message = isNetworkError
        ? 'You appear to be offline. Check your connection and try again.'
        : err instanceof Error ? err.message : 'Could not submit offer.';
      setErrorMsg(message);
      // Stay on review step so the user can retry without re-entering details.
    } finally {
      setIsSubmitting(false);
    }
  };

  const quickOfferPercentages = [0.8, 0.9, 0.95];
  const applyQuickOffer = (percentage: number) => {
    const gbpAmount = price * percentage;
    const displayAmount = convertGbpToDisplayAmount(gbpAmount, currencyCode, goldRates);
    setOfferPrice((Number.isFinite(displayAmount) ? displayAmount : gbpAmount).toFixed(2));
    if (errorMsg) setErrorMsg('');
    haptics.tap();
  };

  const expiryOptions = [24, 48, 72];

  const handleMessageSeller = React.useCallback(() => {
    if (!listing?.sellerId) return;
    navigation.navigate('Chat', {
      conversationId: `offer_${listing.sellerId}_${itemId}`,
      focusQuery: title,
      partnerUserId: listing.sellerId,
    });
    show('Opening seller chat.', 'info');
  }, [itemId, navigation, listing?.sellerId, show, title]);

  // Item image — use listing image if available, fall back to icon
  const itemImageUri = listing?.images?.[0] ?? listing?.imageUrl;

  return (
    <FlagshipScreen
      header={
        <FlagshipHeader
          title={isCounterOffer ? 'Counter-offer' : 'Make offer'}
          onBack={() => navigation.goBack()}
          backIcon="close"
        />
      }
      scrollEnabled={false}
      contentStyle={{ paddingHorizontal: 0, paddingTop: 0 }}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Item summary ──
            Compact, flat, no card. Image + title + listed price + message
            action. Per AGENTS.md surface budget: flat canvas, no cards. */}
        <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300)} style={styles.itemSummary}>
          <View style={[styles.itemThumb, { backgroundColor: colors.surfaceAlt }]}>
            {itemImageUri ? (
              <CachedImage
                uri={itemImageUri}
                style={styles.itemThumbImage}
                contentFit="cover"
              />
            ) : (
              <Ionicons name="shirt-outline" size={24} color={colors.textMuted} />
            )}
          </View>
          <View style={styles.itemInfo}>
            <Text
              style={[styles.itemTitle, { color: colors.textPrimary }]}
              numberOfLines={2}
            >
              {title}
            </Text>
            <Text style={[styles.itemListingPrice, { color: colors.textSecondary }]}>
              Listed at {formatFromFiat(price, 'GBP')}
            </Text>
          </View>
        </Reanimated.View>

        {/* ── Message seller action ──
            Inline quiet action, not a bordered chip. Per Design.md:
            quiet controls are transparent, no decorative chrome. */}
        <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300).delay(60)}>
        <Pressable
          style={styles.messageAction}
          onPress={handleMessageSeller}
          accessibilityRole="button"
          accessibilityLabel="Message seller"
          accessibilityHint="Opens chat with the seller"
        >
          <Ionicons name="chatbubble-ellipses-outline" size={18} color={colors.textSecondary} />
          <Text style={[styles.messageActionText, { color: colors.textSecondary }]}>
            Message seller
          </Text>
          <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
        </Pressable>
        </Reanimated.View>

        {/* ── Price input ──
            Large, centered price field. The currency symbol and amount
            are the dominant visual element. No heavy border — the input
            sits on the flat canvas with a subtle bottom hairline.
            Per Design.md form-field: input background, 52px height,
            Radius.xl. But for a price entry field, we want it to feel
            like a number, not a form field — so we use a larger,
            centered layout with a hairline underline. */}
        <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300).delay(120)}>
        <View style={styles.priceSection}>
          <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>
            {isCounterOffer ? 'Your counter-offer' : 'Your offer'}
          </Text>

          <View style={[styles.priceInputContainer, { borderBottomColor: colors.border }]}>
            <Text style={[styles.currencySymbol, { color: colors.brand }]}>
              {currencySymbol}
            </Text>
            <TextInput
              style={[styles.priceInput, { color: colors.textPrimary }]}
              value={offerPrice}
              onChangeText={handleOfferChange}
              keyboardType="decimal-pad"
              selectionColor={colors.brand}
              placeholderTextColor={colors.textMuted}
              placeholder="0.00"
              accessibilityLabel="Offer amount"
            />
          </View>

          {/* Discount indicator — dynamic, shows how much below asking */}
          {discountPct != null && (
            <View style={styles.discountRow}>
              <Text style={[styles.discountText, { color: colors.warning }]}>
                {discountPct}% below asking
              </Text>
            </View>
          )}

          {/* Quick offer chips — 80%, 90%, 95% of asking price */}
          <View style={styles.quickOfferRow}>
            {quickOfferPercentages.map((pct) => {
              const gbpAmount = price * pct;
              const displayAmount = convertGbpToDisplayAmount(gbpAmount, currencyCode, goldRates);
              const label = Number.isFinite(displayAmount)
                ? `${Math.round(pct * 100)}%`
                : `${Math.round(pct * 100)}%`;
              const sublabel = Number.isFinite(displayAmount)
                ? `${currencySymbol}${displayAmount.toFixed(0)}`
                : '';
              return (
                <Pressable
                  key={pct}
                  style={[styles.quickOfferChip, { backgroundColor: colors.surfaceAlt, borderColor: colors.borderSubtle }]}
                  onPress={() => applyQuickOffer(pct)}
                  accessibilityRole="button"
                  accessibilityLabel={`Quick offer: ${Math.round(pct * 100)}% of asking price, ${currencySymbol}${displayAmount.toFixed(0)}`}
                >
                  <Text style={[styles.quickOfferChipLabel, { color: colors.textPrimary }]}>
                    {label}
                  </Text>
                  {sublabel ? (
                    <Text style={[styles.quickOfferChipSub, { color: colors.textSecondary }]}>
                      {sublabel}
                    </Text>
                  ) : null}
                </Pressable>
              );
            })}
          </View>

          {/* Counter-offer context — previous vs new side by side */}
          {isCounterOffer && previousOffer != null && (
            <View style={[styles.counterCompareBox, { backgroundColor: colors.surfaceAlt }]}>
              <View style={styles.counterCompareCol}>
                <Text style={[styles.counterCompareLabel, { color: colors.textMuted }]}>
                  Previous offer
                </Text>
                <Text style={[styles.counterCompareValue, { color: colors.textSecondary }]}>
                  {formatFromFiat(previousOffer, 'GBP')}
                </Text>
              </View>
              <Ionicons name="arrow-forward" size={16} color={colors.textMuted} />
              <View style={styles.counterCompareCol}>
                <Text style={[styles.counterCompareLabel, { color: colors.brand }]}>
                  Your counter
                </Text>
                <Text style={[styles.counterCompareValue, { color: colors.brand }]}>
                  {numericOfferGbp > 0 ? formatFromFiat(numericOfferGbp, 'GBP') : '—'}
                </Text>
              </View>
            </View>
          )}

          {/* Seller minimum offer floor notice */}
          {(() => {
            const sellerMinOffer = listing?.minimumOfferGbp ?? listing?.minimum_offer_gbp ?? 0;
            if (sellerMinOffer <= 0) return null;
            return (
              <View style={styles.contextRow}>
                <Ionicons name="information-circle-outline" size={14} color={colors.textSecondary} />
                <Text style={[styles.contextText, { color: colors.textSecondary }]}>
                  Seller's minimum offer: {formatFromFiat(sellerMinOffer, 'GBP')}
                </Text>
              </View>
            );
          })()}
        </View>
        </Reanimated.View>

        {/* ── Offer expiry ──
            Clean chip selector with selection state. Per Design.md:
            selected state uses brand fill, unselected uses surfaceAlt. */}
        <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300).delay(180)}>
        <View style={styles.expirySection}>
          <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>
            Offer valid for
          </Text>
          <View style={styles.expiryRow}>
            {expiryOptions.map((hours) => {
              const isActive = expiryHours === hours;
              return (
                <Pressable
                  key={hours}
                  style={[
                    styles.expiryChip,
                    { backgroundColor: isActive ? colors.brand : colors.surfaceAlt,
                      borderColor: isActive ? colors.brand : colors.borderSubtle },
                  ]}
                  onPress={() => { setExpiryHours(hours); haptics.tap(); }}
                  accessibilityRole="button"
                  accessibilityLabel={`Offer valid for ${hours} hours`}
                  accessibilityState={{ selected: isActive }}
                >
                  <Text style={[
                    styles.expiryChipText,
                    { color: isActive ? colors.textInverse : colors.textSecondary },
                  ]}>
                    {hours}h
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={[styles.expiryHint, { color: colors.textMuted }]}>
            Seller has {expiryHours} hours to respond. After that, the offer expires automatically.
          </Text>
        </View>
        </Reanimated.View>

        {/* ── Summary ──
            Flat rows with hairline separator, not a card. Per AGENTS.md
            surface budget: flat canvas, hairlines, no cards. */}
        <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300).delay(240)}>
        <View style={styles.summarySection}>
          <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>
            Summary
          </Text>
          <View style={[styles.summaryRow, { borderBottomColor: colors.borderSubtle }]}>
            <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>
              Your offer
            </Text>
            <Text style={[styles.summaryValue, { color: colors.textPrimary }]}>
              {formatFromFiat(numericOfferGbp, 'GBP')}
            </Text>
          </View>
          <View style={[styles.summaryRow, { borderBottomColor: colors.borderSubtle }]}>
            <View style={styles.summaryLabelCluster}>
              <Ionicons name="shield-checkmark-outline" size={15} color={colors.textSecondary} />
              <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>
                Platform charge
              </Text>
            </View>
            <Text style={[styles.summaryValue, { color: colors.textPrimary }]}>
              {formatFromFiat(platformChargeGbp, 'GBP')}
            </Text>
          </View>
          <View style={styles.totalRow}>
            <Text style={[styles.totalLabel, { color: colors.textPrimary }]}>
              Total
            </Text>
            <Text style={[styles.totalValue, { color: colors.brand }]}>
              {formatFromFiat(total, 'GBP')}
            </Text>
          </View>
        </View>
        </Reanimated.View>

        {/* ── Trust signal ──
            Inline buyer protection note, not a card. Per Design.md:
            trust signals are decision inputs, not decoration. */}
        <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300).delay(300)}>
        <View style={styles.trustRow}>
          <Ionicons name="shield-checkmark-outline" size={16} color={colors.success} />
          <Text style={[styles.trustText, { color: colors.textSecondary }]}>
            Protected by ThryftVerse Buyer Protection — secure settlement and support included.
          </Text>
        </View>

        {/* ── Tip ──
            Subtle inline tip, not a card with icon box. Per Design.md:
            quality comes from hierarchy, not decoration. */}
        <Text style={[styles.tipText, { color: colors.textMuted }]}>
          Offers within 10% of the listing price are{' '}
          <Text style={{ fontFamily: Typography.family.semibold, color: colors.textSecondary }}>
            3x
          </Text>
          {' '}more likely to be accepted.
        </Text>
        </Reanimated.View>

        {!!errorMsg && !showReview && (
          <View style={styles.errorBlock}>
            <Text style={[styles.errorText, { color: colors.danger }]}>
              {errorMsg}
            </Text>
            <Pressable
              style={({ pressed }) => [
                styles.retryBtn,
                { borderColor: colors.danger },
                pressed && { opacity: 0.7 },
              ]}
              onPress={() => {
                setErrorMsg('');
                if (showReview) {
                  void handleSendOffer();
                }
              }}
              accessibilityRole="button"
              accessibilityLabel="Retry submitting offer"
            >
              <Ionicons name="refresh-outline" size={15} color={colors.danger} />
              <Text style={[styles.retryBtnText, { color: colors.danger }]}>Retry</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>

      {/* ── Review overlay ──
            Full-screen confirmation step shown before the offer is
            submitted. Displays the offer amount, listing, and seller
            so the user can verify before committing. One dominant
            action (Confirm), one cancel (Back). */}
      {showReview && (
        <View style={styles.reviewOverlay}>
          <Pressable
            style={styles.reviewBackdrop}
            onPress={() => { if (!isSubmitting) setShowReview(false); }}
            accessibilityLabel="Cancel review"
            accessibilityRole="button"
          />
          <Reanimated.View
            entering={reducedMotionEnabled ? undefined : FadeInDown.duration(250)}
            style={[styles.reviewSheet, { backgroundColor: colors.background }]}
          >
            <View style={[styles.reviewHandle, { backgroundColor: colors.border }]} />
            <Text style={[styles.reviewTitle, { color: colors.textPrimary }]}>
              {isCounterOffer ? 'Review counter-offer' : 'Review your offer'}
            </Text>

            {/* Listing context */}
            <View style={styles.reviewItemRow}>
              <View style={[styles.itemThumb, { backgroundColor: colors.surfaceAlt }]}>
                {itemImageUri ? (
                  <CachedImage
                    uri={itemImageUri}
                    style={styles.itemThumbImage}
                    contentFit="cover"
                  />
                ) : (
                  <Ionicons name="shirt-outline" size={20} color={colors.textMuted} />
                )}
              </View>
              <View style={styles.reviewItemInfo}>
                <Text style={[styles.reviewItemTitle, { color: colors.textPrimary }]} numberOfLines={2}>
                  {title}
                </Text>
                <Text style={[styles.reviewItemPrice, { color: colors.textSecondary }]}>
                  Listed at {formatFromFiat(price, 'GBP')}
                </Text>
              </View>
            </View>

            {/* Offer amount — dominant */}
            <View style={[styles.reviewAmountBox, { backgroundColor: colors.surfaceAlt }]}>
              <Text style={[styles.reviewAmountLabel, { color: colors.textMuted }]}>
                {isCounterOffer ? 'Counter-offer amount' : 'Offer amount'}
              </Text>
              <Text style={[styles.reviewAmountValue, { color: colors.brand }]}>
                {formatFromFiat(numericOfferGbp, 'GBP')}
              </Text>
              {isCounterOffer && previousOffer != null && (
                <View style={styles.reviewCompareRow}>
                  <View style={styles.reviewCompareItem}>
                    <Text style={[styles.reviewCompareLabel, { color: colors.textMuted }]}>
                      Previous
                    </Text>
                    <Text style={[styles.reviewCompareValue, { color: colors.textSecondary }]}>
                      {formatFromFiat(previousOffer, 'GBP')}
                    </Text>
                  </View>
                  <Ionicons name="arrow-forward" size={16} color={colors.textMuted} />
                  <View style={styles.reviewCompareItem}>
                    <Text style={[styles.reviewCompareLabel, { color: colors.textMuted }]}>
                      New offer
                    </Text>
                    <Text style={[styles.reviewCompareValue, { color: colors.brand }]}>
                      {formatFromFiat(numericOfferGbp, 'GBP')}
                    </Text>
                  </View>
                </View>
              )}
              <Text style={[styles.reviewExpiry, { color: colors.textMuted }]}>
                Valid for {expiryHours} hours · seller must respond before expiry
              </Text>
            </View>

            {/* Summary rows */}
            <View style={[styles.reviewSummaryRow, { borderBottomColor: colors.borderSubtle }]}>
              <Text style={[styles.reviewSummaryLabel, { color: colors.textSecondary }]}>
                Platform charge
              </Text>
              <Text style={[styles.reviewSummaryValue, { color: colors.textPrimary }]}>
                {formatFromFiat(platformChargeGbp, 'GBP')}
              </Text>
            </View>
            <View style={styles.reviewTotalRow}>
              <Text style={[styles.reviewTotalLabel, { color: colors.textPrimary }]}>
                Total
              </Text>
              <Text style={[styles.reviewTotalValue, { color: colors.brand }]}>
                {formatFromFiat(total, 'GBP')}
              </Text>
            </View>

            {/* Error within review */}
            {!!errorMsg && (
              <View style={styles.errorBlock}>
                <Text style={[styles.errorText, { color: colors.danger }]}>
                  {errorMsg}
                </Text>
                <Pressable
                  style={({ pressed }) => [
                    styles.retryBtn,
                    { borderColor: colors.danger },
                    pressed && { opacity: 0.7 },
                  ]}
                  onPress={() => { setErrorMsg(''); void handleSendOffer(); }}
                  accessibilityRole="button"
                  accessibilityLabel="Retry submitting offer"
                >
                  <Ionicons name="refresh-outline" size={15} color={colors.danger} />
                  <Text style={[styles.retryBtnText, { color: colors.danger }]}>Retry</Text>
                </Pressable>
              </View>
            )}

            {/* Actions */}
            <View style={styles.reviewActions}>
              <Pressable
                style={({ pressed }) => [
                  styles.reviewCancelBtn,
                  { borderColor: colors.border },
                  pressed && { opacity: 0.7 },
                ]}
                onPress={() => { if (!isSubmitting) setShowReview(false); }}
                disabled={isSubmitting}
                accessibilityRole="button"
                accessibilityLabel="Go back to edit offer"
              >
                <Text style={[styles.reviewCancelText, { color: colors.textSecondary }]}>
                  Back
                </Text>
              </Pressable>
              <AppButton
                style={styles.reviewConfirmBtn}
                title={isSubmitting ? 'Sending…' : 'Confirm & send'}
                subtitle={formatFromFiat(total, 'GBP')}
                icon={isSubmitting ? undefined : <Ionicons name="paper-plane-outline" size={16} color={colors.textInverse} />}
                variant="primary"
                size="lg"
                onPress={handleSendOffer}
                disabled={isSubmitting}
                loading={isSubmitting}
                accessibilityLabel={`Confirm ${isCounterOffer ? 'counter-offer' : 'offer'} of ${formatFromFiat(numericOfferGbp, 'GBP')} on ${title}`}
              />
            </View>
          </Reanimated.View>
        </View>
      )}

      {/* ── Sticky footer ──
            Full-width CTA. In the compose phase, the button advances to
            the review step. In the review phase, the review sheet has its
            own confirm button. Per Design.md dock-geometry: single-action
            height, brand fill, full width. */}
      {!showReview && (
        <View style={[styles.footer, { backgroundColor: colors.background, borderTopColor: colors.border }]}>
          {isLoading ? (
            <View style={styles.footerLoading}>
              <ActivityIndicator size="small" color={colors.brand} />
              <Text style={[styles.footerLoadingText, { color: colors.textMuted }]}>
                Loading listing…
              </Text>
            </View>
          ) : (
            <AppButton
              style={styles.sendBtn}
              title={isCounterOffer ? 'Review counter-offer' : 'Review offer'}
              subtitle={formatFromFiat(total, 'GBP')}
              icon={<Ionicons name="arrow-forward-outline" size={16} color={colors.textInverse} />}
              variant="primary"
              size="lg"
              onPress={handleReviewOffer}
              disabled={numericOffer <= 0 || isSubmitting}
              loading={isSubmitting}
              accessibilityLabel={`Review ${isCounterOffer ? 'counter-offer' : 'offer'} of ${formatFromFiat(numericOfferGbp, 'GBP')} on ${title}`}
            />
          )}
        </View>
      )}
    </FlagshipScreen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: Space.md,
    paddingBottom: Space.xl,
  },
  // ── Item summary ──
  itemSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    paddingVertical: Space.md,
  },
  itemThumb: {
    width: Space.xxl + Space.sm,
    height: Space.xxl + Space.sm,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  itemThumbImage: {
    width: '100%',
    height: '100%',
  },
  itemInfo: {
    flex: 1,
    gap: Space.xs,
  },
  itemTitle: {
    fontSize: Type.subtitle.size,
    lineHeight: Type.subtitle.lineHeight,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.subtitle.letterSpacing,
  },
  itemListingPrice: {
    fontSize: Type.captionElevated.size,
    lineHeight: Type.captionElevated.lineHeight,
    fontFamily: Typography.family.regular,
  },
  // ── Message seller action ──
  messageAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingVertical: Space.sm + Space.xs,
    minHeight: Control.hit,
  },
  messageActionText: {
    flex: 1,
    fontSize: Type.bodyEmphasis.size,
    lineHeight: Type.bodyEmphasis.lineHeight,
    fontFamily: Typography.family.medium,
  },
  // ── Price input section ──
  priceSection: {
    paddingTop: Space.lg,
    paddingBottom: Space.md,
  },
  sectionLabel: {
    fontSize: Type.metaElevated.size,
    lineHeight: Type.metaElevated.lineHeight,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.metaElevated.letterSpacing,
    textTransform: 'uppercase',
    marginBottom: Space.md,
  },
  priceInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: Stroke.emphasis,
    paddingBottom: Space.xs,
  },
  currencySymbol: {
    fontSize: Type.display.size,
    fontFamily: Typography.family.bold,
    marginRight: Space.sm,
  },
  priceInput: {
    flex: 1,
    fontSize: Type.display.size + 8,
    fontFamily: Typography.family.bold,
    letterSpacing: Type.title.letterSpacing * 2,
    paddingVertical: Space.sm,
  },
  discountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Space.sm,
  },
  discountText: {
    fontSize: Type.captionElevated.size,
    lineHeight: Type.captionElevated.lineHeight,
    fontFamily: Typography.family.semibold,
  },
  // ── Quick offer chips ──
  quickOfferRow: {
    flexDirection: 'row',
    gap: Space.sm,
    marginTop: Space.md,
  },
  quickOfferChip: {
    flex: 1,
    paddingVertical: Space.sm + 2,
    borderRadius: Radius.md,
    borderWidth: Stroke.standard,
    alignItems: 'center',
    gap: Space.xs / 2,
  },
  quickOfferChipLabel: {
    fontSize: Type.bodyEmphasis.size,
    lineHeight: Type.bodyEmphasis.lineHeight,
    fontFamily: Typography.family.semibold,
  },
  quickOfferChipSub: {
    fontSize: Type.caption.size,
    lineHeight: Type.caption.lineHeight,
    fontFamily: Typography.family.regular,
  },
  // ── Context rows (counter-offer, seller minimum) ──
  contextRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 2,
    marginTop: Space.sm,
  },
  contextText: {
    fontSize: Type.captionElevated.size,
    lineHeight: Type.captionElevated.lineHeight,
    fontFamily: Typography.family.regular,
  },
  // ── Counter-offer side-by-side compare ──
  counterCompareBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    marginTop: Space.md,
    paddingVertical: Space.sm + 2,
    paddingHorizontal: Space.md,
    borderRadius: Radius.md,
  },
  counterCompareCol: {
    flex: 1,
    alignItems: 'center',
    gap: Space.xs / 2,
  },
  counterCompareLabel: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.meta.letterSpacing,
    textTransform: 'uppercase',
  },
  counterCompareValue: {
    fontSize: Type.bodyEmphasis.size,
    fontFamily: Typography.family.bold,
    fontVariant: ['tabular-nums'],
  },
  // ── Expiry section ──
  expirySection: {
    paddingTop: Space.lg,
    paddingBottom: Space.md,
  },
  expiryRow: {
    flexDirection: 'row',
    gap: Space.sm,
  },
  expiryChip: {
    flex: 1,
    paddingVertical: Space.sm + 2,
    borderRadius: Radius.md,
    borderWidth: Stroke.standard,
    alignItems: 'center',
  },
  expiryChipText: {
    fontSize: Type.bodyEmphasis.size,
    lineHeight: Type.bodyEmphasis.lineHeight,
    fontFamily: Typography.family.semibold,
  },
  expiryHint: {
    fontSize: Type.captionElevated.size,
    lineHeight: Type.captionElevated.lineHeight + 2,
    fontFamily: Typography.family.regular,
    marginTop: Space.sm,
  },
  // ── Summary section ──
  summarySection: {
    paddingTop: Space.lg,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Space.sm + 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
    minHeight: Control.hit,
  },
  summaryLabelCluster: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 2,
  },
  summaryLabel: {
    fontSize: Type.body.size,
    lineHeight: Type.body.lineHeight,
    fontFamily: Typography.family.regular,
  },
  summaryValue: {
    fontSize: Type.bodyEmphasis.size,
    lineHeight: Type.bodyEmphasis.lineHeight,
    fontFamily: Typography.family.semibold,
    fontVariant: ['tabular-nums'],
  },
  totalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Space.md,
    minHeight: Control.hit,
  },
  totalLabel: {
    fontSize: Type.bodyEmphasis.size,
    lineHeight: Type.bodyEmphasis.lineHeight,
    fontFamily: Typography.family.semibold,
  },
  totalValue: {
    fontSize: Type.priceList.size,
    lineHeight: Type.priceList.lineHeight,
    fontFamily: Typography.family.bold,
    letterSpacing: Type.priceList.letterSpacing,
    fontVariant: ['tabular-nums'],
  },
  // ── Trust signal ──
  trustRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Space.xs + 2,
    paddingTop: Space.lg,
  },
  trustText: {
    flex: 1,
    fontSize: Type.captionElevated.size,
    lineHeight: Type.captionElevated.lineHeight + 2,
    fontFamily: Typography.family.regular,
  },
  // ── Tip ──
  tipText: {
    fontSize: Type.captionElevated.size,
    lineHeight: Type.captionElevated.lineHeight + 4,
    fontFamily: Typography.family.regular,
    paddingTop: Space.md,
  },
  // ── Error ──
  errorText: {
    flex: 1,
    fontSize: Type.captionElevated.size,
    lineHeight: Type.captionElevated.lineHeight,
    fontFamily: Typography.family.medium,
  },
  errorBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    marginTop: Space.sm + 2,
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    paddingVertical: Space.xs + 2,
    paddingHorizontal: Space.sm + 2,
    borderRadius: Radius.md,
    borderWidth: Stroke.standard,
    minHeight: Control.hit,
  },
  retryBtnText: {
    fontSize: Type.captionElevated.size,
    fontFamily: Typography.family.semibold,
  },
  // ── Footer ──
  footer: {
    paddingHorizontal: Space.md,
    paddingTop: Space.md,
    paddingBottom: Platform.OS === 'ios' ? Space.lg : Space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  sendBtn: {
    width: '100%',
  },
  footerLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.sm,
    paddingVertical: Space.md,
  },
  footerLoadingText: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.regular,
  },
  // ── Review overlay ──
  reviewOverlay: {
    ...StyleSheet.absoluteFill,
    zIndex: 100,
  },
  reviewBackdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  reviewSheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    paddingHorizontal: Space.md,
    paddingTop: Space.sm,
    paddingBottom: Platform.OS === 'ios' ? Space.xl : Space.lg,
    maxHeight: '85%',
  },
  reviewHandle: {
    width: 36,
    height: 4,
    borderRadius: Radius.full,
    alignSelf: 'center',
    marginBottom: Space.md,
  },
  reviewTitle: {
    fontSize: Type.title.size,
    lineHeight: Type.title.lineHeight,
    fontFamily: Typography.family.bold,
    marginBottom: Space.md,
  },
  reviewItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    marginBottom: Space.md,
  },
  reviewItemInfo: {
    flex: 1,
    gap: Space.xs / 2,
  },
  reviewItemTitle: {
    fontSize: Type.body.size,
    lineHeight: Type.body.lineHeight,
    fontFamily: Typography.family.semibold,
  },
  reviewItemPrice: {
    fontSize: Type.captionElevated.size,
    lineHeight: Type.captionElevated.lineHeight,
    fontFamily: Typography.family.regular,
  },
  reviewAmountBox: {
    borderRadius: Radius.lg,
    padding: Space.md,
    alignItems: 'center',
    marginBottom: Space.md,
  },
  reviewAmountLabel: {
    fontSize: Type.metaElevated.size,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.metaElevated.letterSpacing,
    textTransform: 'uppercase',
    marginBottom: Space.xs,
  },
  reviewAmountValue: {
    fontSize: Type.display.size,
    fontFamily: Typography.family.bold,
    fontVariant: ['tabular-nums'],
  },
  reviewCompareRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    marginTop: Space.md,
    paddingTop: Space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(128,128,128,0.2)',
  },
  reviewCompareItem: {
    alignItems: 'center',
    flex: 1,
  },
  reviewCompareLabel: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.regular,
    marginBottom: Space.xs / 2,
  },
  reviewCompareValue: {
    fontSize: Type.bodyEmphasis.size,
    fontFamily: Typography.family.semibold,
    fontVariant: ['tabular-nums'],
  },
  reviewExpiry: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    marginTop: Space.sm,
    textAlign: 'center',
  },
  reviewSummaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Space.sm + 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
    minHeight: Control.hit,
  },
  reviewSummaryLabel: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.regular,
  },
  reviewSummaryValue: {
    fontSize: Type.bodyEmphasis.size,
    fontFamily: Typography.family.semibold,
    fontVariant: ['tabular-nums'],
  },
  reviewTotalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Space.md,
    minHeight: Control.hit,
  },
  reviewTotalLabel: {
    fontSize: Type.bodyEmphasis.size,
    fontFamily: Typography.family.semibold,
  },
  reviewTotalValue: {
    fontSize: Type.priceList.size,
    fontFamily: Typography.family.bold,
    fontVariant: ['tabular-nums'],
  },
  reviewActions: {
    flexDirection: 'row',
    gap: Space.sm,
    marginTop: Space.lg,
  },
  reviewCancelBtn: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: Space.md,
    paddingHorizontal: Space.lg,
    borderRadius: Radius.lg,
    borderWidth: Stroke.standard,
    minHeight: Control.hit,
  },
  reviewCancelText: {
    fontSize: Type.bodyEmphasis.size,
    fontFamily: Typography.family.semibold,
  },
  reviewConfirmBtn: {
    flex: 1,
  },
});
