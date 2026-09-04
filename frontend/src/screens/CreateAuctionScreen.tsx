import React, { useMemo } from 'react';
import { View, StyleSheet, StatusBar, Text, Platform } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppIcon } from '../components/common/AppIcon';
import { IconSize } from '../theme/iconTokens';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { RootStackParamList } from '../navigation/types';
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
import { TradeHeader, TradeCard } from '../components/trade';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { Space, Radius, Typography, Stroke, Control, LetterSpacing } from '../theme/designTokens';
import { TypographyV2 } from '../theme/typography.v2';
import { Meta, BodyEmphasis, Body, Headline } from '../components/ui/Text';
import { createAuction } from '../services/marketApi';
import { createStableId } from '../utils/createStableId';
import { t } from '../i18n';
import { EmptyState } from '../components/EmptyState';
import { KeyboardAwareScrollView } from '../platform/keyboard/KeyboardProvider';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../platform/server/queryKeys';

type NavT = NativeStackNavigationProp<RootStackParamList>;

const AUCTION_WINDOW_HOURS = 6;
const DURATION_OPTIONS = [
  { label: '3h', hours: 3 },
  { label: '6h', hours: 6 },
  { label: '12h', hours: 12 },
  { label: '24h', hours: 24 },
  { label: '3d', hours: 72 },
];
const START_WINDOWS = [
  { label: 'Now', minutes: 0 },
  { label: '30m', minutes: 30 },
  { label: '1h', minutes: 60 },
  { label: '3h', minutes: 180 },
];

export default function CreateAuctionScreen() {
  const { colors, isDark } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const navigation = useNavigation<NavT>();
  const { show } = useToast();
  const { formatFromFiat } = useFormattedPrice();
  const { currencyCode, fxRates } = useCurrencyContext();
  const { listings, refreshListings } = useBackendData();
  const queryClient = useQueryClient();

  const currentUser = useStore((state) => state.currentUser);

  const sellerId = currentUser?.id;

  const sellerListings = React.useMemo(() => {
    if (!sellerId) return [];
    return listings.filter((item) => item.sellerId === sellerId);
  }, [listings, sellerId]);

  const [selectedListingId, setSelectedListingId] = React.useState(sellerListings[0]?.id ?? '');
  const [startInMinutes, setStartInMinutes] = React.useState(0);
  const [durationHours, setDurationHours] = React.useState(6);
  const [startingBidInput, setStartingBidInput] = React.useState('');
  const [reservePriceInput, setReservePriceInput] = React.useState('');
  const [buyNowEnabled, setBuyNowEnabled] = React.useState(true);
  const [buyNowInput, setBuyNowInput] = React.useState('');
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [stage, setStage] = React.useState(0);
  const [resultData, setResultData] = React.useState<{ auctionId: string; title: string; imageUrl: string; startLabel: string; durationLabel: string; startingBid: string; reservePrice: string | null; buyNow: string | null } | null>(null);

  const fromGbpToDisplay = React.useCallback(
    (amountGbp: number) => {
      if (currencyCode === 'GBP') return amountGbp;
      const amountIze = toIze(amountGbp, 'GBP', fxRates);
      return toFiat(amountIze, currencyCode, fxRates);
    },
    [currencyCode, fxRates]
  );

  const fromDisplayToGbp = React.useCallback(
    (amountDisplay: number) => {
      if (currencyCode === 'GBP') return amountDisplay;
      const amountIze = toIze(amountDisplay, currencyCode, fxRates);
      return toFiat(amountIze, 'GBP', fxRates);
    },
    [currencyCode, fxRates]
  );

  React.useEffect(() => {
    if (!sellerListings.length) return;
    if (!sellerListings.some((item) => item.id === selectedListingId)) {
      setSelectedListingId(sellerListings[0].id);
    }
  }, [sellerListings, selectedListingId]);

  const selectedListing = React.useMemo(
    () => sellerListings.find((item) => item.id === selectedListingId),
    [selectedListingId, sellerListings]
  );

  React.useEffect(() => {
    if (!selectedListing) return;
    if (!startingBidInput) {
      const defaultStartingBid = Math.max(1, Math.round(selectedListing.price * 0.8));
      const defaultStartingBidDisplay = fromGbpToDisplay(defaultStartingBid);
      setStartingBidInput((Number.isFinite(defaultStartingBidDisplay) ? defaultStartingBidDisplay : defaultStartingBid).toFixed(2));
    }
    if (!buyNowInput) {
      const buyNowDisplay = fromGbpToDisplay(selectedListing.price);
      setBuyNowInput((Number.isFinite(buyNowDisplay) ? buyNowDisplay : selectedListing.price).toFixed(2));
    }
  }, [buyNowInput, fromGbpToDisplay, selectedListing, startingBidInput]);

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
    setIsSubmitting(true);
    try {
      const result = await createAuction({
        listingId: selectedListing.id,
        startsAt: new Date(startsAtMs).toISOString(),
        endsAt: new Date(endsAtMs).toISOString(),
        startingBidGbp: startingBid,
        idempotencyKey,
        ...(reservePriceGbp ? { reservePriceGbp } : {}),
        ...(buyNowPriceGbp ? { buyNowPriceGbp } : {}) });
      const startLabel = startInMinutes === 0 ? t('auction.create.startsImmediately') : `${t('auction.create.startsIn')} ${START_WINDOWS.find(w => w.minutes === startInMinutes)?.label ?? startInMinutes + 'm'}`;
      const durationLabel = DURATION_OPTIONS.find(d => d.hours === durationHours)?.label ?? `${durationHours}h`;
      setResultData({
        auctionId: result.id,
        title: selectedListing.title,
        imageUrl: getListingCoverUri(selectedListing.images, ''),
        startLabel,
        durationLabel,
        startingBid: `${currencyCode} ${startingBidInput}`,
        reservePrice: reservePriceInput ? `${currencyCode} ${reservePriceInput}` : null,
        buyNow: buyNowEnabled && buyNowInput ? `${currencyCode} ${buyNowInput}` : null });
      show(startInMinutes > 0 ? t('auction.create.scheduled') : t('auction.create.live'), 'success');
      // The backend pauses the listing when an auction is created from it.
      // Refresh the feed + invalidate the listing detail so the paused
      // status propagates immediately.
      void refreshListings();
      void queryClient.invalidateQueries({ queryKey: queryKeys.listing.detail(selectedListing.id) });
      void queryClient.invalidateQueries({ queryKey: ['auctions', 'home'] });
    } catch (e) {
      show(t('auction.create.launchFailed'), 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderListingCard = ({ item }: { item: Listing }) => {
    const selected = item.id === selectedListingId;
    return (
      <AnimatedPressable
        style={[styles.listingCard, selected && styles.listingCardSelected]}
        onPress={() => setSelectedListingId(item.id)}
        activeOpacity={0.85}
        disableAnimation={false}
        scaleValue={0.97}
        accessibilityRole="button"
        accessibilityState={{ selected }}
        accessibilityLabel={`Select listing ${item.title}`}
      >
        <CachedImage
          uri={getListingCoverUri(item.images, '')}
          style={styles.listingImage}
          containerStyle={styles.listingImageContainer}
          contentFit="cover"
        />
        <View style={styles.listingMeta}>
          <BodyEmphasis style={styles.listingTitle} numberOfLines={1}>{item.title}</BodyEmphasis>
          <Meta style={styles.listingPrice}>{formatFromFiat(item.price, 'GBP')}</Meta>
        </View>
        {selected && (
          <View style={styles.selectedTick}>
            <AppIcon name="checkmark" size={14} color="textInverse" opticalCenter accessible={false} />
          </View>
        )}
      </AnimatedPressable>
    );
  };

  const previewImage = selectedListing
    ? getListingCoverUri(selectedListing.images, '')
    : '';

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />

      <TradeHeader
        title={t('auction.create.launchTitle')}
        showClose
        onClose={() => {
          if (stage > 0) setStage(stage - 1);
          else navigation.goBack();
        }}
        backIcon="chevron-back"
      />

      {/* Step indicator — refined active/inactive, weighted connectors */}
      <View style={styles.stepIndicator}>
        {[t('auction.create.stepListing'), t('auction.create.stepConfigure'), t('auction.create.stepReview')].map((label, i) => {
          const isComplete = i < stage;
          const isActive = i === stage;
          const isReached = i <= stage;
          return (
            <View key={label} style={styles.stepItem}>
              <View style={[styles.stepDot, isReached && styles.stepDotActive, isComplete && styles.stepDotComplete]}>
                {isComplete ? (
                  <AppIcon name="checkmark" size={12} color="textInverse" opticalCenter accessible={false} />
                ) : (
                  <Text style={[styles.stepDotText, isReached && styles.stepDotTextActive]}>{i + 1}</Text>
                )}
              </View>
              <Text style={[styles.stepLabel, isReached && styles.stepLabelActive, isActive && styles.stepLabelCurrent]}>{label}</Text>
              {i < 2 && <View style={[styles.stepConnector, i < stage && styles.stepConnectorActive]} />}
            </View>
          );
        })}
      </View>

      <KeyboardAwareScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      >
        {!sellerListings.length ? (
          <View>
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
            {/* ── Stage 0: Select listing ── */}
            {stage === 0 && (
              <>
                <View>
                  <Meta style={styles.sectionLabel}>{t('auction.create.sectionSelectListing')}</Meta>
                </View>

                <FlashList
                  data={sellerListings}
                  horizontal
                  keyExtractor={(item) => item.id}
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.listingListContent}
                  renderItem={renderListingCard}
                />

                <View>
                  <TradeCard variant="elevated" style={styles.previewCard}>
                    <CachedImage uri={previewImage} style={styles.previewImage} containerStyle={styles.previewImageContainer} contentFit="cover" />
                    <View style={styles.previewMeta}>
                      <BodyEmphasis style={styles.previewTitle} numberOfLines={1}>
                        {selectedListing?.title ?? t('auction.create.selectListing')}
                      </BodyEmphasis>
                      <Meta style={styles.previewPrice}>
                        {selectedListing ? formatFromFiat(selectedListing.price, 'GBP') : '—'}
                      </Meta>
                    </View>
                  </TradeCard>
                </View>
              </>
            )}

            {/* ── Stage 1: Configure ── */}
            {stage === 1 && (
              <>
                <View>
                  <TradeCard style={styles.formCard}>
                    <Meta style={styles.sectionLabel}>{t('auction.create.sectionStartWindow')}</Meta>
                    <View style={styles.windowRow}>
                      {START_WINDOWS.map((win) => (
                        <AnimatedPressable
                          key={win.minutes}
                          style={[
                            styles.windowChip,
                            startInMinutes === win.minutes && styles.windowChipActive,
                          ]}
                          onPress={() => setStartInMinutes(win.minutes)}
                          activeOpacity={0.85}
                          hapticFeedback="light"
                          accessibilityRole="button"
                          accessibilityState={{ selected: startInMinutes === win.minutes }}
                          accessibilityLabel={`Start ${win.label}`}
                        >
                          <Body style={[styles.windowChipText, startInMinutes === win.minutes && styles.windowChipTextActive]}>
                            {win.label}
                          </Body>
                        </AnimatedPressable>
                      ))}
                    </View>
                  </TradeCard>
                </View>

                <View>
                  <TradeCard style={styles.formCard}>
                    <Meta style={styles.sectionLabel}>{t('auction.create.sectionDuration')}</Meta>
                    <View style={styles.windowRow}>
                      {DURATION_OPTIONS.map((opt) => (
                        <AnimatedPressable
                          key={opt.hours}
                          style={[
                            styles.windowChip,
                            durationHours === opt.hours && styles.windowChipActive,
                          ]}
                          onPress={() => setDurationHours(opt.hours)}
                          activeOpacity={0.85}
                          hapticFeedback="light"
                          accessibilityRole="button"
                          accessibilityState={{ selected: durationHours === opt.hours }}
                          accessibilityLabel={`Duration ${opt.label}`}
                        >
                          <Body style={[styles.windowChipText, durationHours === opt.hours && styles.windowChipTextActive]}>
                            {opt.label}
                          </Body>
                        </AnimatedPressable>
                      ))}
                    </View>
                  </TradeCard>
                </View>

                <View>
                  <TradeCard style={styles.formCard}>
                    <Meta style={styles.sectionLabel}>{t('listing.create.startingBid')}</Meta>
                    <AppInput
                      value={startingBidInput}
                      onChangeText={setStartingBidInput}
                      keyboardType="decimal-pad"
                      placeholder="0.00"
                      prefix={currencyCode}
                      accessibilityLabel="Starting bid"
                      containerStyle={styles.input}
                    />
                  </TradeCard>
                </View>

                <View>
                  <TradeCard style={styles.formCard}>
                    <Meta style={styles.sectionLabel}>{t('listing.create.reservePriceOptional')}</Meta>
                    <AppInput
                      value={reservePriceInput}
                      onChangeText={setReservePriceInput}
                      keyboardType="decimal-pad"
                      placeholder="0.00"
                      prefix={currencyCode}
                      accessibilityLabel="Reserve price (optional)"
                      accessibilityHint="Minimum sale price — item won't sell unless reserve is met"
                      helperText={t('auction.create.reserveHint')}
                      containerStyle={styles.input}
                    />
                  </TradeCard>
                </View>

                <View>
                  <TradeCard style={styles.formCard}>
                    <View style={styles.buyNowRow}>
                      <Meta style={styles.sectionLabel}>{t('auction.create.sectionBuyNow')}</Meta>
                      <AnimatedPressable
                        style={[styles.toggleChip, buyNowEnabled && styles.toggleChipActive]}
                        onPress={() => setBuyNowEnabled((v) => !v)}
                        activeOpacity={0.85}
                        hapticFeedback="light"
                        accessibilityRole="switch"
                        accessibilityState={{ checked: buyNowEnabled }}
                      >
                        <Body style={[styles.toggleText, buyNowEnabled && styles.toggleTextActive]}>
                          {buyNowEnabled ? t('auction.create.on') : t('auction.create.off')}
                        </Body>
                      </AnimatedPressable>
                    </View>
                    {buyNowEnabled && (
                      <AppInput
                        value={buyNowInput}
                        onChangeText={setBuyNowInput}
                        keyboardType="decimal-pad"
                        placeholder="0.00"
                        prefix={currencyCode}
                        accessibilityLabel="Buy now price"
                        containerStyle={styles.input}
                      />
                    )}
                  </TradeCard>
                </View>
              </>
            )}

            {/* ── Stage 2: Review & Launch ── */}
            {stage === 2 && (
              <>
                <View>
                  <Headline style={styles.reviewHeadline}>{t('auction.create.reviewTitle')}</Headline>
                  <Meta style={styles.reviewSubheadline}>{t('auction.create.reviewSubtitle')}</Meta>
                </View>

                <View>
                  <TradeCard variant="elevated" style={styles.previewCard}>
                    <CachedImage uri={previewImage} style={styles.previewImage} containerStyle={styles.previewImageContainer} contentFit="cover" />
                    <View style={styles.previewMeta}>
                      <BodyEmphasis style={styles.previewTitle} numberOfLines={1}>
                        {selectedListing?.title ?? t('auction.create.selectListing')}
                      </BodyEmphasis>
                      <Meta style={styles.previewPrice}>
                        {selectedListing ? formatFromFiat(selectedListing.price, 'GBP') : '—'}
                      </Meta>
                    </View>
                  </TradeCard>
                </View>

                <View>
                  <TradeCard style={styles.formCard}>
                    <Meta style={styles.sectionLabel}>{t('auction.create.sectionSummary')}</Meta>
                    <View style={styles.termsRow}>
                      <Meta style={styles.termsLabel}>{t('auction.create.labelListing')}</Meta>
                      <Body style={styles.termsValue} numberOfLines={1}>{selectedListing?.title ?? '—'}</Body>
                    </View>
                    <View style={styles.termsRow}>
                      <Meta style={styles.termsLabel}>{t('auction.create.labelStarts')}</Meta>
                      <Body style={styles.termsValue}>
                        {startInMinutes === 0 ? t('auction.create.startsImmediately') : `${t('auction.create.startsIn')} ${START_WINDOWS.find(w => w.minutes === startInMinutes)?.label ?? startInMinutes + 'm'}`}
                      </Body>
                    </View>
                    <View style={styles.termsRow}>
                      <Meta style={styles.termsLabel}>{t('listing.create.duration')}</Meta>
                      <Body style={styles.termsValue}>
                        {DURATION_OPTIONS.find(d => d.hours === durationHours)?.label ?? `${durationHours}h`}
                      </Body>
                    </View>
                    <View style={styles.termsRow}>
                      <Meta style={styles.termsLabel}>{t('listing.create.startingBid')}</Meta>
                      <View style={styles.termsValueCol}>
                        <Body style={styles.termsValue}>
                          {startingBidInput ? `${currencyCode} ${startingBidInput}` : '—'}
                        </Body>
                        {startingBidInput && (
                          <Text style={styles.termsIzeText}>
                            {formatIzeAmount(toIze(Number(startingBidInput), currencyCode, fxRates))}
                          </Text>
                        )}
                      </View>
                    </View>
                    <View style={styles.termsRow}>
                      <Meta style={styles.termsLabel}>{t('auction.create.labelReserve')}</Meta>
                      <View style={styles.termsValueCol}>
                        <Body style={styles.termsValue}>
                          {reservePriceInput ? `${currencyCode} ${reservePriceInput}` : t('auction.create.none')}
                        </Body>
                        {reservePriceInput && (
                          <Text style={styles.termsIzeText}>
                            {formatIzeAmount(toIze(Number(reservePriceInput), currencyCode, fxRates))}
                          </Text>
                        )}
                      </View>
                    </View>
                    <View style={styles.termsRow}>
                      <Meta style={styles.termsLabel}>{t('auction.create.labelBuyNow')}</Meta>
                      <View style={styles.termsValueCol}>
                        <Body style={styles.termsValue}>
                          {buyNowEnabled && buyNowInput ? `${currencyCode} ${buyNowInput}` : t('auction.create.disabled')}
                        </Body>
                        {buyNowEnabled && buyNowInput && (
                          <Text style={styles.termsIzeText}>
                            {formatIzeAmount(toIze(Number(buyNowInput), currencyCode, fxRates))}
                          </Text>
                        )}
                      </View>
                    </View>
                  </TradeCard>
                </View>

                <View>
                  <View style={styles.termsCard}>
                    <Meta style={styles.termsSectionLabel}>{t('auction.create.sectionTerms')}</Meta>
                    <View style={styles.termsInlineRow}>
                      <AppIcon name="cash-outline" size={13} color="textMuted" opticalCenter accessible={false} />
                      <Text style={styles.termsInlineLabel}>{t('auction.create.platformFee')}</Text>
                      <Text style={styles.termsInlineValue}>{t('auction.create.platformFeeValue')}</Text>
                    </View>
                    <View style={styles.termsInlineRow}>
                      <AppIcon name="time-outline" size={13} color="textMuted" opticalCenter accessible={false} />
                      <Text style={styles.termsInlineLabel}>{t('auction.create.settlement')}</Text>
                      <Text style={styles.termsInlineValue}>{t('auction.create.settlementValue')}</Text>
                    </View>
                  </View>
                </View>

                <View>
                  <AppButton
                    title={isSubmitting ? t('auction.create.launching') : t('auction.create.launchTitle')}
                    icon={isSubmitting ? undefined : <AppIcon name="speedometer-outline" size={16} color="background" opticalCenter accessible={false} />}
                    onPress={launchAuction}
                    variant="primary"
                    size="md"
                    style={styles.launchBtn}
                    disabled={isSubmitting}
                    loading={isSubmitting}
                    hapticFeedback="medium"
                    accessibilityLabel="Launch auction"
                  />
                </View>
              </>
            )}

            {/* ── Stage navigation footer ── */}
            {stage < 2 && (
              <View style={styles.stageNavRow}>
                {stage > 0 && (
                  <AppButton
                    title={t('auction.create.back')}
                    onPress={() => setStage(stage - 1)}
                    variant="secondary"
                    size="md"
                    style={styles.stageNavBtn}
                    hapticFeedback="light"
                    accessibilityLabel="Go back to previous step"
                  />
                )}
                <AppButton
                  title={t('auction.create.continue')}
                  onPress={() => setStage(stage + 1)}
                  variant="primary"
                  size="md"
                  style={[styles.stageNavBtn, stage === 0 && styles.stageNavBtnFull]}
                  hapticFeedback="medium"
                  accessibilityLabel="Continue to next step"
                />
              </View>
            )}
          </>
        )}
      </KeyboardAwareScrollView>

      {/* ── Result overlay — crafted success moment ── */}
      {resultData && (
        <View style={styles.resultOverlay}>
          <StatusBar barStyle={!isDark ? 'dark-content' : 'light-content'} />
          <View style={styles.resultCard}>
            {/* Success mark — refined, not a giant icon */}
            <View style={styles.resultIconWrap}>
              <AppIcon name="checkmark" size={28} color="success" opticalCenter accessible={false} />
            </View>
            <Headline style={styles.resultTitle}>{t('auction.create.resultTitle')}</Headline>
            <Meta style={styles.resultSubtitle}>{resultData.startLabel === t('auction.create.startsImmediately') ? t('auction.create.resultLive') : t('auction.create.resultScheduled')}</Meta>

            {resultData.imageUrl ? (
              <CachedImage
                uri={resultData.imageUrl}
                style={styles.resultImage}
                containerStyle={styles.resultImageContainer}
                contentFit="cover"
              />
            ) : null}

            <View style={styles.resultSummary}>
              <View style={styles.termsRow}>
                <Meta style={styles.termsLabel}>{t('auction.create.labelListing')}</Meta>
                <Body style={styles.termsValue} numberOfLines={1}>{resultData.title}</Body>
              </View>
              <View style={styles.termsRow}>
                <Meta style={styles.termsLabel}>{t('auction.create.labelStarts')}</Meta>
                <Body style={styles.termsValue}>{resultData.startLabel}</Body>
              </View>
              <View style={styles.termsRow}>
                <Meta style={styles.termsLabel}>{t('listing.create.duration')}</Meta>
                <Body style={styles.termsValue}>{resultData.durationLabel}</Body>
              </View>
              <View style={styles.termsRow}>
                <Meta style={styles.termsLabel}>{t('listing.create.startingBid')}</Meta>
                <View style={styles.termsValueCol}>
                  <Body style={styles.termsValue}>{resultData.startingBid}</Body>
                  {startingBidInput && (
                    <Text style={styles.termsIzeText}>
                      {formatIzeAmount(toIze(Number(startingBidInput), currencyCode, fxRates))}
                    </Text>
                  )}
                </View>
              </View>
              {resultData.reservePrice && (
                <View style={styles.termsRow}>
                  <Meta style={styles.termsLabel}>{t('auction.create.labelReserve')}</Meta>
                  <View style={styles.termsValueCol}>
                    <Body style={styles.termsValue}>{resultData.reservePrice}</Body>
                    {reservePriceInput && (
                      <Text style={styles.termsIzeText}>
                        {formatIzeAmount(toIze(Number(reservePriceInput), currencyCode, fxRates))}
                      </Text>
                    )}
                  </View>
                </View>
              )}
              {resultData.buyNow && (
                <View style={styles.termsRow}>
                  <Meta style={styles.termsLabel}>{t('auction.create.labelBuyNow')}</Meta>
                  <View style={styles.termsValueCol}>
                    <Body style={styles.termsValue}>{resultData.buyNow}</Body>
                    {buyNowInput && (
                      <Text style={styles.termsIzeText}>
                        {formatIzeAmount(toIze(Number(buyNowInput), currencyCode, fxRates))}
                      </Text>
                    )}
                  </View>
                </View>
              )}
            </View>

            <View style={styles.resultActions}>
              <AppButton
                title={t('auction.create.viewAuction')}
                onPress={() => navigation.replace('AuctionDetail', { auctionId: resultData.auctionId })}
                variant="primary"
                size="md"
                style={styles.resultBtn}
                accessibilityLabel="View the launched auction"
              />
              <AppButton
                title={t('auction.create.done')}
                onPress={() => navigation.goBack()}
                variant="secondary"
                size="md"
                style={styles.resultBtn}
                accessibilityLabel="Close and go back"
              />
            </View>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background },
  headerLaunchBtn: {
    borderRadius: Radius.md,
    minHeight: Control.chrome - 2,
    paddingHorizontal: Space.smMd },
  content: {
    paddingBottom: Space.xl },
  sectionLabel: {
    marginHorizontal: Space.md,
    marginBottom: Space.sm,
    marginTop: Space.md },
  // ── Listing cards — elevated with shadow + rounded image ──
  listingListContent: {
    paddingHorizontal: Space.md,
    gap: Space.sm,
    paddingBottom: Space.sm },
  listingCard: {
    width: Space.xxl * 3 + Space.xs + 2,
    backgroundColor: colors.surface,
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    overflow: 'hidden' },
  listingCardSelected: {
    borderColor: colors.brand,
    borderWidth: Stroke.emphasis },
  listingImageContainer: {
    width: '100%',
    height: Space.xxl * 3 + Space.lg + 2,
    borderTopLeftRadius: Radius.lg,
    borderTopRightRadius: Radius.lg,
    overflow: 'hidden' },
  listingImage: {
    width: '100%',
    height: '100%' },
  listingMeta: {
    padding: Space.sm },
  listingTitle: {
    marginBottom: Space.xs / 2 },
  listingPrice: {},
  selectedTick: {
    position: 'absolute',
    top: Space.sm,
    right: Space.sm,
    width: Control.icon,
    height: Control.icon,
    borderRadius: Radius.lg,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: Stroke.emphasis,
    borderColor: colors.surface },
  // ── Preview card ──
  previewCard: {
    marginTop: Space.sm,
    padding: Space.sm },
  previewImageContainer: {
    width: '100%',
    height: Space.xxl * 5,
    borderRadius: Radius.lg,
    overflow: 'hidden' },
  previewImage: {
    width: '100%',
    height: '100%' },
  previewMeta: {
    marginTop: Space.sm },
  previewTitle: {},
  previewPrice: {
    marginTop: Space.xs / 2 },
  // ── Form cards ──
  formCard: {
    marginTop: Space.sm },
  windowRow: {
    flexDirection: 'row',
    gap: Space.sm,
    marginTop: Space.xs },
  // ── Window chips — refined inactive, solid active ──
  windowChip: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
    paddingVertical: Space.smMd,
    minHeight: Control.hit },
  windowChipActive: {
    backgroundColor: colors.brand,
    borderColor: colors.brand },
  windowChipText: {
    color: colors.textSecondary,
    fontFamily: Typography.family.medium },
  windowChipTextActive: {
    color: colors.textInverse,
    fontFamily: Typography.family.semibold },
  input: {
    marginTop: Space.xs },
  buyNowRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center' },
  // ── Toggle — refined pill ──
  toggleChip: {
    borderRadius: Radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
    paddingHorizontal: Space.smMd,
    paddingVertical: Space.xs + 1,
    minWidth: Space.xxl,
    alignItems: 'center' },
  toggleChipActive: {
    backgroundColor: colors.brand,
    borderColor: colors.brand },
  toggleText: {
    color: colors.textSecondary,
    fontFamily: Typography.family.medium,
    fontSize: TypographyV2.meta.size },
  toggleTextActive: {
    color: colors.textInverse,
    fontFamily: Typography.family.bold,
    fontSize: TypographyV2.meta.size },
  launchBtn: {
    marginHorizontal: Space.md,
    marginTop: Space.lg },
  // ── Step indicator — refined active/inactive, weighted connectors ──
  stepIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    gap: 0 },
  stepItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 2 },
  stepDot: {
    width: Space.md + 2,
    height: Space.md + 2,
    borderRadius: Radius.xl,
    borderWidth: Stroke.emphasis,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center' },
  stepDotActive: {
    borderColor: colors.brand,
    backgroundColor: colors.brand },
  stepDotComplete: {
    backgroundColor: colors.brand,
    borderColor: colors.brand },
  stepDotText: {
    fontSize: TypographyV2.meta.size,
    color: colors.textMuted,
    fontFamily: Typography.family.bold },
  stepDotTextActive: {
    color: colors.textInverse },
  stepLabel: {
    fontSize: TypographyV2.meta.size,
    color: colors.textMuted,
    fontFamily: TypographyV2.meta.fontFamily },
  stepLabelActive: {
    color: colors.textPrimary },
  stepLabelCurrent: {
    fontFamily: Typography.family.semibold },
  stepConnector: {
    width: Space.lg + 4,
    height: Stroke.emphasis,
    backgroundColor: colors.border,
    marginHorizontal: Space.xs + 2 },
  stepConnectorActive: {
    backgroundColor: colors.brand,
    height: Stroke.emphasis },
  // ── Review ──
  reviewHeadline: {
    fontSize: TypographyV2.priceHero.size - 2,
    paddingHorizontal: Space.md,
    marginTop: Space.lg,
    letterSpacing: TypographyV2.screenTitle.letterSpacing },
  reviewSubheadline: {
    color: colors.textMuted,
    paddingHorizontal: Space.md,
    marginTop: Space.xs,
    marginBottom: Space.sm },
  stageNavRow: {
    flexDirection: 'row',
    gap: Space.sm,
    paddingHorizontal: Space.md,
    marginTop: Space.lg,
    marginBottom: Space.xl },
  stageNavBtn: {
    flex: 1 },
  stageNavBtnFull: {
    flex: 1 },
  // ── Terms rows ──
  termsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Space.xs + 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border },
  termsLabel: {
    color: colors.textMuted,
    fontSize: TypographyV2.meta.size - 1,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: LetterSpacing.caps,
    textTransform: 'uppercase' },
  termsValue: {
    color: colors.textPrimary,
    fontFamily: Typography.family.semibold,
    fontSize: TypographyV2.body.size,
    fontVariant: ['tabular-nums'] },
  termsValueCol: {
    alignItems: 'flex-end' },
  termsIzeText: {
    fontSize: TypographyV2.meta.size,
    color: colors.textMuted,
    fontFamily: TypographyV2.meta.fontFamily,
    marginTop: Space.xs / 4,
    fontVariant: ['tabular-nums'] },
  // ── Terms & fees — inline, lighter than summary ──
  termsCard: {
    marginHorizontal: Space.md,
    marginTop: Space.sm,
    paddingVertical: Space.sm,
    paddingHorizontal: Space.md,
    borderRadius: Radius.lg,
    backgroundColor: colors.overlay,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    gap: Space.xs },
  termsSectionLabel: {
    fontSize: TypographyV2.meta.size - 1,
    color: colors.textMuted,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: LetterSpacing.caps,
    textTransform: 'uppercase',
    marginBottom: Space.xs },
  termsInlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 2 },
  termsInlineLabel: {
    flex: 1,
    fontSize: TypographyV2.meta.size,
    color: colors.textSecondary,
    fontFamily: TypographyV2.meta.fontFamily },
  termsInlineValue: {
    fontSize: TypographyV2.meta.size,
    color: colors.textPrimary,
    fontFamily: TypographyV2.meta.fontFamily },
  // ── Result overlay — crafted success moment ──
  resultOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Space.lg },
  resultCard: {
    backgroundColor: colors.surface,
    borderRadius: Radius.xl,
    padding: Space.lg,
    width: '100%',
    maxWidth: Space.xxl * 10,
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    ...Platform.select({
      ios: { shadowColor: colors.shadow, shadowOffset: { width: 0, height: 16 }, shadowOpacity: 0.3, shadowRadius: 24 },
      android: { elevation: 16 } }) },
  resultIconWrap: {
    marginBottom: Space.sm,
    width: Space.xxl + Space.xxl + 8,
    height: Space.xxl + Space.xxl + 8,
    borderRadius: Space.lg + 4,
    backgroundColor: colors.successSubtle,
    borderWidth: Stroke.emphasis,
    borderColor: colors.successBorder,
    alignItems: 'center',
    justifyContent: 'center' },
  resultTitle: {
    fontSize: TypographyV2.screenTitle.size,
    textAlign: 'center',
    letterSpacing: TypographyV2.priceHero.letterSpacing },
  resultSubtitle: {
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: Space.xs,
    marginBottom: Space.md },
  resultImageContainer: {
    width: '100%',
    height: Space.xxl * 3 + Space.xl + Space.xs,
    borderRadius: Radius.lg,
    marginBottom: Space.md,
    overflow: 'hidden' },
  resultImage: {
    width: '100%',
    height: '100%' },
  resultSummary: {
    width: '100%',
    marginBottom: Space.md },
  resultActions: {
    flexDirection: 'row',
    gap: Space.sm,
    width: '100%' },
  resultBtn: {
    flex: 1 } });
}