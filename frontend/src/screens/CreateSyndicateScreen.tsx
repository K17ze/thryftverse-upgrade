import React from 'react';
import { View, StyleSheet, StatusBar, ScrollView } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import Reanimated, { FadeInDown } from 'react-native-reanimated';
import { ActiveTheme, Colors } from '../constants/colors';
import { RootStackParamList } from '../navigation/types';
import { MOCK_LISTINGS, Listing } from '../data/mockData';
import { useStore } from '../store/useStore';
import { useToast } from '../context/ToastContext';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { useCurrencyContext } from '../context/CurrencyContext';
import { toFiat, toIze } from '../utils/currency';
import { sanitizeDecimalInput, sanitizeIntegerInput } from '../utils/currencyAuthoringFlows';
import { formatIzeAmount } from '../utils/currency';
import { getCreateCoOwnInitialState } from '../utils/syndicatePrefill';
import { useBackendData } from '../context/BackendDataContext';
import { createCoOwnAsset } from '../services/marketApi';
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
type RouteT = RouteProp<RootStackParamList, 'CreateCoOwn'>;

export default function CreateCoOwnScreen() {
  const navigation = useNavigation<NavT>();
  const route = useRoute<RouteT>();
  const { show } = useToast();
  const { formatFromFiat } = useFormattedPrice();
  const { currencyCode, goldRates } = useCurrencyContext();
  const { listings } = useBackendData();
  const reducedMotionEnabled = useReducedMotion();

  const prefill = route.params;

  const currentUser = useStore((state) => state.currentUser);

  const issuerId = currentUser?.id ?? '';

  const issuerListings = React.useMemo(() => {
    const sourceListings = listings.length ? listings : MOCK_LISTINGS;
    const own = sourceListings.filter((item) => item.sellerId === issuerId);
    return own.length ? own : sourceListings.slice(0, 12);
  }, [issuerId, listings]);

  const initialState = React.useMemo(
    () => getCreateCoOwnInitialState(prefill, issuerListings[0]?.id ?? ''),
    [prefill, issuerListings]
  );

  const [selectedListingId, setSelectedListingId] = React.useState(initialState.selectedListingId);
  const [totalUnitsInput, setTotalUnitsInput] = React.useState(initialState.totalUnitsInput);
  const [unitPriceInput, setUnitPriceInput] = React.useState(initialState.unitPriceInput);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const handleTotalUnitsChange = React.useCallback((value: string) => {
    const sanitized = sanitizeIntegerInput(value);
    if (!sanitized) { setTotalUnitsInput(''); return; }
    const parsed = Math.floor(Number(sanitized));
    if (!Number.isFinite(parsed) || parsed <= 0) { setTotalUnitsInput('1'); return; }
    setTotalUnitsInput(String(Math.min(20, parsed)));
  }, []);

  const fromDisplayToGbp = React.useCallback(
    (amountDisplay: number) => {
      if (currencyCode === 'GBP') return amountDisplay;
      const amountIze = toIze(amountDisplay, currencyCode, goldRates);
      return toFiat(amountIze, 'GBP', goldRates);
    },
    [currencyCode, goldRates]
  );

  React.useEffect(() => {
    if (!issuerListings.length) return;
    if (!issuerListings.some((item) => item.id === selectedListingId)) {
      setSelectedListingId(issuerListings[0].id);
    }
  }, [issuerListings, selectedListingId]);

  const selectedListing = React.useMemo(
    () => issuerListings.find((item) => item.id === selectedListingId),
    [issuerListings, selectedListingId]
  );

  const issueCoOwn = async () => {
    if (!selectedListing) {
      show('Select a listing to issue', 'error');
      return;
    }
    if (!issuerId) {
      show('Sign in to issue co-owns', 'error');
      return;
    }

    const totalUnits = Number(totalUnitsInput);
    if (!Number.isFinite(totalUnits) || totalUnits < 1 || totalUnits > 20 || !Number.isInteger(totalUnits)) {
      show('Units must be an integer between 1 and 20', 'error');
      return;
    }

    const unitPriceGBP = fromDisplayToGbp(Number(unitPriceInput));
    if (!Number.isFinite(unitPriceGBP) || unitPriceGBP <= 0) {
      show(`Enter a valid ${currencyCode} unit price`, 'error');
      return;
    }

    const unitPriceStable = toIze(unitPriceGBP, 'GBP', goldRates);
    if (!Number.isFinite(unitPriceStable) || unitPriceStable <= 0) {
      show('Unable to derive a valid 1ze split value from this price', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      const imageUrl = getListingCoverUri(selectedListing.images, '');
      await createCoOwnAsset({
        listingId: selectedListing.id,
        title: `${selectedListing.title} Split`,
        imageUrl,
        totalUnits,
        unitPriceGbp: unitPriceGBP,
        unitPriceStable,
        settlementMode: 'TVUSD',
      });
      show('Co-Own issued successfully', 'success');
      navigation.goBack();
    } catch (err) {
      show('Failed to issue co-own. Please try again.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const estimatedValue = React.useMemo(() => {
    const units = Number(totalUnitsInput);
    const unitPrice = fromDisplayToGbp(Number(unitPriceInput));
    if (!Number.isFinite(units) || !Number.isFinite(unitPrice)) return 0;
    return units * unitPrice;
  }, [fromDisplayToGbp, totalUnitsInput, unitPriceInput]);

  const estimatedValueIze = React.useMemo(
    () => (estimatedValue > 0 ? toIze(estimatedValue, 'GBP', goldRates) : 0),
    [estimatedValue, goldRates]
  );

  const unitPriceStablePreview = React.useMemo(() => {
    const unitPriceGBP = fromDisplayToGbp(Number(unitPriceInput));
    if (!Number.isFinite(unitPriceGBP) || unitPriceGBP <= 0) return 0;
    return toIze(unitPriceGBP, 'GBP', goldRates);
  }, [fromDisplayToGbp, goldRates, unitPriceInput]);

  const renderListingCard = ({ item }: { item: Listing }) => {
    const selected = item.id === selectedListingId;
    return (
      <AnimatedPressable
        style={[styles.listingCard, selected && styles.listingCardSelected]}
        onPress={() => setSelectedListingId(item.id)}
        activeOpacity={0.9}
        disableAnimation={false}
        scaleValue={0.97}
      >
        <CachedImage
          uri={getListingCoverUri(item.images, 'https://picsum.photos/seed/listing-co-own-fallback/300/400')}
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
    ? getListingCoverUri(selectedListing.images, 'https://picsum.photos/seed/co-own-preview/500/700')
    : 'https://picsum.photos/seed/co-own-preview/500/700';

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <StatusBar barStyle={ActiveTheme === 'light' ? 'dark-content' : 'light-content'} backgroundColor={Colors.background} />

      <TradeHeader
        title="Issue Co-Own"
        showClose
        onClose={() => navigation.goBack()}
        rightAction={
          <AppButton
            title="Issue"
            onPress={issueCoOwn}
            variant="primary"
            size="sm"
            style={styles.headerIssueBtn}
            hapticFeedback="medium"
            accessibilityLabel="Issue co-own"
          />
        }
      />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(Motion.list.enterDuration)}>
          <Meta style={styles.sectionLabel}>SELECT LISTING</Meta>
        </Reanimated.View>

        <FlashList
          data={issuerListings}
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
                {selectedListing ? formatFromFiat(selectedListing.price, 'GBP', { displayMode: 'fiat' }) : '—'}
              </Meta>
            </View>
          </TradeCard>
        </Reanimated.View>

        <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(Motion.list.enterDuration).delay(150)}>
          <TradeCard style={styles.formCard}>
            <Meta style={styles.sectionLabel}>TOTAL UNITS (MAX 20)</Meta>
            <AppInput
              value={totalUnitsInput}
              onChangeText={handleTotalUnitsChange}
              keyboardType="number-pad"
              placeholder="1"
              accessibilityLabel="Total units"
              containerStyle={styles.input}
            />
          </TradeCard>
        </Reanimated.View>

        <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(Motion.list.enterDuration).delay(200)}>
          <TradeCard style={styles.formCard}>
            <Meta style={styles.sectionLabel}>UNIT PRICE ({currencyCode})</Meta>
            <AppInput
              value={unitPriceInput}
              onChangeText={(value) => setUnitPriceInput(sanitizeDecimalInput(value))}
              keyboardType="decimal-pad"
              placeholder="0.00"
              prefix={currencyCode}
              accessibilityLabel="Unit price"
              containerStyle={styles.input}
            />
          </TradeCard>
        </Reanimated.View>

        <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(Motion.list.enterDuration).delay(250)}>
          <TradeCard style={styles.formCard}>
            <Meta style={styles.sectionLabel}>ESTIMATED VALUE</Meta>
            <View style={styles.estimatedRow}>
              <View>
                <BodyEmphasis style={styles.estimatedValue}>
                  {estimatedValue > 0 ? formatFromFiat(estimatedValue, 'GBP', { displayMode: 'fiat' }) : '—'}
                </BodyEmphasis>
                <Meta style={styles.estimatedSub}>
                  {estimatedValueIze > 0 ? `${formatIzeAmount(estimatedValueIze)} 1ze` : ''}
                </Meta>
              </View>
              <View style={styles.stablePreview}>
                <Meta style={styles.stableLabel}>1ze / unit</Meta>
                <Body style={styles.stableValue}>
                  {unitPriceStablePreview > 0 ? formatIzeAmount(unitPriceStablePreview) : '—'}
                </Body>
              </View>
            </View>
          </TradeCard>
        </Reanimated.View>

        <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(Motion.list.enterDuration).delay(300)}>
          <AppButton
            title={isSubmitting ? 'Issuing...' : 'Issue Co-Own'}
            icon={<Ionicons name="flash-outline" size={16} color={Colors.background} />}
            onPress={() => void issueCoOwn()}
            variant="primary"
            size="md"
            style={styles.issueBtn}
            disabled={isSubmitting}
            hapticFeedback="medium"
            accessibilityLabel="Issue co-own"
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
  headerIssueBtn: {
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
  input: {
    marginTop: Space.xs,
  },
  estimatedRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: Space.xs,
  },
  estimatedValue: {
    color: Colors.brand,
  },
  estimatedSub: {
    marginTop: 2,
  },
  stablePreview: {
    alignItems: 'flex-end',
  },
  stableLabel: {},
  stableValue: {
    color: Colors.textPrimary,
    marginTop: 2,
  },
  issueBtn: {
    marginHorizontal: Space.md,
    marginTop: Space.lg,
  },
});
