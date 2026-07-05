import React from 'react';
import { View, StyleSheet, StatusBar, ScrollView, Text, KeyboardAvoidingView, Platform, Pressable } from 'react-native';
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
import { toFiat, toIze, formatAuctionIze } from '../utils/currency';
import { useBackendData } from '../context/BackendDataContext';
import { CachedImage } from '../components/CachedImage';
import { getListingCoverUri } from '../utils/media';
import { AppButton } from '../components/ui/AppButton';
import { AppInput } from '../components/ui/AppInput';
import { TradeHeader } from '../components/trade';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { Space, Radius, Typography } from '../theme/designTokens';
import { Motion } from '../constants/motion';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { Meta, BodyEmphasis } from '../components/ui/Text';
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
          <BodyEmphasis style={styles.listingTitle} numberOfLines={2}>{item.title}</BodyEmphasis>
          <Meta style={styles.listingPrice}>{formatFromFiat(item.price, 'GBP')}</Meta>
        </View>
        {selected && (
          <View style={styles.selectedTick}>
            <Ionicons name="checkmark" size={12} color={Colors.textInverse} />
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

      {/* Step progress — slim line, compact labels */}
      <View style={styles.stepIndicator}>
        {['Listing', 'Configure', 'Review'].map((label, i) => {
          const isComplete = i < stage;
          const isActive = i === stage;
          return (
            <React.Fragment key={label}>
              <View style={styles.stepItem}>
                <View style={[styles.stepDot, isComplete && styles.stepDotComplete, isActive && styles.stepDotActive]}>
                  {isComplete ? (
                    <Ionicons name="checkmark" size={11} color={Colors.textInverse} />
                  ) : (
                    <Text style={[styles.stepDotText, (isActive || isComplete) && styles.stepDotTextActive]}>{i + 1}</Text>
                  )}
                </View>
                <Text style={[styles.stepLabel, (isActive || isComplete) && styles.stepLabelActive, isActive && styles.stepLabelCurrent]}>{label}</Text>
              </View>
              {i < 2 && <View style={[styles.stepConnector, i < stage && styles.stepConnectorActive]} />}
            </React.Fragment>
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
                  <Meta style={styles.sectionLabel}>Select listing</Meta>
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
                  <View style={styles.previewRow}>
                    <CachedImage
                      uri={previewImage}
                      style={styles.previewThumb}
                      containerStyle={styles.previewThumbContainer}
                      contentFit="cover"
                    />
                    <View style={styles.previewMeta}>
                      <BodyEmphasis style={styles.previewTitle} numberOfLines={2}>
                        {selectedListing?.title ?? 'Select a listing'}
                      </BodyEmphasis>
                      <Meta style={styles.previewPrice}>
                        {selectedListing ? formatFromFiat(selectedListing.price, 'GBP') : '—'}
                      </Meta>
                    </View>
                  </View>
                </Reanimated.View>
              </>
            )}

            {/* ── Stage 1: Configure ── */}
            {stage === 1 && (
              <>
                {/* Starts */}
                <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(Motion.list.enterDuration)}>
                  <View style={styles.formSection}>
                    <Text style={styles.formSectionLabel}>Starts</Text>
                    <View style={styles.windowRow}>
                      {START_WINDOWS.map((win) => (
                        <AnimatedPressable
                          key={win.minutes}
                          style={[
                            styles.windowChip,
                            startInMinutes === win.minutes && styles.windowChipActive,
                          ]}
                          onPress={() => setStartInMinutes(win.minutes)}
                          activeOpacity={0.7}
                          hapticFeedback="light"
                          accessibilityRole="button"
                          accessibilityState={{ selected: startInMinutes === win.minutes }}
                          accessibilityLabel={`Start ${win.label}`}
                        >
                          <Text style={[styles.windowChipText, startInMinutes === win.minutes && styles.windowChipTextActive]}>
                            {win.label}
                          </Text>
                        </AnimatedPressable>
                      ))}
                    </View>
                  </View>
                </Reanimated.View>

                <View style={styles.formHairline} />

                {/* Duration */}
                <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(Motion.list.enterDuration).delay(100)}>
                  <View style={styles.formSection}>
                    <Text style={styles.formSectionLabel}>Duration</Text>
                    <View style={styles.windowRow}>
                      {DURATION_OPTIONS.map((opt) => (
                        <AnimatedPressable
                          key={opt.hours}
                          style={[
                            styles.windowChip,
                            durationHours === opt.hours && styles.windowChipActive,
                          ]}
                          onPress={() => setDurationHours(opt.hours)}
                          activeOpacity={0.7}
                          hapticFeedback="light"
                          accessibilityRole="button"
                          accessibilityState={{ selected: durationHours === opt.hours }}
                          accessibilityLabel={`Duration ${opt.label}`}
                        >
                          <Text style={[styles.windowChipText, durationHours === opt.hours && styles.windowChipTextActive]}>
                            {opt.label}
                          </Text>
                        </AnimatedPressable>
                      ))}
                    </View>
                  </View>
                </Reanimated.View>

                <View style={styles.formHairline} />

                {/* Starting bid */}
                <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(Motion.list.enterDuration).delay(150)}>
                  <View style={styles.formSection}>
                    <Text style={styles.formSectionLabel}>Starting bid</Text>
                    <AppInput
                      value={startingBidInput}
                      onChangeText={setStartingBidInput}
                      keyboardType="decimal-pad"
                      placeholder="0.00"
                      prefix={currencyCode}
                      accessibilityLabel="Starting bid"
                      containerStyle={styles.input}
                    />
                    {startingBidInput && Number(startingBidInput) > 0 && (
                      <Text style={styles.inputIzeHint}>
                        {formatAuctionIze(toIze(Number(startingBidInput), currencyCode as any, goldRates))}
                      </Text>
                    )}
                  </View>
                </Reanimated.View>

                <View style={styles.formHairline} />

                {/* Buy Now */}
                <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(Motion.list.enterDuration).delay(200)}>
                  <View style={styles.formSection}>
                    <View style={styles.buyNowRow}>
                      <Text style={styles.formSectionLabel}>Buy now price</Text>
                      <Pressable
                        style={({ pressed }) => [styles.switchTrack, buyNowEnabled && styles.switchTrackActive, pressed && { opacity: 0.7 }]}
                        onPress={() => setBuyNowEnabled((v) => !v)}
                        accessibilityRole="switch"
                        accessibilityState={{ checked: buyNowEnabled }}
                        accessibilityLabel="Toggle buy now"
                      >
                        <View style={[styles.switchThumb, buyNowEnabled && styles.switchThumbActive]} />
                      </Pressable>
                    </View>
                    {buyNowEnabled && (
                      <>
                        <AppInput
                          value={buyNowInput}
                          onChangeText={setBuyNowInput}
                          keyboardType="decimal-pad"
                          placeholder="0.00"
                          prefix={currencyCode}
                          accessibilityLabel="Buy now price"
                          containerStyle={styles.input}
                        />
                        {buyNowInput && Number(buyNowInput) > 0 && (
                          <Text style={styles.inputIzeHint}>
                            {formatAuctionIze(toIze(Number(buyNowInput), currencyCode as any, goldRates))}
                          </Text>
                        )}
                      </>
                    )}
                  </View>
                </Reanimated.View>
              </>
            )}

            {/* ── Stage 2: Review & Launch — one coherent receipt ── */}
            {stage === 2 && (
              <>
                <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(Motion.list.enterDuration)}>
                  <Text style={styles.reviewHeadline}>Review your auction</Text>
                  <Text style={styles.reviewSubheadline}>Confirm the details below before launching.</Text>
                </Reanimated.View>

                {/* Item identity — compact media + title */}
                <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(Motion.list.enterDuration).delay(100)}>
                  <View style={styles.reviewItemRow}>
                    <CachedImage
                      uri={previewImage}
                      style={styles.reviewThumb}
                      containerStyle={styles.reviewThumbContainer}
                      contentFit="cover"
                    />
                    <View style={styles.reviewItemMeta}>
                      <Text style={styles.reviewItemTitle} numberOfLines={2}>
                        {selectedListing?.title ?? 'Select a listing'}
                      </Text>
                      <Text style={styles.reviewItemPrice}>
                        {selectedListing ? formatFromFiat(selectedListing.price, 'GBP') : '—'}
                      </Text>
                    </View>
                  </View>
                </Reanimated.View>

                {/* Launch receipt — hairline-divided rows on page surface */}
                <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(Motion.list.enterDuration).delay(150)}>
                  <View style={styles.receiptSection}>
                    <View style={styles.termsRow}>
                      <Text style={styles.termsLabel}>Starts</Text>
                      <Text style={styles.termsValue}>
                        {startInMinutes === 0 ? 'Immediately' : `In ${START_WINDOWS.find(w => w.minutes === startInMinutes)?.label ?? startInMinutes + 'm'}`}
                      </Text>
                    </View>
                    <View style={styles.termsRow}>
                      <Text style={styles.termsLabel}>Duration</Text>
                      <Text style={styles.termsValue}>
                        {DURATION_OPTIONS.find(d => d.hours === durationHours)?.label ?? `${durationHours}h`}
                      </Text>
                    </View>
                    <View style={styles.termsRow}>
                      <Text style={styles.termsLabel}>Starting bid</Text>
                      <View style={styles.termsValueCol}>
                        <Text style={styles.termsValue}>
                          {startingBidInput ? `${currencyCode} ${startingBidInput}` : '—'}
                        </Text>
                        {startingBidInput && (
                          <Text style={styles.termsIzeText}>
                            {formatAuctionIze(toIze(Number(startingBidInput), currencyCode as any, goldRates))}
                          </Text>
                        )}
                      </View>
                    </View>
                    <View style={styles.termsRow}>
                      <Text style={styles.termsLabel}>Buy now</Text>
                      <View style={styles.termsValueCol}>
                        <Text style={styles.termsValue}>
                          {buyNowEnabled && buyNowInput ? `${currencyCode} ${buyNowInput}` : 'Disabled'}
                        </Text>
                        {buyNowEnabled && buyNowInput && (
                          <Text style={styles.termsIzeText}>
                            {formatAuctionIze(toIze(Number(buyNowInput), currencyCode as any, goldRates))}
                          </Text>
                        )}
                      </View>
                    </View>
                    <View style={styles.termsRow}>
                      <Text style={styles.termsLabel}>Platform fee</Text>
                      <Text style={styles.termsValue}>3% of winning bid</Text>
                    </View>
                    <View style={styles.termsRow}>
                      <Text style={styles.termsLabel}>Settlement</Text>
                      <Text style={styles.termsValue}>After auction ends</Text>
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

      {/* ── Result overlay — compact confirmation ── */}
      {resultData && (
        <View style={styles.resultOverlay}>
          <StatusBar barStyle="light-content" />
          <Reanimated.View
            entering={reducedMotionEnabled ? undefined : FadeInDown.duration(400)}
            style={styles.resultCard}
          >
            <Ionicons name="checkmark-circle" size={32} color={Colors.success} style={styles.resultIcon} />
            <Text style={styles.resultTitle}>
              {resultData.startLabel === 'Immediately' ? 'Auction is now live' : 'Auction scheduled'}
            </Text>
            <Text style={styles.resultSubtitle} numberOfLines={2}>{resultData.title}</Text>

            <View style={styles.resultSummary}>
              <View style={styles.termsRow}>
                <Text style={styles.termsLabel}>Starts</Text>
                <Text style={styles.termsValue}>{resultData.startLabel}</Text>
              </View>
              <View style={styles.termsRow}>
                <Text style={styles.termsLabel}>Duration</Text>
                <Text style={styles.termsValue}>{resultData.durationLabel}</Text>
              </View>
              <View style={styles.termsRow}>
                <Text style={styles.termsLabel}>Starting bid</Text>
                <View style={styles.termsValueCol}>
                  <Text style={styles.termsValue}>{resultData.startingBid}</Text>
                  {startingBidInput && (
                    <Text style={styles.termsIzeText}>
                      {formatAuctionIze(toIze(Number(startingBidInput), currencyCode as any, goldRates))}
                    </Text>
                  )}
                </View>
              </View>
              {resultData.buyNow && (
                <View style={styles.termsRow}>
                  <Text style={styles.termsLabel}>Buy now</Text>
                  <View style={styles.termsValueCol}>
                    <Text style={styles.termsValue}>{resultData.buyNow}</Text>
                    {buyNowInput && (
                      <Text style={styles.termsIzeText}>
                        {formatAuctionIze(toIze(Number(buyNowInput), currencyCode as any, goldRates))}
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
                title="Return to Seller Centre"
                onPress={() => navigation.goBack()}
                variant="secondary"
                size="md"
                style={styles.resultBtn}
                accessibilityLabel="Return to Seller Centre"
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
  // ── Listing cards — compact, subtle keyline selected state ──
  listingListContent: {
    paddingHorizontal: Space.md,
    gap: Space.sm,
    paddingBottom: Space.sm,
  },
  listingCard: {
    width: 120,
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  listingCardSelected: {
    borderColor: Colors.brand,
    borderWidth: 1.5,
  },
  listingImageContainer: {
    width: '100%',
    height: 100,
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
    top: 6,
    right: 6,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: Colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // ── Compact preview row (stage 0) ──
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
  },
  previewThumbContainer: {
    width: 56,
    height: 56,
    borderRadius: Radius.sm,
    overflow: 'hidden',
  },
  previewThumb: {
    width: '100%',
    height: '100%',
  },
  previewMeta: {
    flex: 1,
  },
  previewTitle: {},
  previewPrice: {
    marginTop: 2,
  },
  // ── Form sections — page surface, hairline dividers ──
  formSection: {
    paddingHorizontal: Space.md,
    paddingVertical: Space.md,
  },
  formSectionLabel: {
    fontSize: 14,
    color: Colors.textPrimary,
    fontFamily: Typography.family.semibold,
    letterSpacing: -0.2,
    marginBottom: Space.sm,
  },
  formHairline: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Colors.border,
    marginHorizontal: Space.md,
  },
  windowRow: {
    flexDirection: 'row',
    gap: Space.sm,
  },
  // ── Selection chips — precise, no heavy shadow ──
  windowChip: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
    backgroundColor: Colors.surfaceAlt,
    paddingVertical: 11,
    minHeight: 44,
  },
  windowChipActive: {
    backgroundColor: Colors.brand,
    borderColor: Colors.brand,
  },
  windowChipPressed: {
    opacity: 0.7,
  },
  windowChipText: {
    fontSize: 14,
    color: Colors.textSecondary,
    fontFamily: Typography.family.medium,
  },
  windowChipTextActive: {
    color: Colors.textInverse,
    fontFamily: Typography.family.semibold,
  },
  input: {
    marginTop: 0,
  },
  inputIzeHint: {
    fontSize: 12,
    color: Colors.textMuted,
    fontFamily: Typography.family.regular,
    marginTop: 6,
    fontVariant: ['tabular-nums'],
  },
  buyNowRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  // ── Switch — accessible native-style ──
  switchTrack: {
    width: 44,
    height: 26,
    borderRadius: 13,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
    backgroundColor: Colors.surfaceAlt,
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  switchTrackActive: {
    backgroundColor: Colors.brand,
    borderColor: Colors.brand,
  },
  switchThumb: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Colors.surface,
    alignSelf: 'flex-start',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.2, shadowRadius: 2 },
      android: { elevation: 1 },
    }),
  },
  switchThumbActive: {
    alignSelf: 'flex-end',
  },
  launchBtn: {
    marginHorizontal: Space.md,
    marginTop: Space.lg,
  },
  // ── Step progress — slim line, compact labels ──
  stepIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
  },
  stepItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  stepDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: Colors.border,
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
    fontSize: 10,
    color: Colors.textMuted,
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
    width: 24,
    height: 1.5,
    backgroundColor: Colors.border,
    marginHorizontal: 4,
  },
  stepConnectorActive: {
    backgroundColor: Colors.brand,
  },
  // ── Review ──
  reviewHeadline: {
    fontSize: 22,
    paddingHorizontal: Space.md,
    marginTop: Space.lg,
    marginBottom: 4,
    color: Colors.textPrimary,
    fontFamily: Typography.family.bold,
    letterSpacing: -0.5,
  },
  reviewSubheadline: {
    color: Colors.textMuted,
    paddingHorizontal: Space.md,
    marginBottom: Space.sm,
    fontSize: 14,
    fontFamily: Typography.family.regular,
  },
  reviewItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
  },
  reviewThumbContainer: {
    width: 56,
    height: 56,
    borderRadius: Radius.sm,
    overflow: 'hidden',
  },
  reviewThumb: {
    width: '100%',
    height: '100%',
  },
  reviewItemMeta: {
    flex: 1,
  },
  reviewItemTitle: {
    fontSize: 15,
    color: Colors.textPrimary,
    fontFamily: Typography.family.semibold,
    letterSpacing: -0.2,
  },
  reviewItemPrice: {
    fontSize: 13,
    color: Colors.textMuted,
    fontFamily: Typography.family.regular,
    marginTop: 2,
  },
  receiptSection: {
    paddingHorizontal: Space.md,
    marginTop: Space.sm,
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
    color: Colors.textSecondary,
    fontSize: 13,
    fontFamily: Typography.family.regular,
    letterSpacing: -0.1,
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
  // ── Result overlay — compact confirmation ──
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
  },
  resultCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Space.lg,
    width: '100%',
    maxWidth: 360,
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.2, shadowRadius: 16 },
      android: { elevation: 8 },
    }),
  },
  resultIcon: {
    marginBottom: Space.sm,
  },
  resultTitle: {
    fontSize: 20,
    textAlign: 'center',
    fontFamily: Typography.family.bold,
    color: Colors.textPrimary,
    letterSpacing: -0.4,
  },
  resultSubtitle: {
    color: Colors.textMuted,
    textAlign: 'center',
    marginTop: 4,
    marginBottom: Space.md,
    fontSize: 14,
    fontFamily: Typography.family.regular,
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
});,
}); flex: 1,
  },
});,
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
});,
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
});,
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
});,
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
}); borderWidth: StyleSheet.hairlineWidth,
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
});esultSummary: {
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
});esultImage: {
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
});,
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
}); overflow: 'hidden',
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