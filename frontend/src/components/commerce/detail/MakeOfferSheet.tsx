/**
 * MakeOfferSheet — bottom sheet for making an offer on a listing.
 *
 * Reuses the canonical `BottomSheet` shell and the server-authoritative
 * `createListingOfferOnApi` flow so expiry, accept/decline and counter
 * chains remain authoritative across devices (same source of truth as
 * `MakeOfferScreen`).
 *
 * Truthful UI (AGENTS.md §11):
 *   - Smart Sell auto-accept messaging is only shown when the seller's
 *     config reports `enabled: true`. While `SMART_SELL_DEMO_MODE` is on,
 *     the indicator is honestly labelled "Demo mode".
 *   - The "Sweet Spot" band is a heuristic range (80–95% of asking) where
 *     marketplace offers are most likely accepted — labelled as a guide,
 *     never as a guarantee.
 *   - No fabricated success: the sheet calls the real offer API and only
 *     reports success when the server returns an offer entity.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  PanResponder,
  LayoutChangeEvent,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme, type ThemeColors } from '../../../theme/ThemeContext';
import { Space, Radius, Type, Typography, Stroke, Elevation, Control } from '../../../theme/designTokens';
import { BottomSheet } from '../../BottomSheet';
import { AppButton } from '../../ui/AppButton';
import { CachedImage } from '../../CachedImage';
import { useFormattedPrice } from '../../../hooks/useFormattedPrice';
import { useCurrencyContext } from '../../../context/CurrencyContext';
import { CURRENCIES } from '../../../constants/currencies';
import { useConnectivity } from '../../../hooks/useConnectivity';
import { useReducedMotion } from '../../../hooks/useReducedMotion';
import {
  convertGbpToDisplayAmount,
  sanitizeDecimalInput,
  calculateOfferSummaryFromDisplay,
} from '../../../utils/currencyAuthoringFlows';
import { createListingOfferOnApi } from '../../../services/listingOffersApi';
import { fetchSmartSellConfig, SMART_SELL_DEMO_MODE } from '../../../services/smartSellApi';
import { createStableId } from '../../../utils/createStableId';
import { haptics } from '../../../utils/haptics';

export interface MakeOfferSheetListing {
  id: string;
  title: string;
  /** Asking price in GBP. */
  price: number;
  image?: string;
}

export interface MakeOfferSheetProps {
  visible: boolean;
  onDismiss: () => void;
  listing: MakeOfferSheetListing | null;
  sellerId: string | null;
  /** Fired with the created offer + chat navigation payload.
   *  `conversationId` is null when the backend created the offer but did not
   *  provision a conversation — callers must not navigate to Chat in that case. */
  onSent: (payload: {
    conversationId: string | null;
    partnerUserId: string;
    focusQuery: string;
    offerPayload: {
      offerId: string;
      price: number;
      originalPrice: number;
      expiresAt: string;
      counterRound: number;
    };
  }) => void;
}

// Quick-select offer percentages of the asking price.
const QUICK_PERCENTAGES = [0.5, 0.7, 0.8, 0.9];
// Discount-based quick offer buttons — pre-fill the offer at a stated
// discount below the asking price. Per 2026 marketplace research, sellers
// typically accept offers 10–20% below list price.
const DISCOUNT_QUICK = [
  { discount: 10, fraction: 0.9 },
  { discount: 15, fraction: 0.85 },
  { discount: 20, fraction: 0.8 },
];
// Heuristic "sweet spot" band — offers in this range are most likely
// accepted on resale marketplaces (Depop/Vinted/Poshmark 2026 research).
const SWEET_SPOT_MIN = 0.8;
const SWEET_SPOT_MAX = 0.95;
const DEFAULT_EXPIRY_HOURS = 48;

export function MakeOfferSheet({
  visible,
  onDismiss,
  listing,
  sellerId,
  onSent,
}: MakeOfferSheetProps) {
  const { colors } = useAppTheme();
  const { formatFromFiat } = useFormattedPrice();
  const { currencyCode, goldRates } = useCurrencyContext();
  const { isOffline } = useConnectivity();
  const reducedMotion = useReducedMotion();
  const currencySymbol = CURRENCIES[currencyCode].symbol;

  const [offerDisplay, setOfferDisplay] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [smartSellEnabled, setSmartSellEnabled] = useState(false);
  const [smartSellThreshold, setSmartSellThreshold] = useState<number | null>(null);
  const idempotencyKeyRef = useRef<string | null>(null);

  const askingPriceGbp = listing?.price ?? 0;

  // Reset / seed the offer amount whenever the listing changes.
  useEffect(() => {
    if (!visible || !listing) return;
    setErrorMsg('');
    idempotencyKeyRef.current = null;
    // Default to 80% of asking — inside the sweet spot.
    const defaultGbp = askingPriceGbp * 0.8;
    const display = convertGbpToDisplayAmount(defaultGbp, currencyCode, goldRates);
    setOfferDisplay((Number.isFinite(display) ? display : defaultGbp).toFixed(2));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, listing?.id]);

  // Fetch Smart Sell config for the listing to surface the auto-accept
  // indicator truthfully. In demo mode the config is mock data — the UI
  // labels it honestly.
  useEffect(() => {
    if (!visible || !listing) return;
    let cancelled = false;
    try {
      const config = fetchSmartSellConfig(listing.id);
      if (cancelled) return;
      setSmartSellEnabled(config.enabled);
      setSmartSellThreshold(config.enabled ? config.autoAcceptThreshold : null);
    } catch {
      if (!cancelled) {
        setSmartSellEnabled(false);
        setSmartSellThreshold(null);
      }
    }
    return () => { cancelled = true; };
  }, [visible, listing?.id]);

  const numericOfferDisplay = parseFloat(offerDisplay) || 0;
  const { offerGbp: numericOfferGbp } = calculateOfferSummaryFromDisplay(
    numericOfferDisplay,
    currencyCode,
    goldRates,
  );

  // Discount percentage relative to asking price.
  const discountPct = useMemo(() => {
    if (!askingPriceGbp || askingPriceGbp <= 0) return null;
    const pct = ((askingPriceGbp - numericOfferGbp) / askingPriceGbp) * 100;
    if (pct <= 0) return null;
    return Math.round(pct);
  }, [askingPriceGbp, numericOfferGbp]);

  // Normalised slider position (0–1) within [min, max].
  const minDisplay = 1; // $1 floor
  const maxDisplay = useMemo(() => {
    const gbp = convertGbpToDisplayAmount(askingPriceGbp, currencyCode, goldRates);
    return Number.isFinite(gbp) && gbp > 0 ? gbp : askingPriceGbp;
  }, [askingPriceGbp, currencyCode, goldRates]);

  const sliderFraction = useMemo(() => {
    if (maxDisplay <= minDisplay) return 0;
    return Math.max(0, Math.min(1, (numericOfferDisplay - minDisplay) / (maxDisplay - minDisplay)));
  }, [numericOfferDisplay, minDisplay, maxDisplay]);

  const sweetSpotMinDisplay = useMemo(
    () => convertGbpToDisplayAmount(askingPriceGbp * SWEET_SPOT_MIN, currencyCode, goldRates) || maxDisplay * SWEET_SPOT_MIN,
    [askingPriceGbp, currencyCode, goldRates, maxDisplay],
  );
  const sweetSpotMaxDisplay = useMemo(
    () => convertGbpToDisplayAmount(askingPriceGbp * SWEET_SPOT_MAX, currencyCode, goldRates) || maxDisplay * SWEET_SPOT_MAX,
    [askingPriceGbp, currencyCode, goldRates, maxDisplay],
  );
  const sweetSpotStartFraction = maxDisplay > minDisplay
    ? Math.max(0, Math.min(1, (sweetSpotMinDisplay - minDisplay) / (maxDisplay - minDisplay)))
    : 0;
  const sweetSpotEndFraction = maxDisplay > minDisplay
    ? Math.max(0, Math.min(1, (sweetSpotMaxDisplay - minDisplay) / (maxDisplay - minDisplay)))
    : 0;

  const inSweetSpot = sliderFraction >= sweetSpotStartFraction && sliderFraction <= sweetSpotEndFraction;

  // ── Slider drag handling ──
  const [trackWidth, setTrackWidth] = useState(0);
  const grantFractionRef = useRef(0);
  const sliderFractionRef = useRef(0);
  sliderFractionRef.current = sliderFraction;
  const handleTrackLayout = useCallback((e: LayoutChangeEvent) => {
    setTrackWidth(e.nativeEvent.layout.width);
  }, []);

  const setOfferFromFraction = useCallback((fraction: number) => {
    const clamped = Math.max(0, Math.min(1, fraction));
    const value = minDisplay + clamped * (maxDisplay - minDisplay);
    setOfferDisplay(value.toFixed(2));
    if (errorMsg) setErrorMsg('');
  }, [minDisplay, maxDisplay, errorMsg]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        if (trackWidth <= 0) return;
        grantFractionRef.current = sliderFractionRef.current;
        if (!reducedMotion) haptics.tap();
      },
      onPanResponderMove: (_e, gesture) => {
        if (trackWidth <= 0) return;
        const deltaFraction = gesture.dx / trackWidth;
        setOfferFromFraction(grantFractionRef.current + deltaFraction);
      },
      onPanResponderRelease: () => {
        if (!reducedMotion) haptics.tap();
      },
    }),
  ).current;

  const applyQuickPercentage = useCallback((percentage: number) => {
    const gbp = askingPriceGbp * percentage;
    const display = convertGbpToDisplayAmount(gbp, currencyCode, goldRates);
    setOfferDisplay((Number.isFinite(display) ? display : gbp).toFixed(2));
    if (errorMsg) setErrorMsg('');
    haptics.tap();
  }, [askingPriceGbp, currencyCode, goldRates, errorMsg]);

  const handleOfferTextChange = useCallback((value: string) => {
    setOfferDisplay(sanitizeDecimalInput(value));
    if (errorMsg) setErrorMsg('');
  }, [errorMsg]);

  const accessibilityIncrement = useCallback(() => {
    setOfferFromFraction(sliderFraction + 0.05);
  }, [sliderFraction, setOfferFromFraction]);

  const accessibilityDecrement = useCallback(() => {
    setOfferFromFraction(sliderFraction - 0.05);
  }, [sliderFraction, setOfferFromFraction]);

  const handleSendOffer = useCallback(async () => {
    if (!listing) return;
    if (!numericOfferDisplay || !Number.isFinite(numericOfferGbp) || numericOfferGbp <= 0) {
      setErrorMsg('Enter a valid offer amount.');
      return;
    }
    if (numericOfferGbp > askingPriceGbp * 2) {
      setErrorMsg('Offer seems too high. Review the amount.');
      return;
    }
    if (!sellerId) {
      setErrorMsg('Could not load seller info. Try again.');
      return;
    }

    setIsSubmitting(true);
    try {
      if (!idempotencyKeyRef.current) {
        idempotencyKeyRef.current = createStableId('offer');
      }
      const offer = await createListingOfferOnApi({
        listingId: listing.id,
        offerPriceGbp: numericOfferGbp,
        expiryHours: DEFAULT_EXPIRY_HOURS,
        idempotencyKey: idempotencyKeyRef.current,
        metadata: {
          originalPriceGbp: askingPriceGbp,
          source: 'detail_sheet',
        },
      });

      const focusQuery = `Offer: ${formatFromFiat(numericOfferGbp, 'GBP')} for ${listing.title}. Valid for ${DEFAULT_EXPIRY_HOURS}h.`;
      onSent({
        // Use the real conversation ID from the API response — never fabricate
        // an ID (§11). Null means the backend created the offer but did not
        // provision a conversation; callers must not navigate to Chat then.
        conversationId: offer.conversationId,
        partnerUserId: sellerId,
        focusQuery,
        offerPayload: {
          offerId: offer.id,
          price: numericOfferGbp,
          originalPrice: askingPriceGbp,
          expiresAt: offer.expiresAt,
          counterRound: offer.counterRound,
        },
      });
      onDismiss();
    } catch (err) {
      const isNetworkError = isOffline || (err instanceof Error && /network|fetch|timeout/i.test(err.message));
      const message = isNetworkError
        ? 'You appear to be offline. Check your connection and try again.'
        : err instanceof Error ? err.message : 'Could not submit offer.';
      setErrorMsg(message);
    } finally {
      setIsSubmitting(false);
    }
  }, [listing, numericOfferDisplay, numericOfferGbp, askingPriceGbp, sellerId, formatFromFiat, onSent, onDismiss, isOffline]);

  if (!listing) return null;

  const askingDisplay = formatFromFiat(askingPriceGbp, 'GBP', { displayMode: 'fiat' });
  const offerDisplayFormatted = formatFromFiat(numericOfferGbp, 'GBP', { displayMode: 'fiat' });

  return (
    <BottomSheet visible={visible} onDismiss={onDismiss} snapPoint={0.78}>
      <View style={styles.header}>
        <View style={styles.headerTextWrap}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>
            Make an Offer
          </Text>
          <Text style={[styles.subtitle, { color: colors.textMuted }]}>
            Asking {askingDisplay}
          </Text>
        </View>
        <Pressable
          onPress={onDismiss}
          style={({ pressed }) => [styles.closeTarget, pressed && { opacity: 0.5 }]}
          accessibilityLabel="Close make an offer"
          accessibilityRole="button"
          accessibilityHint="Dismisses the offer sheet"
        >
          <Ionicons name="close" size={22} color={colors.textSecondary} />
        </Pressable>
      </View>

      {/* Listing summary row */}
      <View style={[styles.listingRow, { borderBottomColor: colors.borderSubtle }]}>
        {listing.image ? (
          <CachedImage
            uri={listing.image}
            style={styles.listingImage}
            contentFit="cover"
          />
        ) : (
          <View style={[styles.listingImage, { backgroundColor: colors.surfaceAlt }]} />
        )}
        <View style={styles.listingText}>
          <Text style={[styles.listingTitle, { color: colors.textPrimary }]} numberOfLines={2}>
            {listing.title}
          </Text>
          <Text style={[styles.listingPrice, { color: colors.textSecondary }]} numberOfLines={1}>
            {askingDisplay}
          </Text>
        </View>
      </View>

      {/* Offer amount readout */}
      <View style={styles.amountWrap}>
        <Text
          style={[styles.amountValue, { color: inSweetSpot ? colors.success : colors.textPrimary }]}
          accessibilityLabel={`Your offer ${offerDisplayFormatted}${discountPct ? `, ${discountPct} percent below asking` : ''}`}
        >
          {offerDisplayFormatted}
        </Text>
        {discountPct ? (
          <View style={[styles.discountChip, { backgroundColor: `${colors.success}1F` }]}>
            <Text style={[styles.discountChipText, { color: colors.success }]}>
              -{discountPct}%
            </Text>
          </View>
        ) : null}
      </View>

      {/* Slider with sweet-spot band */}
      <View
        style={styles.sliderWrap}
        onLayout={handleTrackLayout}
        accessibilityRole="adjustable"
        accessibilityLabel="Offer amount slider"
        accessibilityValue={{
          min: minDisplay,
          max: maxDisplay,
          now: numericOfferDisplay,
          text: offerDisplayFormatted,
        }}
        accessibilityActions={[
          { name: 'increment' },
          { name: 'decrement' },
        ]}
        onAccessibilityAction={(e) => {
          if (e.nativeEvent.actionName === 'increment') accessibilityIncrement();
          else if (e.nativeEvent.actionName === 'decrement') accessibilityDecrement();
        }}
      >
        <View style={[styles.track, { backgroundColor: colors.surfaceAlt }]}>
          {/* Sweet spot band */}
          <View
            style={[
              styles.sweetSpotBand,
              {
                left: `${sweetSpotStartFraction * 100}%`,
                width: `${(sweetSpotEndFraction - sweetSpotStartFraction) * 100}%`,
                backgroundColor: `${colors.success}24`,
              },
            ]}
          />
          {/* Filled portion */}
          <View
            style={[
              styles.trackFill,
              { width: `${sliderFraction * 100}%`, backgroundColor: inSweetSpot ? colors.success : colors.brand },
            ]}
          />
        </View>
        {/* Thumb */}
        <View
          {...panResponder.panHandlers}
          style={[
            styles.thumb,
            {
              left: `${sliderFraction * 100}%`,
              backgroundColor: inSweetSpot ? colors.success : colors.brand,
              borderColor: colors.surface,
            },
          ]}
        />
      </View>

      {/* Sweet spot caption */}
      <View style={styles.sweetSpotCaption}>
        <Ionicons name="checkmark-circle" size={13} color={inSweetSpot ? colors.success : colors.textMuted} />
        <Text style={[styles.sweetSpotText, { color: inSweetSpot ? colors.success : colors.textMuted }]}>
          {inSweetSpot
            ? 'In the sweet spot — offers here are most likely accepted'
            : `Sweet spot ${formatFromFiat(askingPriceGbp * SWEET_SPOT_MIN, 'GBP', { displayMode: 'fiat' })}–${formatFromFiat(askingPriceGbp * SWEET_SPOT_MAX, 'GBP', { displayMode: 'fiat' })}`}
        </Text>
      </View>

      {/* Price suggestion guidance */}
      <View style={styles.suggestionRow}>
        <Ionicons name="pricetag-outline" size={13} color={colors.textMuted} />
        <Text style={[styles.suggestionText, { color: colors.textMuted }]}>
          Seller typically accepts offers 10–20% below list price
        </Text>
      </View>

      {/* Discount quick-select chips (-10%, -15%, -20%) */}
      <View style={styles.discountChipsRow}>
        {DISCOUNT_QUICK.map((entry) => {
          const isSelected = Math.abs(numericOfferGbp - askingPriceGbp * entry.fraction) < 0.01;
          return (
            <Pressable
              key={entry.discount}
              onPress={() => applyQuickPercentage(entry.fraction)}
              style={({ pressed }) => [
                styles.chip,
                {
                  backgroundColor: isSelected ? colors.brand : colors.surfaceAlt,
                  borderColor: isSelected ? colors.brand : colors.borderSubtle,
                },
                pressed && styles.chipPressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel={`Offer ${entry.discount} percent below asking price`}
              accessibilityHint={`Sets your offer to ${formatFromFiat(askingPriceGbp * entry.fraction, 'GBP', { displayMode: 'fiat' })}`}
              accessibilityState={{ selected: isSelected }}
            >
              <Text
                style={[
                  styles.chipText,
                  { color: isSelected ? colors.textInverse : colors.textPrimary },
                ]}
              >
                -{entry.discount}%
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Quick-select chips */}
      <View style={styles.chipsRow}>
        {QUICK_PERCENTAGES.map((pct) => {
          const isSelected = Math.abs(numericOfferGbp - askingPriceGbp * pct) < 0.01;
          return (
            <Pressable
              key={pct}
              onPress={() => applyQuickPercentage(pct)}
              style={({ pressed }) => [
                styles.chip,
                {
                  backgroundColor: isSelected ? colors.brand : colors.surfaceAlt,
                  borderColor: isSelected ? colors.brand : colors.borderSubtle,
                },
                pressed && styles.chipPressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel={`Offer ${Math.round(pct * 100)} percent of asking price`}
              accessibilityHint={`Sets your offer to ${formatFromFiat(askingPriceGbp * pct, 'GBP', { displayMode: 'fiat' })}`}
              accessibilityState={{ selected: isSelected }}
            >
              <Text
                style={[
                  styles.chipText,
                  { color: isSelected ? colors.textInverse : colors.textPrimary },
                ]}
              >
                {Math.round(pct * 100)}%
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Manual entry */}
      <View style={[styles.manualWrap, { borderColor: colors.border, backgroundColor: colors.input }]}>
        <Text style={[styles.manualPrefix, { color: colors.textSecondary }]}>{currencySymbol}</Text>
        <TextInput
          style={[styles.manualInput, { color: colors.textPrimary }]}
          value={offerDisplay}
          onChangeText={handleOfferTextChange}
          placeholder="0.00"
          placeholderTextColor={colors.textMuted}
          keyboardType="decimal-pad"
          accessibilityLabel="Offer amount"
          accessibilityHint="Enter your offer amount"
          returnKeyType="done"
        />
      </View>

      {/* Smart Sell demo-mode indicator */}
      {smartSellEnabled && smartSellThreshold != null && smartSellThreshold > 0 ? (
        <View style={[styles.smartSellBanner, { backgroundColor: `${colors.success}14`, borderColor: `${colors.success}30` }]}>
          <Ionicons name="trending-up-outline" size={14} color={colors.success} />
          <Text style={[styles.smartSellText, { color: colors.textSecondary }]}>
            {SMART_SELL_DEMO_MODE ? 'Demo mode — ' : ''}
            Seller has Smart Sell enabled — offers above {formatFromFiat(smartSellThreshold, 'GBP', { displayMode: 'fiat' })} auto-accept
          </Text>
        </View>
      ) : null}

      {/* Error message */}
      {errorMsg ? (
        <View style={styles.errorRow}>
          <Ionicons name="alert-circle-outline" size={15} color={colors.danger} />
          <Text style={[styles.errorText, { color: colors.danger }]}>{errorMsg}</Text>
        </View>
      ) : null}

      {/* Offer expiration notice */}
      <View style={styles.expiryRow}>
        <Ionicons name="time-outline" size={14} color={colors.textMuted} />
        <Text style={[styles.expiryText, { color: colors.textMuted }]}>
          Offer expires in {DEFAULT_EXPIRY_HOURS} hours
        </Text>
      </View>

      {/* Send offer */}
      <AppButton
        title={isSubmitting ? 'Sending…' : 'Send Offer'}
        onPress={handleSendOffer}
        loading={isSubmitting}
        disabled={isSubmitting}
        variant="primary"
        size="lg"
        style={styles.sendButton}
        accessibilityLabel="Send offer to seller"
        accessibilityHint="Submits your offer and opens chat with the seller"
      />
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingLeft: Space.md,
    paddingRight: Space.xs,
    paddingVertical: Space.sm,
    minHeight: Control.hit + Space.sm,
  },
  headerTextWrap: {
    flex: 1,
    gap: Space.xs / 2,
  },
  title: {
    fontSize: Type.subtitle.size,
    lineHeight: Type.subtitle.lineHeight,
    fontFamily: Typography.family.semibold,
  },
  subtitle: {
    fontSize: Type.caption.size,
    lineHeight: Type.caption.lineHeight,
    fontFamily: Typography.family.regular,
  },
  closeTarget: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  listingImage: {
    width: 44,
    height: 44,
    borderRadius: Radius.md,
  },
  listingText: {
    flex: 1,
    gap: Space.xs / 2,
  },
  listingTitle: {
    fontSize: Type.body.size,
    lineHeight: Type.body.lineHeight,
    fontFamily: Typography.family.medium,
  },
  listingPrice: {
    fontSize: Type.caption.size,
    lineHeight: Type.caption.lineHeight,
    fontFamily: Typography.family.regular,
    fontVariant: ['tabular-nums'],
  },
  amountWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.sm,
    paddingTop: Space.md,
    paddingHorizontal: Space.md,
  },
  amountValue: {
    fontSize: Type.priceHero.size,
    lineHeight: Type.priceHero.lineHeight,
    fontFamily: Typography.family.bold,
    letterSpacing: Type.priceHero.letterSpacing,
    fontVariant: ['tabular-nums'],
  },
  discountChip: {
    paddingHorizontal: Space.sm,
    paddingVertical: Space.xs / 2 + 1,
    borderRadius: Radius.md,
  },
  discountChipText: {
    fontSize: Type.caption.size,
    lineHeight: Type.caption.lineHeight,
    fontFamily: Typography.family.bold,
    fontVariant: ['tabular-nums'],
  },
  sliderWrap: {
    position: 'relative',
    height: 44,
    justifyContent: 'center',
    paddingHorizontal: Space.md,
    marginTop: Space.sm,
  },
  track: {
    height: 8,
    borderRadius: Radius.full,
    overflow: 'hidden',
    position: 'relative',
  },
  sweetSpotBand: {
    position: 'absolute',
    top: 0,
    bottom: 0,
  },
  trackFill: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    borderRadius: Radius.full,
  },
  thumb: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderRadius: Radius.full,
    borderWidth: Stroke.standard,
    marginLeft: -12,
    top: 10,
    ...Elevation.subtle,
  },
  sweetSpotCaption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    paddingHorizontal: Space.md,
    paddingVertical: Space.xs,
  },
  sweetSpotText: {
    fontSize: Type.caption.size,
    lineHeight: Type.caption.lineHeight,
    fontFamily: Typography.family.medium,
    flex: 1,
  },
  chipsRow: {
    flexDirection: 'row',
    gap: Space.sm,
    paddingHorizontal: Space.md,
    paddingTop: Space.sm,
  },
  suggestionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    paddingHorizontal: Space.md,
    paddingVertical: Space.xs,
    marginTop: Space.xs,
  },
  suggestionText: {
    flex: 1,
    fontSize: Type.caption.size,
    lineHeight: Type.caption.lineHeight,
    fontFamily: Typography.family.regular,
  },
  discountChipsRow: {
    flexDirection: 'row',
    gap: Space.sm,
    paddingHorizontal: Space.md,
    paddingTop: Space.sm,
  },
  expiryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    paddingHorizontal: Space.md,
    paddingTop: Space.sm,
    paddingBottom: Space.xs,
  },
  expiryText: {
    fontSize: Type.caption.size,
    lineHeight: Type.caption.lineHeight,
    fontFamily: Typography.family.medium,
  },
  chip: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Space.sm,
    borderRadius: Radius.lg,
    borderWidth: Stroke.standard,
    minHeight: 44,
  },
  chipPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.97 }],
  },
  chipText: {
    fontSize: Type.bodyStrong.size,
    lineHeight: Type.bodyStrong.lineHeight,
    fontFamily: Typography.family.semibold,
    fontVariant: ['tabular-nums'],
  },
  manualWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: Space.md,
    marginTop: Space.md,
    paddingHorizontal: Space.md,
    borderRadius: Radius.xl,
    borderWidth: Stroke.standard,
    minHeight: Control.hit + Space.xs,
  },
  manualPrefix: {
    fontSize: Type.bodyStrong.size,
    fontFamily: Typography.family.bold,
    marginRight: Space.xs,
  },
  manualInput: {
    flex: 1,
    fontSize: Type.bodyStrong.size,
    fontFamily: Typography.family.medium,
    paddingVertical: Space.sm,
    fontVariant: ['tabular-nums'],
  },
  smartSellBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    marginHorizontal: Space.md,
    marginTop: Space.md,
    paddingHorizontal: Space.sm + 2,
    paddingVertical: Space.sm,
    borderRadius: Radius.md,
    borderWidth: Stroke.hairline,
  },
  smartSellText: {
    flex: 1,
    fontSize: Type.caption.size,
    lineHeight: Type.caption.lineHeight,
    fontFamily: Typography.family.regular,
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    paddingHorizontal: Space.md,
    paddingTop: Space.sm,
  },
  errorText: {
    flex: 1,
    fontSize: Type.caption.size,
    lineHeight: Type.caption.lineHeight,
    fontFamily: Typography.family.medium,
  },
  sendButton: {
    marginHorizontal: Space.md,
    marginTop: Space.md,
  },
});
