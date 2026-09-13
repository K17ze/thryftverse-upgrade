import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
  View,
  StyleSheet,
  StatusBar,
  Text,
  Platform,
  ScrollView,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQueryClient } from '@tanstack/react-query';
import { RootStackParamList } from '../navigation/types';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { useStore } from '../store/useStore';
import { useToast } from '../context/ToastContext';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { useCurrencyContext } from '../context/CurrencyContext';
import { toFiat, toIze, formatIzeAmount } from '../utils/currency';
import { useBackendData } from '../context/BackendDataContext';
import type { Listing } from '../domain';
import { CachedImage } from '../components/CachedImage';
import { getListingCoverUri } from '../utils/media';
import { AppButton } from '../components/ui/AppButton';
import { AppInput } from '../components/ui/AppInput';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { Space, Radius, Typography, Stroke, Control } from '../theme/designTokens';
import { TypographyV2 } from '../theme/typography.v2';
import { createAuction } from '../services/marketApi';
import { createStableId } from '../utils/createStableId';
import { t } from '../i18n';
import { EmptyState } from '../components/EmptyState';
import { KeyboardAwareScrollView } from '../platform/keyboard/KeyboardProvider';
import { queryKeys } from '../platform/server/queryKeys';
import { AuctionBidLadderPreview } from '../components/auction/AuctionBidLadderPreview';
import { haptics } from '../utils/haptics';

type NavT = NativeStackNavigationProp<RootStackParamList>;
type RouteT = RouteProp<RootStackParamList, 'CreateAuction'>;

const DURATION_OPTIONS = [
  { label: '3h Blitz', hours: 3, subtitle: 'High intensity' },
  { label: '6h Prime', hours: 6, subtitle: 'Standard window' },
  { label: '12h Evening', hours: 12, subtitle: 'Cross-timezone' },
  { label: '24h Full Day', hours: 24, subtitle: 'Maximum reach' },
  { label: '3d Archive', hours: 72, subtitle: 'Collector piece' },
];

const START_WINDOWS = [
  { label: 'Live Drop Now', minutes: 0, icon: 'flash' as const, badge: 'Instant' },
  { label: 'In 30 Minutes', minutes: 30, icon: 'time-outline' as const, badge: 'Teaser' },
  { label: 'In 1 Hour', minutes: 60, icon: 'time-outline' as const, badge: 'Primetime' },
  { label: 'In 3 Hours', minutes: 180, icon: 'flame-outline' as const, badge: 'Peak Traffic' },
];

export default function CreateAuctionScreen() {
  const { colors, isDark } = useAppTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const navigation = useNavigation<NavT>();
  const route = useRoute<RouteT>();
  const { show } = useToast();
  const { formatFromFiat } = useFormattedPrice();
  const { currencyCode, fxRates } = useCurrencyContext();
  const { listings, refreshListings } = useBackendData();
  const queryClient = useQueryClient();

  const currentUser = useStore((state) => state.currentUser);
  const sellerId = currentUser?.id;

  const sellerListings = useMemo(() => {
    if (!sellerId) return [];
    return listings.filter((item) => item.sellerId === sellerId);
  }, [listings, sellerId]);

  // Support route param listingId if coming from Sell or other screens
  const initialListingId = route.params?.listingId ?? sellerListings[0]?.id ?? '';
  const [selectedListingId, setSelectedListingId] = useState(initialListingId);
  const [startInMinutes, setStartInMinutes] = useState(0);
  const [durationHours, setDurationHours] = useState(6);
  const [startingBidInput, setStartingBidInput] = useState('');
  const [reservePriceInput, setReservePriceInput] = useState('');
  const [buyNowEnabled, setBuyNowEnabled] = useState(true);
  const [buyNowInput, setBuyNowInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [stage, setStage] = useState<0 | 1>(0); // 0: Drop & Schedule, 1: Economics & Ladder
  const [showItemPicker, setShowItemPicker] = useState(false);

  const [resultData, setResultData] = useState<{
    auctionId: string;
    title: string;
    imageUrl: string;
    startLabel: string;
    durationLabel: string;
    startingBid: string;
    reservePrice: string | null;
    buyNow: string | null;
  } | null>(null);

  const fromGbpToDisplay = useCallback(
    (amountGbp: number) => {
      if (currencyCode === 'GBP') return amountGbp;
      const amountIze = toIze(amountGbp, 'GBP', fxRates);
      return toFiat(amountIze, currencyCode, fxRates);
    },
    [currencyCode, fxRates]
  );

  const fromDisplayToGbp = useCallback(
    (amountDisplay: number) => {
      if (currencyCode === 'GBP') return amountDisplay;
      const amountIze = toIze(amountDisplay, currencyCode, fxRates);
      return toFiat(amountIze, 'GBP', fxRates);
    },
    [currencyCode, fxRates]
  );

  useEffect(() => {
    if (!sellerListings.length) return;
    if (!sellerListings.some((item) => item.id === selectedListingId)) {
      setSelectedListingId(sellerListings[0].id);
    }
  }, [sellerListings, selectedListingId]);

  const selectedListing = useMemo(
    () => sellerListings.find((item) => item.id === selectedListingId),
    [selectedListingId, sellerListings]
  );

  useEffect(() => {
    if (!selectedListing) return;
    if (!startingBidInput) {
      const defaultStartingBid = Math.max(1, Math.round(selectedListing.price * 0.7));
      const defaultStartingBidDisplay = fromGbpToDisplay(defaultStartingBid);
      setStartingBidInput((Number.isFinite(defaultStartingBidDisplay) ? defaultStartingBidDisplay : defaultStartingBid).toFixed(2));
    }
    if (!buyNowInput) {
      const buyNowDisplay = fromGbpToDisplay(selectedListing.price);
      setBuyNowInput((Number.isFinite(buyNowDisplay) ? buyNowDisplay : selectedListing.price).toFixed(2));
    }
  }, [buyNowInput, fromGbpToDisplay, selectedListing, startingBidInput]);

  // Quick preset shortcuts for starting bid
  const applyStartingBidRatio = useCallback((ratio: number) => {
    if (!selectedListing) return;
    haptics.selection();
    const targetGbp = Math.max(1, Math.round(selectedListing.price * ratio));
    const targetDisplay = fromGbpToDisplay(targetGbp);
    setStartingBidInput((Number.isFinite(targetDisplay) ? targetDisplay : targetGbp).toFixed(2));
  }, [selectedListing, fromGbpToDisplay]);

  // Quick preset shortcuts for reserve price
  const applyReservePreset = useCallback((type: 'plus20' | 'retail' | 'none') => {
    if (!selectedListing) return;
    haptics.selection();
    if (type === 'none') {
      setReservePriceInput('');
      return;
    }
    const baseGbp = type === 'retail' ? selectedListing.price : Number(startingBidInput ? fromDisplayToGbp(Number(startingBidInput)) : selectedListing.price * 0.7) * 1.2;
    const baseDisplay = fromGbpToDisplay(Math.round(baseGbp));
    setReservePriceInput((Number.isFinite(baseDisplay) ? baseDisplay : baseGbp).toFixed(2));
  }, [selectedListing, startingBidInput, fromDisplayToGbp, fromGbpToDisplay]);

  const launchAuction = async () => {
    if (!selectedListing) {
      show(t('auction.create.selectListingError'), 'error');
      return;
    }

    const startingBidDisplay = Number(startingBidInput);
    const startingBid = fromDisplayToGbp(startingBidDisplay);
    if (!Number.isFinite(startingBid) || startingBid <= 0) {
      show(t('auction.create.invalidStartingBid'), 'error');
      return;
    }

    let reservePriceGbp: number | undefined;
    if (reservePriceInput.trim()) {
      reservePriceGbp = fromDisplayToGbp(Number(reservePriceInput));
      if (!Number.isFinite(reservePriceGbp) || reservePriceGbp <= 0) {
        show(t('auction.create.invalidReserve'), 'error');
        return;
      }
      if (reservePriceGbp < startingBid) {
        show(t('auction.create.reserveBelowBid'), 'error');
        return;
      }
    }

    let buyNowPriceGbp: number | undefined;
    if (buyNowEnabled) {
      buyNowPriceGbp = fromDisplayToGbp(Number(buyNowInput));
      if (!Number.isFinite(buyNowPriceGbp) || buyNowPriceGbp <= startingBid) {
        show(t('auction.create.buyNowBelowBid'), 'error');
        return;
      }
    }

    const now = Date.now();
    const startsAtMs = now + startInMinutes * 60 * 1000;
    const endsAtMs = startsAtMs + durationHours * 60 * 60 * 1000;
    const idempotencyKey = createStableId();

    haptics.press();
    setIsSubmitting(true);
    try {
      const result = await createAuction({
        listingId: selectedListing.id,
        startsAt: new Date(startsAtMs).toISOString(),
        endsAt: new Date(endsAtMs).toISOString(),
        startingBidGbp: startingBid,
        idempotencyKey,
        ...(reservePriceGbp ? { reservePriceGbp } : {}),
        ...(buyNowPriceGbp ? { buyNowPriceGbp } : {}),
      });

      const startLabel =
        startInMinutes === 0
          ? 'Live Immediately'
          : `Starts in ${START_WINDOWS.find((w) => w.minutes === startInMinutes)?.label ?? startInMinutes + 'm'}`;
      const durationLabel =
        DURATION_OPTIONS.find((d) => d.hours === durationHours)?.label ?? `${durationHours}h`;

      setResultData({
        auctionId: result.id,
        title: selectedListing.title,
        imageUrl: getListingCoverUri(selectedListing.images, ''),
        startLabel,
        durationLabel,
        startingBid: `${currencyCode} ${Number(startingBidInput).toFixed(2)}`,
        reservePrice: reservePriceInput ? `${currencyCode} ${Number(reservePriceInput).toFixed(2)}` : null,
        buyNow: buyNowEnabled && buyNowInput ? `${currencyCode} ${Number(buyNowInput).toFixed(2)}` : null,
      });

      show(startInMinutes > 0 ? t('auction.create.scheduled') : t('auction.create.live'), 'success');
      void refreshListings();
      void queryClient.invalidateQueries({ queryKey: queryKeys.listing.detail(selectedListing.id) });
      void queryClient.invalidateQueries({ queryKey: ['auctions', 'home'] });
    } catch {
      show(t('auction.create.launchFailed'), 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const previewImage = selectedListing ? getListingCoverUri(selectedListing.images, '') : '';
  const startingBidNum = Number(startingBidInput) || 0;
  const reservePriceNum = reservePriceInput ? Number(reservePriceInput) : undefined;
  const buyNowPriceNum = buyNowEnabled && buyNowInput ? Number(buyNowInput) : undefined;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />

      {/* Flagship Header */}
      <View style={styles.topHeader}>
        <Pressable
          style={styles.headerBackBtn}
          onPress={() => {
            haptics.tap();
            if (stage > 0) setStage(0);
            else navigation.goBack();
          }}
          hitSlop={12}
          accessibilityLabel="Go back"
        >
          <Ionicons name="arrow-back" size={20} color={colors.textPrimary} />
        </Pressable>
        <View style={styles.headerTitleWrap}>
          <Text style={styles.headerTitle}>LAUNCH AUCTION DROP</Text>
          <Text style={styles.headerSubtitle}>Archival Live Studio</Text>
        </View>
        <View style={styles.headerRightPlaceholder} />
      </View>

      {/* Minimalist 2-Phase Progress Rail */}
      <View style={styles.phaseRail}>
        <Pressable
          style={[styles.phaseTab, stage === 0 && styles.phaseTabActive]}
          onPress={() => {
            haptics.selection();
            setStage(0);
          }}
        >
          <Text style={[styles.phaseNum, stage === 0 && styles.phaseNumActive]}>01</Text>
          <Text style={[styles.phaseLabel, stage === 0 && styles.phaseLabelActive]}>DROP & TIMING</Text>
        </Pressable>
        <View style={styles.phaseDivider} />
        <Pressable
          style={[styles.phaseTab, stage === 1 && styles.phaseTabActive]}
          onPress={() => {
            if (!selectedListing) {
              show(t('auction.create.selectListingError'), 'error');
              return;
            }
            haptics.selection();
            setStage(1);
          }}
        >
          <Text style={[styles.phaseNum, stage === 1 && styles.phaseNumActive]}>02</Text>
          <Text style={[styles.phaseLabel, stage === 1 && styles.phaseLabelActive]}>ECONOMICS & LADDER</Text>
        </Pressable>
      </View>

      <KeyboardAwareScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      >
        {!sellerListings.length ? (
          <View style={styles.emptyWrap}>
            <EmptyState
              icon="bag-handle-outline"
              title={t('auction.create.emptyTitle')}
              subtitle={t('auction.create.emptySubtitle')}
              ctaLabel={t('auction.create.emptyCta')}
              onCtaPress={() => navigation.navigate('Sell')}
            />
          </View>
        ) : (
          <>
            {/* ══════════════════════════════════════════════
                STAGE 0: DROP SELECTION & TIMING
               ══════════════════════════════════════════════ */}
            {stage === 0 && (
              <View style={styles.stageContent}>
                {/* Active Piece Hero Showcase */}
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionEyebrow}>ARCHIVAL SELECTION</Text>
                  <Text style={styles.sectionHeading}>Piece Scheduled for Drop</Text>
                </View>

                <View style={styles.pieceHeroCard}>
                  <View style={styles.pieceHeroImageWrap}>
                    <CachedImage
                      uri={previewImage}
                      style={styles.pieceHeroImage}
                      contentFit="cover"
                    />
                    <View style={styles.pieceConditionBadge}>
                      <Text style={styles.pieceConditionText}>VAULT VERIFIED</Text>
                    </View>
                  </View>

                  <View style={styles.pieceHeroMeta}>
                    <Text style={styles.pieceTitle} numberOfLines={2}>
                      {selectedListing?.title ?? 'No piece selected'}
                    </Text>
                    <View style={styles.piecePriceRow}>
                      <Text style={styles.piecePriceLabel}>Catalog Valuation</Text>
                      <Text style={styles.piecePriceValue}>
                        {selectedListing ? formatFromFiat(selectedListing.price, 'GBP') : '—'}
                      </Text>
                    </View>

                    {sellerListings.length > 1 && (
                      <AnimatedPressable
                        style={styles.switchPieceBtn}
                        onPress={() => {
                          haptics.tap();
                          setShowItemPicker((v) => !v);
                        }}
                      >
                        <Ionicons name="swap-horizontal" size={14} color={colors.brand} />
                        <Text style={styles.switchPieceText}>
                          {showItemPicker ? 'Hide Other Pieces' : `Switch Piece (${sellerListings.length} available)`}
                        </Text>
                      </AnimatedPressable>
                    )}
                  </View>
                </View>

                {/* Optional Piece Selector Carousel */}
                {showItemPicker && sellerListings.length > 1 && (
                  <View style={styles.itemPickerContainer}>
                    <Text style={styles.pickerSectionLabel}>CHOOSE ALTERNATIVE PIECE</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pickerScroll}>
                      {sellerListings.map((item) => {
                        const isSelected = item.id === selectedListingId;
                        return (
                          <AnimatedPressable
                            key={item.id}
                            style={[styles.pickerItem, isSelected && styles.pickerItemSelected]}
                            onPress={() => {
                              haptics.selection();
                              setSelectedListingId(item.id);
                              setShowItemPicker(false);
                            }}
                          >
                            <CachedImage
                              uri={getListingCoverUri(item.images, '')}
                              style={styles.pickerItemImage}
                              contentFit="cover"
                            />
                            <View style={styles.pickerItemMeta}>
                              <Text style={styles.pickerItemTitle} numberOfLines={1}>
                                {item.title}
                              </Text>
                              <Text style={styles.pickerItemPrice}>
                                {formatFromFiat(item.price, 'GBP')}
                              </Text>
                            </View>
                            {isSelected && (
                              <View style={styles.pickerItemCheck}>
                                <Ionicons name="checkmark" size={12} color={colors.textInverse} />
                              </View>
                            )}
                          </AnimatedPressable>
                        );
                      })}
                    </ScrollView>
                  </View>
                )}

                {/* Drop Timing & Primetime Window */}
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionEyebrow}>DROP SCHEDULE</Text>
                  <Text style={styles.sectionHeading}>Launch Timing Window</Text>
                </View>

                <View style={styles.windowGrid}>
                  {START_WINDOWS.map((win) => {
                    const isSelected = startInMinutes === win.minutes;
                    return (
                      <AnimatedPressable
                        key={win.minutes}
                        style={[styles.windowTile, isSelected && styles.windowTileSelected]}
                        onPress={() => {
                          haptics.selection();
                          setStartInMinutes(win.minutes);
                        }}
                      >
                        <View style={styles.windowTileTop}>
                          <View style={[styles.windowIconWrap, isSelected && styles.windowIconWrapSelected]}>
                            <Ionicons
                              name={win.icon}
                              size={16}
                              color={isSelected ? colors.brand : colors.textMuted}
                            />
                          </View>
                          <Text style={[styles.windowBadge, isSelected && styles.windowBadgeSelected]}>
                            {win.badge}
                          </Text>
                        </View>
                        <Text style={[styles.windowLabel, isSelected && styles.windowLabelSelected]}>
                          {win.label}
                        </Text>
                      </AnimatedPressable>
                    );
                  })}
                </View>

                {/* Traffic Insight Banner */}
                <View style={styles.trafficInsightBar}>
                  <Ionicons name="analytics" size={16} color={colors.brand} />
                  <Text style={styles.trafficInsightText}>
                    {startInMinutes === 0
                      ? '⚡ Instant Live Drop: Your piece will immediately appear on the live auction runway.'
                      : '🌙 Primetime Surge: Scheduled drops notify watching collectors before the auction countdown begins.'}
                  </Text>
                </View>

                {/* Auction Duration Segmented Selector */}
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionEyebrow}>TIME LIMIT</Text>
                  <Text style={styles.sectionHeading}>Drop Duration</Text>
                </View>

                <View style={styles.durationRow}>
                  {DURATION_OPTIONS.map((opt) => {
                    const isSelected = durationHours === opt.hours;
                    return (
                      <AnimatedPressable
                        key={opt.hours}
                        style={[styles.durationChip, isSelected && styles.durationChipSelected]}
                        onPress={() => {
                          haptics.selection();
                          setDurationHours(opt.hours);
                        }}
                      >
                        <Text style={[styles.durationChipLabel, isSelected && styles.durationChipLabelSelected]}>
                          {opt.label}
                        </Text>
                        <Text style={[styles.durationChipSub, isSelected && styles.durationChipSubSelected]}>
                          {opt.subtitle}
                        </Text>
                      </AnimatedPressable>
                    );
                  })}
                </View>
              </View>
            )}

            {/* ══════════════════════════════════════════════
                STAGE 1: ECONOMICS & INTERACTIVE BID LADDER
               ══════════════════════════════════════════════ */}
            {stage === 1 && (
              <View style={styles.stageContent}>
                {/* Compact Item Recap */}
                <View style={styles.recapBar}>
                  <CachedImage
                    uri={previewImage}
                    style={styles.recapImage}
                    contentFit="cover"
                  />
                  <View style={styles.recapMeta}>
                    <Text style={styles.recapTitle} numberOfLines={1}>
                      {selectedListing?.title}
                    </Text>
                    <Text style={styles.recapSchedule}>
                      {startInMinutes === 0 ? 'Live Now' : `In ${startInMinutes}m`} · {durationHours}h Duration
                    </Text>
                  </View>
                  <Pressable
                    style={styles.recapEditBtn}
                    onPress={() => {
                      haptics.tap();
                      setStage(0);
                    }}
                  >
                    <Text style={styles.recapEditText}>Edit Timing</Text>
                  </Pressable>
                </View>

                {/* 1. Starting Bid */}
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionEyebrow}>STARTING FLOOR</Text>
                  <Text style={styles.sectionHeading}>Opening Hammer Bid</Text>
                </View>

                <View style={styles.inputCard}>
                  <AppInput
                    value={startingBidInput}
                    onChangeText={setStartingBidInput}
                    keyboardType="decimal-pad"
                    placeholder="0.00"
                    prefix={currencyCode}
                    accessibilityLabel="Starting bid"
                    containerStyle={styles.numericInput}
                  />

                  {startingBidNum > 0 && (
                    <View style={styles.izeConversionPill}>
                      <Ionicons name="cube-outline" size={13} color={colors.brand} />
                      <Text style={styles.izeConversionText}>
                        Equivalent to {formatIzeAmount(toIze(startingBidNum, currencyCode, fxRates))}
                      </Text>
                    </View>
                  )}

                  {/* Preset Ratio Chips */}
                  <View style={styles.presetChipsRow}>
                    <Text style={styles.presetLabel}>Quick Presets:</Text>
                    <Pressable
                      style={styles.presetChip}
                      onPress={() => applyStartingBidRatio(0.5)}
                    >
                      <Text style={styles.presetChipText}>50% Floor</Text>
                    </Pressable>
                    <Pressable
                      style={styles.presetChip}
                      onPress={() => applyStartingBidRatio(0.7)}
                    >
                      <Text style={styles.presetChipText}>70% Value</Text>
                    </Pressable>
                    <Pressable
                      style={styles.presetChip}
                      onPress={() => applyStartingBidRatio(0.9)}
                    >
                      <Text style={styles.presetChipText}>90% Near Retail</Text>
                    </Pressable>
                  </View>
                </View>

                {/* 2. Confidential Reserve Price */}
                <View style={styles.sectionHeader}>
                  <View style={styles.headingWithBadge}>
                    <Text style={styles.sectionEyebrow}>SAFEGUARD PROTECTION</Text>
                    <View style={styles.confidentialPill}>
                      <Ionicons name="lock-closed" size={10} color={colors.brand} />
                      <Text style={styles.confidentialPillText}>CONFIDENTIAL</Text>
                    </View>
                  </View>
                  <Text style={styles.sectionHeading}>Reserve Price (Optional)</Text>
                  <Text style={styles.sectionDesc}>
                    Hidden from bidders. If bidding fails to reach your reserve, you are under no obligation to sell.
                  </Text>
                </View>

                <View style={styles.inputCard}>
                  <AppInput
                    value={reservePriceInput}
                    onChangeText={setReservePriceInput}
                    keyboardType="decimal-pad"
                    placeholder="0.00 (Leave empty for no reserve)"
                    prefix={currencyCode}
                    accessibilityLabel="Reserve price"
                    containerStyle={styles.numericInput}
                  />

                  {reservePriceNum ? (
                    <View style={styles.izeConversionPill}>
                      <Ionicons name="shield-checkmark" size={13} color={colors.brand} />
                      <Text style={styles.izeConversionText}>
                        Protected at {formatIzeAmount(toIze(reservePriceNum, currencyCode, fxRates))}
                      </Text>
                    </View>
                  ) : null}

                  {/* Reserve Quick Presets */}
                  <View style={styles.presetChipsRow}>
                    <Text style={styles.presetLabel}>Set Reserve:</Text>
                    <Pressable
                      style={styles.presetChip}
                      onPress={() => applyReservePreset('plus20')}
                    >
                      <Text style={styles.presetChipText}>+20% Over Start</Text>
                    </Pressable>
                    <Pressable
                      style={styles.presetChip}
                      onPress={() => applyReservePreset('retail')}
                    >
                      <Text style={styles.presetChipText}>Catalog Price</Text>
                    </Pressable>
                    {reservePriceInput ? (
                      <Pressable
                        style={styles.presetChipClear}
                        onPress={() => applyReservePreset('none')}
                      >
                        <Text style={styles.presetChipClearText}>Clear</Text>
                      </Pressable>
                    ) : null}
                  </View>
                </View>

                {/* 3. Instant Buyout (Buy Now) */}
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionEyebrow}>INSTANT UNLOCK</Text>
                  <Text style={styles.sectionHeading}>Buy Now Option</Text>
                </View>

                <View style={styles.inputCard}>
                  <View style={styles.buyNowToggleHeader}>
                    <View style={styles.buyNowInfoCol}>
                      <Text style={styles.buyNowTitle}>Enable Instant Checkout</Text>
                      <Text style={styles.buyNowDesc}>
                        Allows a decisive buyer to terminate the auction and purchase instantly.
                      </Text>
                    </View>
                    <Pressable
                      style={[styles.switchTrack, buyNowEnabled && styles.switchTrackActive]}
                      onPress={() => {
                        haptics.selection();
                        setBuyNowEnabled((v) => !v);
                      }}
                      accessibilityRole="switch"
                      accessibilityState={{ checked: buyNowEnabled }}
                    >
                      <View style={[styles.switchThumb, buyNowEnabled && styles.switchThumbActive]} />
                    </Pressable>
                  </View>

                  {buyNowEnabled && (
                    <View style={styles.buyNowInputWrap}>
                      <AppInput
                        value={buyNowInput}
                        onChangeText={setBuyNowInput}
                        keyboardType="decimal-pad"
                        placeholder="0.00"
                        prefix={currencyCode}
                        accessibilityLabel="Buy now price"
                        containerStyle={styles.numericInput}
                      />
                      {buyNowPriceNum ? (
                        <View style={styles.izeConversionPill}>
                          <Ionicons name="flash" size={13} color={colors.warning} />
                          <Text style={styles.izeConversionText}>
                            Instant buyout at {formatIzeAmount(toIze(buyNowPriceNum, currencyCode, fxRates))}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                  )}
                </View>

                {/* 4. Interactive Bid Progression Ladder */}
                <AuctionBidLadderPreview
                  startingBid={startingBidNum}
                  reservePrice={reservePriceNum}
                  buyNowPrice={buyNowPriceNum}
                  currencyCode={currencyCode}
                />

                {/* 5. Protocol & Settlement Guarantee */}
                <View style={styles.settlementCard}>
                  <Text style={styles.settlementHeading}>AUCTION PROTOCOL GUARANTEE</Text>
                  <View style={styles.settlementRow}>
                    <Ionicons name="cube-outline" size={14} color={colors.textSecondary} />
                    <Text style={styles.settlementLabel}>Protocol Fee</Text>
                    <Text style={styles.settlementValue}>1.5% on successful hammer</Text>
                  </View>
                  <View style={styles.settlementRow}>
                    <Ionicons name="lock-closed-outline" size={14} color={colors.textSecondary} />
                    <Text style={styles.settlementLabel}>Escrow Release</Text>
                    <Text style={styles.settlementValue}>Instant to 1ZE or Bank balance</Text>
                  </View>
                  <View style={styles.settlementRow}>
                    <Ionicons name="shield-outline" size={14} color={colors.textSecondary} />
                    <Text style={styles.settlementLabel}>Anti-Sniping Protection</Text>
                    <Text style={styles.settlementValue}>+2 min extension on last-minute bids</Text>
                  </View>
                </View>
              </View>
            )}
          </>
        )}
      </KeyboardAwareScrollView>

      {/* Sticky Bottom Launch Dock */}
      {sellerListings.length > 0 && !resultData && (
        <View style={styles.bottomDock}>
          {stage === 0 ? (
            <AppButton
              title="Configure Drop Economics →"
              onPress={() => {
                if (!selectedListing) {
                  show(t('auction.create.selectListingError'), 'error');
                  return;
                }
                haptics.tap();
                setStage(1);
              }}
              variant="primary"
              size="lg"
              style={styles.dockFullBtn}
              hapticFeedback="medium"
              accessibilityLabel="Continue to economics"
            />
          ) : (
            <View style={styles.dockActionRow}>
              <Pressable
                style={styles.dockBackBtn}
                onPress={() => {
                  haptics.tap();
                  setStage(0);
                }}
              >
                <Ionicons name="arrow-back" size={18} color={colors.textPrimary} />
                <Text style={styles.dockBackText}>Timing</Text>
              </Pressable>

              <AppButton
                title={isSubmitting ? 'Launching Drop...' : 'Launch Live Auction 🔥'}
                onPress={launchAuction}
                variant="primary"
                size="lg"
                style={styles.dockSubmitBtn}
                disabled={isSubmitting}
                loading={isSubmitting}
                hapticFeedback="heavy"
                accessibilityLabel="Launch auction drop"
              />
            </View>
          )}
        </View>
      )}

      {/* ══════════════════════════════════════════════
          RESULT MODAL / CELEBRATION MOMENT
         ══════════════════════════════════════════════ */}
      {resultData && (
        <View style={styles.resultOverlay}>
          <View style={styles.resultCard}>
            <View style={styles.resultBadgeWrap}>
              <Ionicons name="flame" size={32} color={colors.warning} />
            </View>

            <Text style={styles.resultTitle}>AUCTION DROP IS LIVE</Text>
            <Text style={styles.resultSubtitle}>
              {resultData.startLabel} · {resultData.durationLabel}
            </Text>

            {resultData.imageUrl ? (
              <CachedImage
                uri={resultData.imageUrl}
                style={styles.resultImage}
                contentFit="cover"
              />
            ) : null}

            <Text style={styles.resultPieceName} numberOfLines={2}>
              {resultData.title}
            </Text>

            <View style={styles.resultSummaryTable}>
              <View style={styles.resultSummaryRow}>
                <Text style={styles.resultSummaryLabel}>OPENING BID</Text>
                <Text style={styles.resultSummaryValue}>{resultData.startingBid}</Text>
              </View>
              {resultData.reservePrice ? (
                <View style={styles.resultSummaryRow}>
                  <Text style={styles.resultSummaryLabel}>RESERVE (CONFIDENTIAL)</Text>
                  <Text style={styles.resultSummaryValue}>{resultData.reservePrice}</Text>
                </View>
              ) : null}
              {resultData.buyNow ? (
                <View style={styles.resultSummaryRow}>
                  <Text style={styles.resultSummaryLabel}>BUY NOW CEILING</Text>
                  <Text style={styles.resultSummaryValue}>{resultData.buyNow}</Text>
                </View>
              ) : null}
            </View>

            <View style={styles.resultActions}>
              <AppButton
                title="Enter Live Auction Room"
                onPress={() => {
                  navigation.replace('AuctionDetail', { auctionId: resultData.auctionId });
                }}
                variant="primary"
                size="md"
                style={styles.resultPrimaryBtn}
              />
              <AppButton
                title="Return to Seller Studio"
                onPress={() => navigation.goBack()}
                variant="secondary"
                size="md"
                style={styles.resultSecondaryBtn}
              />
            </View>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

function createStyles(colors: ThemeColors, isDark: boolean) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    topHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    headerBackBtn: {
      width: Control.hit - 4,
      height: Control.hit - 4,
      borderRadius: Radius.full,
      backgroundColor: colors.surfaceAlt,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerTitleWrap: {
      alignItems: 'center',
    },
    headerTitle: {
      fontSize: TypographyV2.sectionTitle.size,
      fontFamily: Typography.family.bold,
      color: colors.textPrimary,
      letterSpacing: 0.8,
    },
    headerSubtitle: {
      fontSize: TypographyV2.meta.size - 1,
      fontFamily: Typography.family.medium,
      color: colors.textMuted,
      marginTop: 1,
    },
    headerRightPlaceholder: {
      width: Control.hit - 4,
    },

    // ── Phase Indicator Rail ──
    phaseRail: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: Space.md,
      paddingVertical: Space.xs + 2,
      backgroundColor: colors.surfaceAlt,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    phaseTab: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: Space.xs,
      paddingVertical: Space.xs,
      borderRadius: Radius.md,
    },
    phaseTabActive: {
      backgroundColor: colors.surface,
    },
    phaseNum: {
      fontSize: TypographyV2.meta.size - 1,
      fontFamily: Typography.family.bold,
      color: colors.textMuted,
    },
    phaseNumActive: {
      color: colors.brand,
    },
    phaseLabel: {
      fontSize: TypographyV2.meta.size - 1,
      fontFamily: Typography.family.semibold,
      color: colors.textMuted,
      letterSpacing: 0.5,
    },
    phaseLabelActive: {
      color: colors.textPrimary,
    },
    phaseDivider: {
      width: 1,
      height: 16,
      backgroundColor: colors.border,
      marginHorizontal: Space.xs,
    },

    // ── Content ──
    scrollContent: {
      paddingBottom: Space.xxl * 2,
    },
    stageContent: {
      paddingHorizontal: Space.md,
      paddingTop: Space.md,
    },
    emptyWrap: {
      paddingTop: Space.xxl,
    },

    // ── Section Headers ──
    sectionHeader: {
      marginBottom: Space.sm,
      marginTop: Space.md,
    },
    sectionEyebrow: {
      fontSize: 11,
      fontFamily: Typography.family.bold,
      color: colors.textMuted,
      letterSpacing: 1,
      marginBottom: 2,
    },
    sectionHeading: {
      fontSize: TypographyV2.sectionTitle.size,
      fontFamily: Typography.family.bold,
      color: colors.textPrimary,
    },
    sectionDesc: {
      fontSize: TypographyV2.meta.size,
      fontFamily: Typography.family.regular,
      color: colors.textMuted,
      marginTop: 2,
    },
    headingWithBadge: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    confidentialPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      paddingHorizontal: Space.xs + 2,
      paddingVertical: 2,
      borderRadius: Radius.sm,
      backgroundColor: isDark ? 'rgba(59, 130, 246, 0.15)' : 'rgba(37, 99, 235, 0.08)',
    },
    confidentialPillText: {
      fontSize: 10,
      fontFamily: Typography.family.bold,
      color: colors.brand,
      letterSpacing: 0.5,
    },

    // ── Piece Hero Card ──
    pieceHeroCard: {
      flexDirection: 'row',
      backgroundColor: colors.surfaceAlt,
      borderRadius: Radius.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      padding: Space.sm,
      gap: Space.md,
      alignItems: 'center',
    },
    pieceHeroImageWrap: {
      width: 90,
      height: 110,
      borderRadius: Radius.md,
      overflow: 'hidden',
      position: 'relative',
    },
    pieceHeroImage: {
      width: '100%',
      height: '100%',
    },
    pieceConditionBadge: {
      position: 'absolute',
      bottom: 4,
      left: 4,
      right: 4,
      backgroundColor: 'rgba(0,0,0,0.7)',
      borderRadius: Radius.sm,
      paddingVertical: 2,
      alignItems: 'center',
    },
    pieceConditionText: {
      fontSize: 8,
      fontFamily: Typography.family.bold,
      color: colors.scrimTextPrimary,
      letterSpacing: 0.5,
    },
    pieceHeroMeta: {
      flex: 1,
      justifyContent: 'center',
    },
    pieceTitle: {
      fontSize: TypographyV2.body.size,
      fontFamily: Typography.family.bold,
      color: colors.textPrimary,
      marginBottom: Space.xs,
    },
    piecePriceRow: {
      marginBottom: Space.sm,
    },
    piecePriceLabel: {
      fontSize: TypographyV2.meta.size - 1,
      fontFamily: Typography.family.medium,
      color: colors.textMuted,
    },
    piecePriceValue: {
      fontSize: TypographyV2.sectionTitle.size,
      fontFamily: Typography.family.bold,
      color: colors.textPrimary,
      fontVariant: ['tabular-nums'],
    },
    switchPieceBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingVertical: 4,
    },
    switchPieceText: {
      fontSize: TypographyV2.meta.size,
      fontFamily: Typography.family.semibold,
      color: colors.brand,
    },

    // ── Item Picker ──
    itemPickerContainer: {
      marginTop: Space.sm,
      backgroundColor: colors.surfaceAlt,
      borderRadius: Radius.lg,
      padding: Space.sm,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    pickerSectionLabel: {
      fontSize: 10,
      fontFamily: Typography.family.bold,
      color: colors.textMuted,
      letterSpacing: 0.8,
      marginBottom: Space.xs,
    },
    pickerScroll: {
      gap: Space.sm,
    },
    pickerItem: {
      width: 120,
      backgroundColor: colors.surface,
      borderRadius: Radius.md,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: colors.border,
    },
    pickerItemSelected: {
      borderColor: colors.brand,
      borderWidth: Stroke.emphasis,
    },
    pickerItemImage: {
      width: '100%',
      height: 90,
    },
    pickerItemMeta: {
      padding: Space.xs,
    },
    pickerItemTitle: {
      fontSize: 11,
      fontFamily: Typography.family.semibold,
      color: colors.textPrimary,
    },
    pickerItemPrice: {
      fontSize: 11,
      fontFamily: Typography.family.bold,
      color: colors.textSecondary,
      fontVariant: ['tabular-nums'],
      marginTop: 2,
    },
    pickerItemCheck: {
      position: 'absolute',
      top: 4,
      right: 4,
      width: 18,
      height: 18,
      borderRadius: 9,
      backgroundColor: colors.brand,
      alignItems: 'center',
      justifyContent: 'center',
    },

    // ── Launch Timing Grid ──
    windowGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: Space.sm,
    },
    windowTile: {
      width: '48%',
      backgroundColor: colors.surfaceAlt,
      borderRadius: Radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      padding: Space.sm,
    },
    windowTileSelected: {
      backgroundColor: colors.surface,
      borderColor: colors.brand,
      borderWidth: Stroke.emphasis,
    },
    windowTileTop: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: Space.xs + 2,
    },
    windowIconWrap: {
      width: 28,
      height: 28,
      borderRadius: Radius.sm,
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    windowIconWrapSelected: {
      backgroundColor: isDark ? 'rgba(59, 130, 246, 0.15)' : 'rgba(37, 99, 235, 0.08)',
    },
    windowBadge: {
      fontSize: 9,
      fontFamily: Typography.family.bold,
      color: colors.textMuted,
      letterSpacing: 0.5,
    },
    windowBadgeSelected: {
      color: colors.brand,
    },
    windowLabel: {
      fontSize: TypographyV2.meta.size,
      fontFamily: Typography.family.semibold,
      color: colors.textPrimary,
    },
    windowLabelSelected: {
      color: colors.textPrimary,
      fontFamily: Typography.family.bold,
    },

    // ── Traffic Insight ──
    trafficInsightBar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs + 2,
      backgroundColor: isDark ? 'rgba(59, 130, 246, 0.12)' : 'rgba(37, 99, 235, 0.06)',
      padding: Space.sm,
      borderRadius: Radius.md,
      marginTop: Space.sm,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: isDark ? 'rgba(59, 130, 246, 0.25)' : 'rgba(37, 99, 235, 0.15)',
    },
    trafficInsightText: {
      flex: 1,
      fontSize: TypographyV2.meta.size - 1,
      fontFamily: Typography.family.medium,
      color: colors.textPrimary,
      lineHeight: 16,
    },

    // ── Duration Chips ──
    durationRow: {
      gap: Space.xs,
    },
    durationChip: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      backgroundColor: colors.surfaceAlt,
      borderRadius: Radius.md,
      paddingVertical: Space.sm,
      paddingHorizontal: Space.md,
      borderWidth: 1,
      borderColor: colors.border,
    },
    durationChipSelected: {
      backgroundColor: colors.surface,
      borderColor: colors.brand,
      borderWidth: Stroke.emphasis,
    },
    durationChipLabel: {
      fontSize: TypographyV2.body.size,
      fontFamily: Typography.family.bold,
      color: colors.textPrimary,
    },
    durationChipLabelSelected: {
      color: colors.brand,
    },
    durationChipSub: {
      fontSize: TypographyV2.meta.size - 1,
      fontFamily: Typography.family.medium,
      color: colors.textMuted,
    },
    durationChipSubSelected: {
      color: colors.textSecondary,
    },

    // ── Recap Bar in Stage 1 ──
    recapBar: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surfaceAlt,
      borderRadius: Radius.md,
      padding: Space.xs + 2,
      gap: Space.sm,
      marginBottom: Space.sm,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    recapImage: {
      width: 44,
      height: 44,
      borderRadius: Radius.sm,
    },
    recapMeta: {
      flex: 1,
    },
    recapTitle: {
      fontSize: TypographyV2.meta.size,
      fontFamily: Typography.family.bold,
      color: colors.textPrimary,
    },
    recapSchedule: {
      fontSize: 11,
      fontFamily: Typography.family.medium,
      color: colors.brand,
      marginTop: 2,
    },
    recapEditBtn: {
      paddingHorizontal: Space.sm,
      paddingVertical: 4,
    },
    recapEditText: {
      fontSize: TypographyV2.meta.size - 1,
      fontFamily: Typography.family.semibold,
      color: colors.brand,
    },

    // ── Input Card ──
    inputCard: {
      backgroundColor: colors.surfaceAlt,
      borderRadius: Radius.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      padding: Space.md,
      marginBottom: Space.sm,
    },
    numericInput: {
      backgroundColor: colors.surface,
    },
    izeConversionPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
      marginTop: Space.xs,
      paddingVertical: 2,
    },
    izeConversionText: {
      fontSize: TypographyV2.meta.size - 1,
      fontFamily: Typography.family.medium,
      color: colors.textMuted,
      fontVariant: ['tabular-nums'],
    },
    presetChipsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
      marginTop: Space.sm,
      flexWrap: 'wrap',
    },
    presetLabel: {
      fontSize: 11,
      fontFamily: Typography.family.semibold,
      color: colors.textMuted,
    },
    presetChip: {
      paddingHorizontal: Space.sm,
      paddingVertical: 4,
      borderRadius: Radius.sm,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    presetChipText: {
      fontSize: 11,
      fontFamily: Typography.family.bold,
      color: colors.textPrimary,
    },
    presetChipClear: {
      paddingHorizontal: Space.sm,
      paddingVertical: 4,
      borderRadius: Radius.sm,
      backgroundColor: 'transparent',
    },
    presetChipClearText: {
      fontSize: 11,
      fontFamily: Typography.family.bold,
      color: colors.danger,
    },

    // ── Buy Now Toggle ──
    buyNowToggleHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    buyNowInfoCol: {
      flex: 1,
      paddingRight: Space.sm,
    },
    buyNowTitle: {
      fontSize: TypographyV2.body.size,
      fontFamily: Typography.family.bold,
      color: colors.textPrimary,
    },
    buyNowDesc: {
      fontSize: TypographyV2.meta.size - 1,
      fontFamily: Typography.family.regular,
      color: colors.textMuted,
      marginTop: 2,
    },
    switchTrack: {
      width: 48,
      height: 28,
      borderRadius: Radius.full,
      backgroundColor: colors.border,
      padding: 2,
      justifyContent: 'center',
    },
    switchTrackActive: {
      backgroundColor: colors.brand,
    },
    switchThumb: {
      width: 24,
      height: 24,
      borderRadius: Radius.full,
      backgroundColor: colors.textInverse,
    },
    switchThumbActive: {
      alignSelf: 'flex-end',
    },
    buyNowInputWrap: {
      marginTop: Space.sm,
      paddingTop: Space.sm,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },

    // ── Settlement Guarantee Card ──
    settlementCard: {
      backgroundColor: colors.surfaceAlt,
      borderRadius: Radius.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      padding: Space.md,
      marginTop: Space.sm,
      gap: Space.xs + 2,
    },
    settlementHeading: {
      fontSize: 10,
      fontFamily: Typography.family.bold,
      color: colors.textMuted,
      letterSpacing: 1,
      marginBottom: 2,
    },
    settlementRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs + 2,
    },
    settlementLabel: {
      flex: 1,
      fontSize: TypographyV2.meta.size,
      fontFamily: Typography.family.medium,
      color: colors.textSecondary,
    },
    settlementValue: {
      fontSize: TypographyV2.meta.size,
      fontFamily: Typography.family.bold,
      color: colors.textPrimary,
    },

    // ── Sticky Bottom Dock ──
    bottomDock: {
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm,
      backgroundColor: colors.surface,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
      ...Platform.select({
        ios: {
          shadowColor: colors.shadow,
          shadowOffset: { width: 0, height: -4 },
          shadowOpacity: 0.1,
          shadowRadius: 8,
        },
        android: {
          elevation: 8,
        },
      }),
    },
    dockFullBtn: {
      width: '100%',
    },
    dockActionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm,
    },
    dockBackBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: Space.md,
      paddingVertical: Space.smMd,
      borderRadius: Radius.md,
      backgroundColor: colors.surfaceAlt,
      borderWidth: 1,
      borderColor: colors.border,
    },
    dockBackText: {
      fontSize: TypographyV2.body.size,
      fontFamily: Typography.family.semibold,
      color: colors.textPrimary,
    },
    dockSubmitBtn: {
      flex: 1,
    },

    // ── Result Overlay ──
    resultOverlay: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.85)',
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: Space.lg,
      zIndex: 100,
    },
    resultCard: {
      width: '100%',
      maxWidth: 400,
      backgroundColor: colors.surface,
      borderRadius: Radius.xl,
      borderWidth: 1,
      borderColor: colors.border,
      padding: Space.lg,
      alignItems: 'center',
    },
    resultBadgeWrap: {
      width: 56,
      height: 56,
      borderRadius: Radius.xl,
      backgroundColor: colors.warningSubtle,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: Space.sm,
    },
    resultTitle: {
      fontSize: TypographyV2.screenTitle.size,
      fontFamily: Typography.family.bold,
      color: colors.textPrimary,
      letterSpacing: 0.8,
    },
    resultSubtitle: {
      fontSize: TypographyV2.meta.size,
      fontFamily: Typography.family.medium,
      color: colors.brand,
      marginTop: 2,
      marginBottom: Space.md,
    },
    resultImage: {
      width: '100%',
      height: 160,
      borderRadius: Radius.lg,
      marginBottom: Space.sm,
    },
    resultPieceName: {
      fontSize: TypographyV2.body.size,
      fontFamily: Typography.family.bold,
      color: colors.textPrimary,
      textAlign: 'center',
      marginBottom: Space.md,
    },
    resultSummaryTable: {
      width: '100%',
      backgroundColor: colors.surfaceAlt,
      borderRadius: Radius.md,
      padding: Space.smMd,
      gap: Space.xs,
      marginBottom: Space.lg,
    },
    resultSummaryRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    resultSummaryLabel: {
      fontSize: 10,
      fontFamily: Typography.family.bold,
      color: colors.textMuted,
      letterSpacing: 0.8,
    },
    resultSummaryValue: {
      fontSize: TypographyV2.body.size,
      fontFamily: Typography.family.bold,
      color: colors.textPrimary,
      fontVariant: ['tabular-nums'],
    },
    resultActions: {
      width: '100%',
      gap: Space.xs + 2,
    },
    resultPrimaryBtn: {
      width: '100%',
    },
    resultSecondaryBtn: {
      width: '100%',
    },
  });
}