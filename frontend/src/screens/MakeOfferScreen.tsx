import React, { useState, useMemo } from 'react';
import { Space, Type, Typography, Radius } from '../theme/designTokens';
import {
  AnimatedPressable,
} from '../components/AnimatedPressable';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  ScrollView,
  StatusBar,
  Platform,
  Pressable,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { StackScreenProps } from '@react-navigation/stack';
import { RootStackParamList } from '../navigation/types';
import { useAppTheme } from '../theme/ThemeContext';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { useCurrencyContext } from '../context/CurrencyContext';
import { CURRENCIES } from '../constants/currencies';
import { useToast } from '../context/ToastContext';
import {
  calculateOfferSummaryFromDisplay,
  convertGbpToDisplayAmount,
  sanitizeDecimalInput,
} from '../utils/currencyAuthoringFlows';
import { AppButton } from '../components/ui/AppButton';
import { ScreenHeader } from '../components/ui/ScreenHeader';
import { CachedImage } from '../components/CachedImage';
import { fetchListingByIdFromApi } from '../services/listingsApi';
import {
  counterListingOfferOnApi,
  createListingOfferOnApi,
} from '../services/listingOffersApi';
import { haptics } from '../utils/haptics';
import { createStableId } from '../utils/createStableId';

type Props = StackScreenProps<RootStackParamList, 'MakeOffer'>;

export default function MakeOfferScreen({ navigation, route }: Props) {
  const { itemId, price, title } = route.params;
  const { colors, isDark } = useAppTheme();
  const insets = useSafeAreaInsets();
  const { formatFromFiat } = useFormattedPrice();
  const { currencyCode, goldRates } = useCurrencyContext();
  const { show } = useToast();
  const currencySymbol = CURRENCIES[currencyCode].symbol;
  const [offerPrice, setOfferPrice] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [listing, setListing] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [expiryHours, setExpiryHours] = useState(48);
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

  const handleSendOffer = async () => {
    if (!numericOffer || !Number.isFinite(numericOfferGbp) || numericOfferGbp <= 0) {
      setErrorMsg('Enter a valid offer amount.');
      return;
    }
    if (numericOfferGbp > price * 2) {
      setErrorMsg('Offer seems too high. Please review the amount.');
      return;
    }
    // Check against seller's minimum offer floor (if set on the listing)
    const sellerMinOffer = listing?.minimumOfferGbp ?? listing?.minimum_offer_gbp ?? 0;
    if (sellerMinOffer > 0 && numericOfferGbp < sellerMinOffer) {
      setErrorMsg(`Seller's minimum offer is ${formatFromFiat(sellerMinOffer, 'GBP')}.`);
      return;
    }
    if (!listing?.sellerId) {
      setErrorMsg('Could not load seller info. Please try again.');
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
      const message = err instanceof Error ? err.message : 'Could not submit offer.';
      setErrorMsg(message);
      show('Could not submit offer. Please try again.', 'error');
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
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={!isDark ? 'dark-content' : 'light-content'} backgroundColor={colors.background} />

      <ScreenHeader
        title={isCounterOffer ? 'Counter-offer' : 'Make offer'}
        onBack={() => navigation.goBack()}
        backIcon="close"
      />

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Item summary ──
            Compact, flat, no card. Image + title + listed price + message
            action. Per AGENTS.md surface budget: flat canvas, no cards. */}
        <View style={styles.itemSummary}>
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
        </View>

        {/* ── Message seller action ──
            Inline quiet action, not a bordered chip. Per Design.md:
            quiet controls are transparent, no decorative chrome. */}
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

        {/* ── Price input ──
            Large, centered price field. The currency symbol and amount
            are the dominant visual element. No heavy border — the input
            sits on the flat canvas with a subtle bottom hairline.
            Per Design.md form-field: input background, 52px height,
            Radius.xl. But for a price entry field, we want it to feel
            like a number, not a form field — so we use a larger,
            centered layout with a hairline underline. */}
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

          {/* Counter-offer context — previous offer reference */}
          {isCounterOffer && previousOffer && (
            <View style={styles.contextRow}>
              <Ionicons name="arrow-undo-outline" size={14} color={colors.textMuted} />
              <Text style={[styles.contextText, { color: colors.textMuted }]}>
                Previous offer was {formatFromFiat(previousOffer, 'GBP')}
              </Text>
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

        {/* ── Offer expiry ──
            Clean chip selector with selection state. Per Design.md:
            selected state uses brand fill, unselected uses surfaceAlt. */}
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

        {/* ── Summary ──
            Flat rows with hairline separator, not a card. Per AGENTS.md
            surface budget: flat canvas, hairlines, no cards. */}
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

        {/* ── Trust signal ──
            Inline buyer protection note, not a card. Per Design.md:
            trust signals are decision inputs, not decoration. */}
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

        {!!errorMsg && (
          <Text style={[styles.errorText, { color: colors.danger }]}>
            {errorMsg}
          </Text>
        )}
      </ScrollView>

      {/* ── Sticky footer ──
            Full-width CTA with total subtitle. Per Design.md dock-geometry:
            single-action height, brand fill, full width. */}
      <View style={[styles.footer, { backgroundColor: colors.background, borderTopColor: colors.border }]}>
        <AppButton
          style={styles.sendBtn}
          title={
            isSubmitting
              ? 'Submitting…'
              : isCounterOffer
              ? 'Send counter-offer'
              : 'Send offer via chat'
          }
          subtitle={formatFromFiat(total, 'GBP')}
          icon={<Ionicons name="paper-plane-outline" size={16} color={colors.textInverse} />}
          variant="primary"
          size="lg"
          onPress={handleSendOffer}
          disabled={numericOffer <= 0 || isSubmitting}
          loading={isSubmitting}
          accessibilityLabel={`Send ${isCounterOffer ? 'counter-offer' : 'offer'} totaling ${formatFromFiat(total, 'GBP')} via chat`}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
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
    width: 56,
    height: 56,
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
    minHeight: 44,
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
    borderBottomWidth: 2,
    paddingBottom: Space.xs,
  },
  currencySymbol: {
    fontSize: 32,
    fontFamily: Typography.family.bold,
    marginRight: Space.sm,
  },
  priceInput: {
    flex: 1,
    fontSize: 40,
    fontFamily: Typography.family.bold,
    letterSpacing: -1.2,
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
    borderWidth: 1,
    alignItems: 'center',
    gap: 2,
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
    borderWidth: 1,
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
    minHeight: 44,
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
    minHeight: 44,
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
    fontSize: Type.captionElevated.size,
    lineHeight: Type.captionElevated.lineHeight,
    fontFamily: Typography.family.medium,
    marginTop: Space.sm + 2,
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
});
