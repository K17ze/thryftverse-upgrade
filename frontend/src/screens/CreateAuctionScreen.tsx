import React from 'react';
import { View, StyleSheet, StatusBar, ScrollView, Text, KeyboardAvoidingView, Platform } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import Reanimated, { FadeInDown } from 'react-native-reanimated';
import { Colors } from '../constants/colors';
import { useAppTheme } from '../theme/ThemeContext';
import { RootStackParamList } from '../navigation/types';
import { useStore } from '../store/useStore';
import { useToast } from '../context/ToastContext';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { useCurrencyContext } from '../context/CurrencyContext';
import { toFiat, toIze, formatIzeAmount } from '../utils/currency';
import { useBackendData } from '../context/BackendDataContext';
import { CachedImage } from '../components/CachedImage';
import { getListingCoverUri } from '../utils/media';
import { AppButton } from '../components/ui/AppButton';
import { AppInput } from '../components/ui/AppInput';
import { TradeHeader, TradeCard } from '../components/trade';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { Space, Radius, Typography } from '../theme/designTokens';
import { Motion } from '../constants/motion';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { Meta, BodyEmphasis, Body, Headline } from '../components/ui/Text';
import { createAuction } from '../services/marketApi';
import { createStableId } from '../utils/createStableId';
import { EmptyState } from '../components/EmptyState';

type NavT = StackNavigationProp<RootStackParamList>;

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
  const { isDark } = useAppTheme();
  const navigation = useNavigation<NavT>();
  const { show } = useToast();
  const { formatFromFiat } = useFormattedPrice();
  const { currencyCode, goldRates } = useCurrencyContext();
  const { listings } = useBackendData();
  const reducedMotionEnabled = useReducedMotion();

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
  const [buyNowEnabled, setBuyNowEnabled] = React.useState(true);
  const [buyNowInput, setBuyNowInput] = React.useState('');
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [stage, setStage] = React.useState(0);
  const [resultData, setResultData] = React.useState<{ auctionId: string; title: string; imageUrl: string; startLabel: string; durationLabel: string; startingBid: string; buyNow: string | null } | null>(null);

  const fromGbpToDisplay = React.useCallback(
    (amountGbp: number) => {
      if (currencyCode === 'GBP') return amountGbp;
      const amountIze = toIze(amountGbp, 'GBP', goldRates);
      return toFiat(amountIze, currencyCode, goldRates);
    },
    [currencyCode, goldRates]
  );

  const fromDisplayToGbp = React.useCallback(
    (amountDisplay: number) => {
      if (currencyCode === 'GBP') return amountDisplay;
      const amountIze = toIze(amountDisplay, currencyCode, goldRates);
      return toFiat(amountIze, 'GBP', goldRates);
    },
    [currencyCode, goldRates]
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
      show('Select a listing to launch', 'error');
      return;
    }

    const startingBidDisplay = Number(startingBidInput);
    const startingBid = fromDisplayToGbp(startingBidDisplay);
    if (!Number.isFinite(startingBid) || startingBid <= 0) {
      show('Enter a valid starting bid', 'error');
      return;
    }

    let buyNowPriceGbp: number | undefined;
    if (buyNowEnabled) {
      buyNowPriceGbp = fromDisplayToGbp(Number(buyNowInput));
      if (!Number.isFinite(buyNowPriceGbp) || buyNowPriceGbp <= startingBid) {
        show('Buy now must be greater than starting bid', 'error');
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
        ...(buyNowPriceGbp ? { buyNowPriceGbp } : {}),
      });
      const startLabel = startInMinutes === 0 ? 'Immediately' : `In ${START_WINDOWS.find(w => w.minutes === startInMinutes)?.label ?? startInMinutes + 'm'}`;
      const durationLabel = DURATION_OPTIONS.find(d => d.hours === durationHours)?.label ?? `${durationHours}h`;
      setResultData({
        auctionId: result.id,
        title: selectedListing.title,
        imageUrl: getListingCoverUri(selectedListing.images, ''),
        startLabel,
        durationLabel,
        startingBid: `${currencyCode} ${startingBidInput}`,
        buyNow: buyNowEnabled && buyNowInput ? `${currencyCode} ${buyNowInput}` : null,
      });
      show(startInMinutes > 0 ? 'Auction scheduled successfully' : 'Auction is now live', 'success');
    } catch (e) {
      show('Failed to launch auction. Please try again.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderListingCard = ({ item }: { item: any }) => {
    const selected = item.id === selectedListingId;
    return (
      <AnimatedPressable
        style={[styles.listingCard, selected && styles.listingCardSelected]}
        onPress={() => setSelectedListingId(item.id)}
        activeOpacity={0.9}
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
            <Ionicons name="checkmark" size={14} color={Colors.textInverse} />
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
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={Colors.background} />

      <TradeHeader
        title="Launch Auction"
        showClose
        onClose={() => {
          if (stage > 0) setStage(stage - 1);
          else navigation.goBack();
        }}
        backIcon="chevron-back"
      />

      {/* Step indicator — refined active/inactive, weighted connectors */}
      <View style={styles.stepIndicator}>
        {['Listing', 'Configure', 'Review'].map((label, i) => {
          const isComplete = i < stage;
          const isActive = i === stage;
          const isReached = i <= stage;
          return (
            <View key={label} style={styles.stepItem}>
              <View style={[styles.stepDot, isReached && styles.stepDotActive, isComplete && styles.stepDotComplete]}>
                {isComplete ? (
                  <Ionicons name="checkmark" size={12} color={Colors.textInverse} />
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

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {!sellerListings.length ? (
          <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(Motion.list.enterDuration)}>
            <EmptyState
              icon="pricetag-outline"
              title="No listings available"
              subtitle="Create a listing first to launch an auction."
              ctaLabel="Create Listing"
              onCtaPress={() => (navigation as any).navigate('Sell')}
            />
          </Reanimated.View>
        ) : (
          <>
            {/* ── Stage 0: Select listing ── */}
            {stage === 0 && (
              <>
                <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(Motion.list.enterDuration)}>
                  <Meta style={styles.sectionLabel}>SELECT LISTING</Meta>
                </Reanimated.View>

                <FlashList
                  data={sellerListings}
                  horizontal
                  keyExtractor={(item) => item.id}
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.listingListContent}
                  renderItem={renderListingCard}
                />

                <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(Motion.list.enterDuration).delay(100)}>
                  <TradeCard variant="elevated" style={styles.previewCard}>
                    <CachedImage uri={previewImage} style={styles.previewImage} containerStyle={styles.previewImageContainer} contentFit="cover" />
                    <View style={styles.previewMeta}>
                      <BodyEmphasis style={styles.previewTitle} numberOfLines={1}>
                        {selectedListing?.title ?? 'Select a listing'}
                      </BodyEmphasis>
                      <Meta style={styles.previewPrice}>
                        {selectedListing ? formatFromFiat(selectedListing.price, 'GBP') : '—'}
                      </Meta>
                    </View>
                  </TradeCard>
                </Reanimated.View>
              </>
            )}

            {/* ── Stage 1: Configure ── */}
            {stage === 1 && (
              <>
                <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(Motion.list.enterDuration)}>
                  <TradeCard style={styles.formCard}>
                    <Meta style={styles.sectionLabel}>START WINDOW</Meta>
                    <View style={styles.windowRow}>
                      {START_WINDOWS.map((win) => (
                        <AnimatedPressable
                          key={win.minutes}
                          style={[
                            styles.windowChip,
                            startInMinutes === win.minutes && styles.windowChipActive,
                          ]}
                          onPress={() => setStartInMinutes(win.minutes)}
                          activeOpacity={0.9}
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
                </Reanimated.View>

                <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(Motion.list.enterDuration).delay(100)}>
                  <TradeCard style={styles.formCard}>
                    <Meta style={styles.sectionLabel}>DURATION</Meta>
                    <View style={styles.windowRow}>
                      {DURATION_OPTIONS.map((opt) => (
                        <AnimatedPressable
                          key={opt.hours}
                          style={[
                            styles.windowChip,
                            durationHours === opt.hours && styles.windowChipActive,
                          ]}
                          onPress={() => setDurationHours(opt.hours)}
                          activeOpacity={0.9}
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
                </Reanimated.View>

                <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(Motion.list.enterDuration).delay(150)}>
                  <TradeCard style={styles.formCard}>
                    <Meta style={styles.sectionLabel}>STARTING BID</Meta>
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
                </Reanimated.View>

                <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(Motion.list.enterDuration).delay(150)}>
                  <TradeCard style={styles.formCard}>
                    <View style={styles.buyNowRow}>
                      <Meta style={styles.sectionLabel}>BUY NOW PRICE</Meta>
                      <AnimatedPressable
                        style={[styles.toggleChip, buyNowEnabled && styles.toggleChipActive]}
                        onPress={() => setBuyNowEnabled((v) => !v)}
                        activeOpacity={0.9}
                        hapticFeedback="light"
                        accessibilityRole="switch"
                        accessibilityState={{ checked: buyNowEnabled }}
                      >
                        <Body style={[styles.toggleText, buyNowEnabled && styles.toggleTextActive]}>
                          {buyNowEnabled ? 'ON' : 'OFF'}
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
                </Reanimated.View>
              </>
            )}

            {/* ── Stage 2: Review & Launch ── */}
            {stage === 2 && (
              <>
                <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(Motion.list.enterDuration)}>
                  <Headline style={styles.reviewHeadline}>Review your auction</Headline>
                  <Meta style={styles.reviewSubheadline}>Confirm the details below before launching.</Meta>
                </Reanimated.View>

                <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(Motion.list.enterDuration).delay(100)}>
                  <TradeCard variant="elevated" style={styles.previewCard}>
                    <CachedImage uri={previewImage} style={styles.previewImage} containerStyle={styles.previewImageContainer} contentFit="cover" />
                    <View style={styles.previewMeta}>
                      <BodyEmphasis style={styles.previewTitle} numberOfLines={1}>
                        {selectedListing?.title ?? 'Select a listing'}
                      </BodyEmphasis>
                      <Meta style={styles.previewPrice}>
                        {selectedListing ? formatFromFiat(selectedListing.price, 'GBP') : '—'}
                      </Meta>
                    </View>
                  </TradeCard>
                </Reanimated.View>

                <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(Motion.list.enterDuration).delay(150)}>
                  <TradeCard style={styles.formCard}>
                    <Meta style={styles.sectionLabel}>AUCTION SUMMARY</Meta>
                    <View style={styles.termsRow}>
                      <Meta style={styles.termsLabel}>Listing</Meta>
                      <Body style={styles.termsValue} numberOfLines={1}>{selectedListing?.title ?? '—'}</Body>
                    </View>
                    <View style={styles.termsRow}>
                      <Meta style={styles.termsLabel}>Starts</Meta>
                      <Body style={styles.termsValue}>
                        {startInMinutes === 0 ? 'Immediately' : `In ${START_WINDOWS.find(w => w.minutes === startInMinutes)?.label ?? startInMinutes + 'm'}`}
                      </Body>
                    </View>
                    <View style={styles.termsRow}>
                      <Meta style={styles.termsLabel}>Duration</Meta>
                      <Body style={styles.termsValue}>
                        {DURATION_OPTIONS.find(d => d.hours === durationHours)?.label ?? `${durationHours}h`}
                      </Body>
                    </View>
                    <View style={styles.termsRow}>
                      <Meta style={styles.termsLabel}>Starting bid</Meta>
                      <View style={styles.termsValueCol}>
                        <Body style={styles.termsValue}>
                          {startingBidInput ? `${currencyCode} ${startingBidInput}` : '—'}
                        </Body>
                        {startingBidInput && (
                          <Text style={styles.termsIzeText}>
                            {formatIzeAmount(toIze(Number(startingBidInput), currencyCode as any, goldRates))}
                          </Text>
                        )}
                      </View>
                    </View>
                    <View style={styles.termsRow}>
                      <Meta style={styles.termsLabel}>Buy now</Meta>
                      <View style={styles.termsValueCol}>
                        <Body style={styles.termsValue}>
                          {buyNowEnabled && buyNowInput ? `${currencyCode} ${buyNowInput}` : 'Disabled'}
                        </Body>
                        {buyNowEnabled && buyNowInput && (
                          <Text style={styles.termsIzeText}>
                            {formatIzeAmount(toIze(Number(buyNowInput), currencyCode as any, goldRates))}
                          </Text>
                        )}
                      </View>
                    </View>
                  </TradeCard>
                </Reanimated.View>

                <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(Motion.list.enterDuration).delay(200)}>
                  <View style={styles.termsCard}>
                    <Meta style={styles.termsSectionLabel}>TERMS & FEES</Meta>
                    <View style={styles.termsInlineRow}>
                      <Ionicons name="pricetag-outline" size={13} color={Colors.textMuted} />
                      <Text style={styles.termsInlineLabel}>Platform fee</Text>
                      <Text style={styles.termsInlineValue}>3% of winning bid</Text>
                    </View>
                    <View style={styles.termsInlineRow}>
                      <Ionicons name="time-outline" size={13} color={Colors.textMuted} />
                      <Text style={styles.termsInlineLabel}>Settlement</Text>
                      <Text style={styles.termsInlineValue}>After auction ends</Text>
                    </View>
                  </View>
                </Reanimated.View>

                <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(Motion.list.enterDuration).delay(250)}>
                  <AppButton
                    title={isSubmitting ? 'Launching...' : 'Launch Auction'}
                    icon={isSubmitting ? undefined : <Ionicons name="flash-outline" size={16} color={Colors.background} />}
                    onPress={launchAuction}
                    variant="primary"
                    size="md"
                    style={styles.launchBtn}
                    disabled={isSubmitting}
                    loading={isSubmitting}
                    hapticFeedback="medium"
                    accessibilityLabel="Launch auction"
                  />
                </Reanimated.View>
              </>
            )}

            {/* ── Stage navigation footer ── */}
            {stage < 2 && (
              <View style={styles.stageNavRow}>
                {stage > 0 && (
                  <AppButton
                    title="Back"
                    onPress={() => setStage(stage - 1)}
                    variant="secondary"
                    size="md"
                    style={styles.stageNavBtn}
                    hapticFeedback="light"
                    accessibilityLabel="Go back to previous step"
                  />
                )}
                <AppButton
                  title="Continue"
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
      </ScrollView>
      </KeyboardAvoidingView>

      {/* ── Result overlay — crafted success moment ── */}
      {resultData && (
        <View style={styles.resultOverlay}>
          <StatusBar barStyle="light-content" />
          <Reanimated.View
            entering={reducedMotionEnabled ? undefined : FadeInDown.duration(400)}
            style={styles.resultCard}
          >
            {/* Success mark — refined, not a giant icon */}
            <View style={styles.resultIconWrap}>
              <Ionicons name="checkmark" size={28} color={Colors.success} />
            </View>
            <Headline style={styles.resultTitle}>Auction Launched</Headline>
            <Meta style={styles.resultSubtitle}>{resultData.startLabel === 'Immediately' ? 'Your auction is now live' : 'Your auction is scheduled'}</Meta>

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
                <Meta style={styles.termsLabel}>Listing</Meta>
                <Body style={styles.termsValue} numberOfLines={1}>{resultData.title}</Body>
              </View>
              <View style={styles.termsRow}>
                <Meta style={styles.termsLabel}>Starts</Meta>
                <Body style={styles.termsValue}>{resultData.startLabel}</Body>
              </View>
              <View style={styles.termsRow}>
                <Meta style={styles.termsLabel}>Duration</Meta>
                <Body style={styles.termsValue}>{resultData.durationLabel}</Body>
              </View>
              <View style={styles.termsRow}>
                <Meta style={styles.termsLabel}>Starting bid</Meta>
                <View style={styles.termsValueCol}>
                  <Body style={styles.termsValue}>{resultData.startingBid}</Body>
                  {startingBidInput && (
                    <Text style={styles.termsIzeText}>
                      {formatIzeAmount(toIze(Number(startingBidInput), currencyCode as any, goldRates))}
                    </Text>
                  )}
                </View>
              </View>
              {resultData.buyNow && (
                <View style={styles.termsRow}>
                  <Meta style={styles.termsLabel}>Buy now</Meta>
                  <View style={styles.termsValueCol}>
                    <Body style={styles.termsValue}>{resultData.buyNow}</Body>
                    {buyNowInput && (
                      <Text style={styles.termsIzeText}>
                        {formatIzeAmount(toIze(Number(buyNowInput), currencyCode as any, goldRates))}
                      </Text>
                    )}
                  </View>
                </View>
              )}
            </View>

            <View style={styles.resultActions}>
              <AppButton
                title="View Auction"
                onPress={() => navigation.replace('AuctionDetail', { auctionId: resultData.auctionId })}
                variant="primary"
                size="md"
                style={styles.resultBtn}
                accessibilityLabel="View the launched auction"
              />
              <AppButton
                title="Done"
                onPress={() => navigation.goBack()}
                variant="secondary"
                size="md"
                style={styles.resultBtn}
                accessibilityLabel="Close and go back"
              />
            </View>
          </Reanimated.View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  headerLaunchBtn: {
    borderRadius: Radius.md,
    minHeight: 34,
    paddingHorizontal: 12,
  },
  content: {
    paddingBottom: Space.xl,
  },
  sectionLabel: {
    marginHorizontal: Space.md,
    marginBottom: Space.sm,
    marginTop: Space.md,
  },
  // ── Listing cards — elevated with shadow + rounded image ──
  listingListContent: {
    paddingHorizontal: Space.md,
    gap: Space.sm,
    paddingBottom: Space.sm,
  },
  listingCard: {
    width: 150,
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
    overflow: 'hidden',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 8 },
      android: { elevation: 2 },
    }),
  },
  listingCardSelected: {
    borderColor: Colors.brand,
    borderWidth: 2,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.16, shadowRadius: 12 },
      android: { elevation: 6 },
    }),
  },
  listingImageContainer: {
    width: '100%',
    height: 170,
    borderTopLeftRadius: Radius.lg,
    borderTopRightRadius: Radius.lg,
    overflow: 'hidden',
  },
  listingImage: {
    width: '100%',
    height: '100%',
  },
  listingMeta: {
    padding: Space.sm,
  },
  listingTitle: {
    marginBottom: 2,
  },
  listingPrice: {},
  selectedTick: {
    position: 'absolute',
    top: Space.sm,
    right: Space.sm,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Colors.surface,
  },
  // ── Preview card ──
  previewCard: {
    marginTop: Space.sm,
    padding: Space.sm,
  },
  previewImageContainer: {
    width: '100%',
    height: 240,
    borderRadius: Radius.lg,
    overflow: 'hidden',
  },
  previewImage: {
    width: '100%',
    height: '100%',
  },
  previewMeta: {
    marginTop: Space.sm,
  },
  previewTitle: {},
  previewPrice: {
    marginTop: 2,
  },
  // ── Form cards ──
  formCard: {
    marginTop: Space.sm,
  },
  windowRow: {
    flexDirection: 'row',
    gap: Space.sm,
    marginTop: Space.xs,
  },
  // ── Window chips — refined inactive, solid active ──
  windowChip: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
    backgroundColor: Colors.surfaceAlt,
    paddingVertical: 12,
    minHeight: 44,
  },
  windowChipActive: {
    backgroundColor: Colors.brand,
    borderColor: Colors.brand,
  },
  windowChipText: {
    color: Colors.textSecondary,
    fontFamily: Typography.family.medium,
  },
  windowChipTextActive: {
    color: Colors.textInverse,
    fontFamily: Typography.family.semibold,
  },
  input: {
    marginTop: Space.xs,
  },
  buyNowRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  // ── Toggle — refined pill ──
  toggleChip: {
    borderRadius: Radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
    backgroundColor: Colors.surfaceAlt,
    paddingHorizontal: 12,
    paddingVertical: 5,
    minWidth: 48,
    alignItems: 'center',
  },
  toggleChipActive: {
    backgroundColor: Colors.brand,
    borderColor: Colors.brand,
  },
  toggleText: {
    color: Colors.textSecondary,
    fontFamily: Typography.family.medium,
    fontSize: 12,
  },
  toggleTextActive: {
    color: Colors.textInverse,
    fontFamily: Typography.family.bold,
    fontSize: 12,
  },
  launchBtn: {
    marginHorizontal: Space.md,
    marginTop: Space.lg,
  },
  // ── Step indicator — refined active/inactive, weighted connectors ──
  stepIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    gap: 0,
  },
  stepItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  stepDot: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: Colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepDotActive: {
    borderColor: Colors.brand,
    backgroundColor: Colors.brand,
  },
  stepDotComplete: {
    backgroundColor: Colors.brand,
    borderColor: Colors.brand,
  },
  stepDotText: {
    fontSize: 12,
    color: Colors.textMuted,
    fontWeight: '700',
    fontFamily: Typography.family.bold,
  },
  stepDotTextActive: {
    color: Colors.textInverse,
  },
  stepLabel: {
    fontSize: 12,
    color: Colors.textMuted,
    fontFamily: Typography.family.medium,
  },
  stepLabelActive: {
    color: Colors.textPrimary,
  },
  stepLabelCurrent: {
    fontFamily: Typography.family.semibold,
  },
  stepConnector: {
    width: 28,
    height: 1.5,
    backgroundColor: Colors.border,
    marginHorizontal: 6,
  },
  stepConnectorActive: {
    backgroundColor: Colors.brand,
    height: 2,
  },
  // ── Review ──
  reviewHeadline: {
    fontSize: 26,
    paddingHorizontal: Space.md,
    marginTop: Space.lg,
    letterSpacing: -0.6,
  },
  reviewSubheadline: {
    color: Colors.textMuted,
    paddingHorizontal: Space.md,
    marginTop: 4,
    marginBottom: Space.sm,
  },
  stageNavRow: {
    flexDirection: 'row',
    gap: Space.sm,
    paddingHorizontal: Space.md,
    marginTop: Space.lg,
    marginBottom: Space.xl,
  },
  stageNavBtn: {
    flex: 1,
  },
  stageNavBtnFull: {
    flex: 1,
  },
  // ── Terms rows ──
  termsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  termsLabel: {
    color: Colors.textMuted,
    fontSize: 10,
    fontFamily: Typography.family.semibold,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  termsValue: {
    color: Colors.textPrimary,
    fontFamily: Typography.family.semibold,
    fontSize: 14,
  },
  termsValueCol: {
    alignItems: 'flex-end',
  },
  termsIzeText: {
    fontSize: 11,
    color: Colors.textMuted,
    fontFamily: Typography.family.regular,
    marginTop: 1,
    fontVariant: ['tabular-nums'],
  },
  // ── Terms & fees — inline, lighter than summary ──
  termsCard: {
    marginHorizontal: Space.md,
    marginTop: Space.sm,
    paddingVertical: Space.sm,
    paddingHorizontal: Space.md,
    borderRadius: Radius.lg,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
    gap: Space.xs,
  },
  termsSectionLabel: {
    fontSize: 10,
    color: Colors.textMuted,
    fontFamily: Typography.family.semibold,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: Space.xs,
  },
  termsInlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  termsInlineLabel: {
    flex: 1,
    fontSize: 13,
    color: Colors.textSecondary,
    fontFamily: Typography.family.regular,
  },
  termsInlineValue: {
    fontSize: 13,
    color: Colors.textPrimary,
    fontFamily: Typography.family.medium,
  },
  // ── Result overlay — crafted success moment ──
  resultOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.88)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Space.lg,
  },
  resultCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.xl,
    padding: Space.lg,
    width: '100%',
    maxWidth: 380,
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 16 }, shadowOpacity: 0.3, shadowRadius: 24 },
      android: { elevation: 16 },
    }),
  },
  resultIconWrap: {
    marginBottom: Space.sm,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(22,163,74,0.12)',
    borderWidth: 1.5,
    borderColor: 'rgba(22,163,74,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  resultTitle: {
    fontSize: 24,
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  resultSubtitle: {
    color: Colors.textMuted,
    textAlign: 'center',
    marginTop: 4,
    marginBottom: Space.md,
  },
  resultImageContainer: {
    width: '100%',
    height: 180,
    borderRadius: Radius.lg,
    marginBottom: Space.md,
    overflow: 'hidden',
  },
  resultImage: {
    width: '100%',
    height: '100%',
  },
  resultSummary: {
    width: '100%',
    marginBottom: Space.md,
  },
  resultActions: {
    flexDirection: 'row',
    gap: Space.sm,
    width: '100%',
  },
  resultBtn: {
    flex: 1,
  },
});