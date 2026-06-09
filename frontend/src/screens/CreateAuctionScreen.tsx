import React from 'react';
import { View, StyleSheet, StatusBar, ScrollView } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import Reanimated, { FadeInDown } from 'react-native-reanimated';
import { ActiveTheme, Colors } from '../constants/colors';
import { RootStackParamList } from '../navigation/types';
import { MOCK_LISTINGS, MOCK_USERS, Listing } from '../data/mockData';
import type { AuctionMarketItem } from '../data/tradeHub';
import { useStore } from '../store/useStore';
import { useToast } from '../context/ToastContext';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { useCurrencyContext } from '../context/CurrencyContext';
import { toFiat, toIze } from '../utils/currency';
import { useBackendData } from '../context/BackendDataContext';
import { CachedImage } from '../components/CachedImage';
import { getListingCoverUri } from '../utils/media';
import { AppButton } from '../components/ui/AppButton';
import { AppInput } from '../components/ui/AppInput';
import { TradeHeader, TradeCard } from '../components/trade';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { Space, Radius } from '../theme/designTokens';
import { Motion } from '../constants/motion';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { Meta, BodyEmphasis, Body } from '../components/ui/Text';

type NavT = StackNavigationProp<RootStackParamList>;

const AUCTION_WINDOW_HOURS = 6;
const START_WINDOWS = [
  { label: 'Now', minutes: 0 },
  { label: '30m', minutes: 30 },
  { label: '1h', minutes: 60 },
  { label: '3h', minutes: 180 },
];

export default function CreateAuctionScreen() {
  const navigation = useNavigation<NavT>();
  const { show } = useToast();
  const { formatFromFiat } = useFormattedPrice();
  const { currencyCode, goldRates } = useCurrencyContext();
  const { listings } = useBackendData();
  const reducedMotionEnabled = useReducedMotion();

  const currentUser = useStore((state) => state.currentUser);
  const addAuction = useStore((state) => state.addAuction);

  const sellerId = currentUser?.id ?? MOCK_USERS[0]?.id ?? 'u1';

  const sellerListings = React.useMemo(() => {
    const sourceListings = listings.length ? listings : MOCK_LISTINGS;
    const own = sourceListings.filter((item) => item.sellerId === sellerId);
    return own.length ? own : sourceListings.slice(0, 12);
  }, [listings, sellerId]);

  const [selectedListingId, setSelectedListingId] = React.useState(sellerListings[0]?.id ?? '');
  const [startInMinutes, setStartInMinutes] = React.useState(0);
  const [startingBidInput, setStartingBidInput] = React.useState('');
  const [buyNowEnabled, setBuyNowEnabled] = React.useState(true);
  const [buyNowInput, setBuyNowInput] = React.useState('');

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

  const launchAuction = () => {
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

    let buyNowPrice: number | undefined;
    if (buyNowEnabled) {
      buyNowPrice = fromDisplayToGbp(Number(buyNowInput));
      if (!Number.isFinite(buyNowPrice) || buyNowPrice <= startingBid) {
        show('Buy now must be greater than starting bid', 'error');
        return;
      }
    }

    const now = Date.now();
    const startsAtMs = now + startInMinutes * 60 * 1000;
    const endsAtMs = startsAtMs + AUCTION_WINDOW_HOURS * 60 * 60 * 1000;

    const newAuction: AuctionMarketItem = {
      id: `a_user_${now}`,
      listingId: selectedListing.id,
      sellerId,
      title: selectedListing.title,
      image: getListingCoverUri(selectedListing.images, ''),
      startsAt: new Date(startsAtMs).toISOString(),
      endsAt: new Date(endsAtMs).toISOString(),
      startingBid,
      currentBid: startingBid,
      bidCount: 0,
      ...(buyNowPrice ? { buyNowPrice } : {}),
    };

    addAuction(newAuction);
    show(startInMinutes > 0 ? 'Auction scheduled successfully' : 'Auction is now live', 'success');
    navigation.goBack();
  };

  const renderListingCard = ({ item }: { item: Listing }) => {
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
          <Meta style={styles.listingPrice}>{formatFromFiat(item.price, 'GBP', { displayMode: 'fiat' })}</Meta>
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
      <StatusBar barStyle={ActiveTheme === 'light' ? 'dark-content' : 'light-content'} backgroundColor={Colors.background} />

      <TradeHeader
        title="Launch Auction"
        showClose
        onClose={() => navigation.goBack()}
        rightAction={
          <AppButton
            title="Launch"
            onPress={launchAuction}
            variant="primary"
            size="sm"
            style={styles.headerLaunchBtn}
            hapticFeedback="medium"
            accessibilityLabel="Launch auction"
          />
        }
      />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Reanimated.View
          entering={reducedMotionEnabled ? undefined : FadeInDown.duration(Motion.list.enterDuration)}
        >
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

        <Reanimated.View
          entering={reducedMotionEnabled ? undefined : FadeInDown.duration(Motion.list.enterDuration).delay(100)}
        >
          <TradeCard variant="elevated" style={styles.previewCard}>
            <CachedImage uri={previewImage} style={styles.previewImage} containerStyle={styles.previewImageContainer} contentFit="cover" />
            <View style={styles.previewMeta}>
              <BodyEmphasis style={styles.previewTitle} numberOfLines={1}>
                {selectedListing?.title ?? 'Select a listing'}
              </BodyEmphasis>
              <Meta style={styles.previewPrice}>
                {selectedListing ? formatFromFiat(selectedListing.price, 'GBP', { displayMode: 'fiat' }) : '—'}
              </Meta>
            </View>
          </TradeCard>
        </Reanimated.View>

        <Reanimated.View
          entering={reducedMotionEnabled ? undefined : FadeInDown.duration(Motion.list.enterDuration).delay(150)}
        >
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

        <Reanimated.View
          entering={reducedMotionEnabled ? undefined : FadeInDown.duration(Motion.list.enterDuration).delay(200)}
        >
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

        <Reanimated.View
          entering={reducedMotionEnabled ? undefined : FadeInDown.duration(Motion.list.enterDuration).delay(250)}
        >
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

        <Reanimated.View
          entering={reducedMotionEnabled ? undefined : FadeInDown.duration(Motion.list.enterDuration).delay(300)}
        >
          <AppButton
            title="Launch Auction"
            icon={<Ionicons name="flash-outline" size={16} color={Colors.background} />}
            onPress={launchAuction}
            variant="primary"
            size="md"
            style={styles.launchBtn}
            hapticFeedback="medium"
            accessibilityLabel="Launch auction"
          />
        </Reanimated.View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  headerLaunchBtn: {
    borderRadius: 12,
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
  listingListContent: {
    paddingHorizontal: Space.md,
    gap: Space.sm,
    paddingBottom: Space.sm,
  },
  listingCard: {
    width: 120,
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  listingCardSelected: {
    borderColor: Colors.brand,
    borderWidth: 2,
  },
  listingImageContainer: {
    width: '100%',
    height: 140,
    borderTopLeftRadius: Radius.md,
    borderTopRightRadius: Radius.md,
  },
  listingImage: {
    width: '100%',
    height: '100%',
  },
  listingMeta: {
    padding: 8,
  },
  listingTitle: {
    marginBottom: 2,
  },
  listingPrice: {},
  selectedTick: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: Colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewCard: {
    marginTop: Space.sm,
    padding: Space.sm,
  },
  previewImageContainer: {
    width: '100%',
    height: 200,
    borderRadius: Radius.md,
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
  formCard: {
    marginTop: Space.sm,
  },
  windowRow: {
    flexDirection: 'row',
    gap: Space.sm,
    marginTop: Space.xs,
  },
  windowChip: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    paddingVertical: 10,
    minHeight: 40,
  },
  windowChipActive: {
    backgroundColor: Colors.brand,
    borderColor: Colors.brand,
  },
  windowChipText: {
    color: Colors.textSecondary,
  },
  windowChipTextActive: {
    color: Colors.textInverse,
  },
  input: {
    marginTop: Space.xs,
  },
  buyNowRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  toggleChip: {
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surfaceAlt,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  toggleChipActive: {
    backgroundColor: Colors.brand,
    borderColor: Colors.brand,
  },
  toggleText: {
    color: Colors.textSecondary,
  },
  toggleTextActive: {
    color: Colors.textInverse,
  },
  launchBtn: {
    marginHorizontal: Space.md,
    marginTop: Space.lg,
  },
});
