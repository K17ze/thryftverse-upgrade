import React from 'react';
import { View, Text, StyleSheet, StatusBar, ScrollView, useWindowDimensions } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import Reanimated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import { useAppTheme } from '../theme/ThemeContext';
import { RootStackParamList } from '../navigation/types';
import { useStore } from '../store/useStore';
import { useToast } from '../context/ToastContext';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { useCurrencyContext } from '../context/CurrencyContext';
import { toFiat, toIze, formatIzeAmount } from '../utils/currency';
import { sanitizeDecimalInput, sanitizeIntegerInput } from '../utils/currencyAuthoringFlows';
import { getCreateCoOwnInitialState } from '../utils/syndicatePrefill';
import { createCoOwnAsset } from '../services/marketApi';
import { fetchUserListingsFromApi, type ListingApiItem } from '../services/listingsApi';
import { CachedImage } from '../components/CachedImage';
import { getListingCoverUri } from '../utils/media';
import { AppButton } from '../components/ui/AppButton';
import { AppInput } from '../components/ui/AppInput';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { Space, Radius, Type, Typography } from '../theme/designTokens';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useHaptic } from '../hooks/useHaptic';
import { haptics } from '../utils/haptics';
import {
  CoOwnMarketHeader,
  CoOwnIssueStudioStep,
  CoOwnStickyActionDock,
  CoOwnRiskDisclosure,
  CoOwnCreateStudioSkeleton,
  CoOwnStateCanvas,
} from '../components/coown';

type NavT = StackNavigationProp<RootStackParamList>;
type RouteT = RouteProp<RootStackParamList, 'CreateCoOwn'>;

// The backend enforces a maximum of 20 units per Co-Own issuance.
// This is a real backend constraint, not a UI-only limit.
const MAX_UNITS = 20;

type Stage = 'select' | 'configure' | 'review';

export default function CreateCoOwnScreen() {
  const navigation = useNavigation<NavT>();
  const route = useRoute<RouteT>();
  const { colors, isDark } = useAppTheme();
  const { show } = useToast();
  const { formatFromFiat } = useFormattedPrice();
  const { currencyCode, goldRates } = useCurrencyContext();
  const reducedMotionEnabled = useReducedMotion();
  const haptic = useHaptic();
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();

  const prefill = route.params;

  const currentUser = useStore((state) => state.currentUser);
  const issuerId = currentUser?.id ?? '';

  // Fetch issuer listings from the backend API (not mockData).
  const [issuerListings, setIssuerListings] = React.useState<ListingApiItem[]>([]);
  const [isLoadingListings, setIsLoadingListings] = React.useState(true);

  React.useEffect(() => {
    if (!issuerId) { setIsLoadingListings(false); return; }
    let cancelled = false;
    setIsLoadingListings(true);

    fetchUserListingsFromApi(issuerId, { status: 'active', limit: 50 })
      .then((result) => {
        if (cancelled) return;
        setIssuerListings(result.items);
      })
      .catch(() => {
        if (cancelled) return;
        setIssuerListings([]);
      })
      .finally(() => {
        if (!cancelled) setIsLoadingListings(false);
      });

    return () => { cancelled = true; };
  }, [issuerId]);

  const initialState = React.useMemo(
    () => getCreateCoOwnInitialState(prefill, issuerListings[0]?.id ?? ''),
    [prefill, issuerListings]
  );

  const [stage, setStage] = React.useState<Stage>('select');
  const [selectedListingId, setSelectedListingId] = React.useState(initialState.selectedListingId);
  const [totalUnitsInput, setTotalUnitsInput] = React.useState(initialState.totalUnitsInput);
  const [unitPriceInput, setUnitPriceInput] = React.useState(initialState.unitPriceInput);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const handleTotalUnitsChange = React.useCallback((value: string) => {
    const sanitized = sanitizeIntegerInput(value);
    if (!sanitized) { setTotalUnitsInput(''); return; }
    const parsed = Math.floor(Number(sanitized));
    if (!Number.isFinite(parsed) || parsed <= 0) { setTotalUnitsInput('1'); return; }
    setTotalUnitsInput(String(Math.min(MAX_UNITS, parsed)));
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
    if (!Number.isFinite(totalUnits) || totalUnits < 1 || totalUnits > MAX_UNITS || !Number.isInteger(totalUnits)) {
      show(`Units must be an integer between 1 and ${MAX_UNITS}`, 'error');
      return;
    }

    const unitPriceGBP = fromDisplayToGbp(Number(unitPriceInput));
    if (!Number.isFinite(unitPriceGBP) || unitPriceGBP <= 0) {
      show(`Enter a valid ${currencyCode} unit price`, 'error');
      return;
    }

    const unitPriceStable = toIze(unitPriceGBP, 'GBP', goldRates);
    if (!Number.isFinite(unitPriceStable) || unitPriceStable <= 0) {
      show('Unable to derive a valid stablecoin value from this price', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      const imageUrl = getListingCoverUri(selectedListing.images, selectedListing.imageUrl ?? '');
      await createCoOwnAsset({
        listingId: selectedListing.id,
        issuerId,
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

  const previewImage = selectedListing
    ? getListingCoverUri(selectedListing.images, selectedListing.imageUrl ?? '')
    : '';

  const canProceedToConfigure = !!selectedListing;
  const canProceedToReview = !!selectedListing
    && Number(totalUnitsInput) >= 1
    && Number(totalUnitsInput) <= MAX_UNITS
    && Number(unitPriceInput) > 0;

  const handleNext = () => {
    if (stage === 'select' && canProceedToConfigure) {
      haptic.medium();
      setStage('configure');
    } else if (stage === 'configure' && canProceedToReview) {
      haptic.medium();
      setStage('review');
    }
  };

  const handleBack = () => {
    if (stage === 'configure') {
      setStage('select');
    } else if (stage === 'review') {
      setStage('configure');
    } else {
      navigation.goBack();
    }
  };

  const stageTitles: Record<Stage, string> = {
    select: 'Select listing',
    configure: 'Configure',
    review: 'Review & issue',
  };

  const renderListingCard = ({ item }: { item: ListingApiItem }) => {
    const selected = item.id === selectedListingId;
    return (
      <AnimatedPressable
        style={[
          styles.listingCard,
          { backgroundColor: colors.surface, borderColor: selected ? colors.brand : colors.border },
        ]}
        onPress={() => { haptic.selection(); setSelectedListingId(item.id); }}
        scaleValue={0.97}
        accessibilityRole="button"
        accessibilityLabel={`Select ${item.title}`}
        accessibilityState={{ selected }}
      >
        <CachedImage
          uri={getListingCoverUri(item.images, item.imageUrl ?? '')}
          style={styles.listingImage}
          containerStyle={styles.listingImageContainer}
          contentFit="cover"
        />
        <View style={styles.listingMeta}>
          <Text style={[styles.listingTitle, { color: colors.textPrimary }]} numberOfLines={1}>{item.title}</Text>
          <Text style={[styles.listingPrice, { color: colors.textSecondary }]}>
            {formatFromFiat(item.priceGbp, 'GBP', { displayMode: 'fiat' })}
          </Text>
        </View>
        {selected && (
          <View style={[styles.selectedTick, { backgroundColor: colors.brand }]}>
            <Ionicons name="checkmark" size={12} color={colors.background} />
          </View>
        )}
      </AnimatedPressable>
    );
  };

  // ── Loading state ──
  if (isLoadingListings) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <CoOwnMarketHeader
          title="Issue Co-Own"
          subtitle="Create a shared ownership item"
          onBack={handleBack}
        />
        <CoOwnCreateStudioSkeleton />
      </SafeAreaView>
    );
  }

  // ── Empty state (no listings) ──
  if (issuerListings.length === 0) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <CoOwnMarketHeader
          title="Issue Co-Own"
          subtitle="Create a shared ownership item"
          onBack={handleBack}
        />
        <CoOwnStateCanvas
          variant="empty"
          title={issuerId ? 'No eligible listings' : 'Sign in required'}
          subtitle={issuerId
            ? 'Create a listing first to issue a Co-Own from it.'
            : 'Sign in to issue a Co-Own from your listings.'
          }
          actionLabel={issuerId ? 'Create listing' : 'Sign in'}
          onAction={() => {
            haptics.tap();
            if (issuerId) navigation.navigate('Sell');
            else navigation.goBack();
          }}
          emptyGraphicVariant="box"
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <StatusBar style={isDark ? 'light' : 'dark'} />

      <CoOwnMarketHeader
        title={stageTitles[stage]}
        subtitle="Issue Co-Own"
        onBack={handleBack}
      />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* ── Stage 1: Select listing ── */}
        {stage === 'select' && (
          <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeIn.duration(300)}>
            <CoOwnIssueStudioStep
              stepNumber={1}
              totalSteps={3}
              title="Select a listing"
              description="Choose one of your active listings to split into Co-Own units."
            >
              <FlashList
                data={issuerListings}
                horizontal
                keyExtractor={(item) => item.id}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.listingListContent}
                renderItem={renderListingCard}
                estimatedItemSize={180}
              />

              {selectedListing && (
                <View style={[styles.previewCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <CachedImage uri={previewImage} style={styles.previewImage} containerStyle={styles.previewImageContainer} contentFit="cover" />
                  <View style={styles.previewMeta}>
                    <Text style={[styles.previewTitle, { color: colors.textPrimary }]} numberOfLines={1}>
                      {selectedListing.title}
                    </Text>
                    <Text style={[styles.previewPrice, { color: colors.textSecondary }]}>
                      {formatFromFiat(selectedListing.priceGbp, 'GBP', { displayMode: 'fiat' })}
                    </Text>
                  </View>
                </View>
              )}
            </CoOwnIssueStudioStep>
          </Reanimated.View>
        )}

        {/* ── Stage 2: Configure units and price ── */}
        {stage === 'configure' && (
          <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeIn.duration(300)}>
            <CoOwnIssueStudioStep
              stepNumber={2}
              totalSteps={3}
              title="Configure units & price"
              description="Set how many units to split the item into and the price per unit."
            >
              {/* Selected listing context */}
              <View style={[styles.contextCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <CachedImage uri={previewImage} style={styles.contextImage} contentFit="cover" />
                <View style={styles.contextInfo}>
                  <Text style={[styles.contextTitle, { color: colors.textPrimary }]} numberOfLines={1}>{selectedListing?.title}</Text>
                  <Text style={[styles.contextPrice, { color: colors.textSecondary }]}>
                    {selectedListing ? formatFromFiat(selectedListing.priceGbp, 'GBP', { displayMode: 'fiat' }) : '—'}
                  </Text>
                </View>
              </View>

              {/* Total units */}
              <View style={[styles.formCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={styles.formLabelRow}>
                  <Text style={[styles.formLabel, { color: colors.textMuted }]}>Total units</Text>
                  <Text style={[styles.formHint, { color: colors.textMuted }]}>Max {MAX_UNITS}</Text>
                </View>
                <AppInput
                  value={totalUnitsInput}
                  onChangeText={handleTotalUnitsChange}
                  keyboardType="number-pad"
                  placeholder="1"
                  suffix="units"
                  accessibilityLabel="Total units"
                />
                <View style={styles.unitPresets}>
                  {[5, 10, 20].map((preset) => (
                    <AnimatedPressable
                      key={preset}
                      style={[styles.unitPreset, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}
                      onPress={() => { haptic.selection(); setTotalUnitsInput(String(preset)); }}
                      accessibilityRole="button"
                      accessibilityLabel={`Set units to ${preset}`}
                      scaleValue={0.96}
                      hapticFeedback="light"
                    >
                      <Text style={[styles.unitPresetText, { color: colors.textSecondary }]}>{preset}</Text>
                    </AnimatedPressable>
                  ))}
                </View>
              </View>

              {/* Unit price */}
              <View style={[styles.formCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.formLabel, { color: colors.textMuted }]}>Unit price ({currencyCode})</Text>
                <AppInput
                  value={unitPriceInput}
                  onChangeText={(value) => setUnitPriceInput(sanitizeDecimalInput(value))}
                  keyboardType="decimal-pad"
                  placeholder="0.00"
                  prefix={currencyCode}
                  accessibilityLabel="Unit price"
                />
              </View>

              {/* Estimated value */}
              <View style={[styles.estimateCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.formLabel, { color: colors.textMuted }]}>Estimated value</Text>
                <View style={styles.estimatedRow}>
                  <View>
                    <Text style={[styles.estimatedValue, { color: colors.textPrimary }]}>
                      {estimatedValue > 0 ? formatFromFiat(estimatedValue, 'GBP', { displayMode: 'fiat' }) : '—'}
                    </Text>
                    <Text style={[styles.estimatedSub, { color: colors.textMuted }]}>
                      {estimatedValueIze > 0 ? `${formatIzeAmount(estimatedValueIze)} stablecoin` : ''}
                    </Text>
                  </View>
                  <View style={styles.stablePreview}>
                    <Text style={[styles.stableLabel, { color: colors.textMuted }]}>Stable / unit</Text>
                    <Text style={[styles.stableValue, { color: colors.textSecondary }]}>
                      {unitPriceStablePreview > 0 ? formatIzeAmount(unitPriceStablePreview) : '—'}
                    </Text>
                  </View>
                </View>
              </View>
            </CoOwnIssueStudioStep>
          </Reanimated.View>
        )}

        {/* ── Stage 3: Review and issue ── */}
        {stage === 'review' && (
          <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeIn.duration(300)}>
            <CoOwnIssueStudioStep
              stepNumber={3}
              totalSteps={3}
              title="Review & issue"
              description="Confirm the details below. Once issued, the Co-Own will be available on the marketplace."
            >
              {/* Asset preview */}
              <View style={[styles.reviewAssetCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <CachedImage uri={previewImage} style={styles.reviewAssetImage} contentFit="cover" />
                <View style={styles.reviewAssetInfo}>
                  <Text style={[styles.reviewAssetTitle, { color: colors.textPrimary }]} numberOfLines={2}>
                    {selectedListing?.title} Split
                  </Text>
                  <Text style={[styles.reviewAssetSub, { color: colors.textSecondary }]}>Co-Own issuance</Text>
                </View>
              </View>

              {/* Summary */}
              <View style={[styles.summaryCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.summaryLabel, { color: colors.textMuted }]}>Issuance summary</Text>
                <View style={[styles.summaryRow, { borderColor: colors.border }]}>
                  <Text style={[styles.summaryKey, { color: colors.textSecondary }]}>Listing</Text>
                  <Text style={[styles.summaryValue, { color: colors.textPrimary }]} numberOfLines={1}>{selectedListing?.title}</Text>
                </View>
                <View style={[styles.summaryRow, { borderColor: colors.border }]}>
                  <Text style={[styles.summaryKey, { color: colors.textSecondary }]}>Total units</Text>
                  <Text style={[styles.summaryValue, { color: colors.textPrimary }]}>{totalUnitsInput}</Text>
                </View>
                <View style={[styles.summaryRow, { borderColor: colors.border }]}>
                  <Text style={[styles.summaryKey, { color: colors.textSecondary }]}>Unit price</Text>
                  <Text style={[styles.summaryValue, { color: colors.textPrimary }]}>
                    {Number(unitPriceInput) > 0 ? `${unitPriceInput} ${currencyCode}` : '—'}
                  </Text>
                </View>
                <View style={[styles.summaryRow, { borderColor: colors.border }]}>
                  <Text style={[styles.summaryKey, { color: colors.textSecondary }]}>Settlement</Text>
                  <Text style={[styles.summaryValue, { color: colors.textPrimary }]}>TVUSD</Text>
                </View>
                <View style={[styles.totalRow, { borderColor: colors.border }]}>
                  <Text style={[styles.totalKey, { color: colors.textPrimary }]}>Total value</Text>
                  <Text style={[styles.totalValue, { color: colors.textPrimary }]}>
                    {estimatedValue > 0 ? formatFromFiat(estimatedValue, 'GBP', { displayMode: 'fiat' }) : '—'}
                  </Text>
                </View>
              </View>

              {/* Risk disclosure */}
              <CoOwnRiskDisclosure />
            </CoOwnIssueStudioStep>
          </Reanimated.View>
        )}
      </ScrollView>

      {/* Sticky action dock */}
      <CoOwnStickyActionDock>
        {stage === 'review' ? (
          <AppButton
            title={isSubmitting ? 'Issuing...' : 'Issue Co-Own'}
            icon={<Ionicons name="flash-outline" size={16} color={colors.background} />}
            onPress={() => void issueCoOwn()}
            variant="primary"
            size="lg"
            disabled={isSubmitting}
            hapticFeedback="heavy"
            accessibilityLabel="Issue co-own"
            style={{ flex: 1 }}
          />
        ) : (
          <AppButton
            title="Continue"
            icon={<Ionicons name="arrow-forward" size={18} color={colors.background} />}
            onPress={handleNext}
            variant="primary"
            size="lg"
            disabled={stage === 'select' ? !canProceedToConfigure : !canProceedToReview}
            hapticFeedback="medium"
            accessibilityLabel="Continue to next step"
            style={{ flex: 1 }}
          />
        )}
      </CoOwnStickyActionDock>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingHorizontal: Space.md,
    paddingTop: Space.md,
    paddingBottom: 120,
  },
  listingListContent: {
    gap: Space.md,
    paddingRight: Space.md,
  },
  listingCard: {
    width: 160,
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: Space.sm,
    gap: Space.xs,
    position: 'relative',
  },
  listingImageContainer: {
    borderRadius: Radius.md,
    overflow: 'hidden',
  },
  listingImage: {
    width: '100%',
    height: 120,
  },
  listingMeta: {
    gap: 2,
  },
  listingTitle: {
    fontSize: Type.bodyEmphasis.size,
    fontFamily: Typography.family.semibold,
    letterSpacing: -0.2,
  },
  listingPrice: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
  },
  selectedTick: {
    position: 'absolute',
    top: Space.xs,
    right: Space.xs,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    borderRadius: Radius.lg,
    borderWidth: 0.5,
    padding: Space.md,
    marginTop: Space.lg,
  },
  previewImageContainer: {
    borderRadius: Radius.md,
    overflow: 'hidden',
  },
  previewImage: {
    width: 56,
    height: 56,
  },
  previewMeta: {
    flex: 1,
    gap: 3,
  },
  previewTitle: {
    fontSize: Type.bodyEmphasis.size,
    fontFamily: Typography.family.semibold,
    letterSpacing: -0.2,
  },
  previewPrice: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
  },
  contextCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    borderRadius: Radius.lg,
    borderWidth: 0.5,
    padding: Space.md,
  },
  contextImage: {
    width: 56,
    height: 56,
    borderRadius: Radius.md,
  },
  contextInfo: {
    flex: 1,
    gap: 3,
  },
  contextTitle: {
    fontSize: Type.bodyEmphasis.size,
    fontFamily: Typography.family.semibold,
    letterSpacing: -0.2,
  },
  contextPrice: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
  },
  formCard: {
    borderRadius: Radius.lg,
    borderWidth: 0.5,
    padding: Space.md,
    gap: Space.sm,
  },
  formLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  formLabel: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.medium,
    letterSpacing: 0.2,
    textTransform: 'uppercase',
  },
  formHint: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
  },
  unitPresets: {
    flexDirection: 'row',
    gap: Space.sm,
  },
  unitPreset: {
    flex: 1,
    paddingVertical: Space.sm,
    borderRadius: Radius.md,
    borderWidth: 1,
    alignItems: 'center',
  },
  unitPresetText: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.semibold,
  },
  estimateCard: {
    borderRadius: Radius.lg,
    borderWidth: 0.5,
    padding: Space.md,
    gap: Space.sm,
  },
  estimatedRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  estimatedValue: {
    fontSize: Type.priceList.size,
    fontFamily: Typography.family.bold,
    letterSpacing: -0.3,
  },
  estimatedSub: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.regular,
    marginTop: 2,
  },
  stablePreview: {
    alignItems: 'flex-end',
    gap: 2,
  },
  stableLabel: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.regular,
  },
  stableValue: {
    fontSize: Type.bodyEmphasis.size,
    fontFamily: Typography.family.semibold,
  },
  reviewAssetCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    borderRadius: Radius.lg,
    borderWidth: 0.5,
    padding: Space.md,
  },
  reviewAssetImage: {
    width: 64,
    height: 64,
    borderRadius: Radius.md,
  },
  reviewAssetInfo: {
    flex: 1,
    gap: 3,
  },
  reviewAssetTitle: {
    fontSize: Type.bodyEmphasis.size,
    fontFamily: Typography.family.semibold,
    letterSpacing: -0.2,
  },
  reviewAssetSub: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
  },
  summaryCard: {
    borderRadius: Radius.lg,
    borderWidth: 0.5,
    padding: Space.md,
    gap: 0,
  },
  summaryLabel: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.medium,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
    marginBottom: Space.sm,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  summaryKey: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.regular,
  },
  summaryValue: {
    fontSize: Type.bodyEmphasis.size,
    fontFamily: Typography.family.semibold,
    flex: 1,
    textAlign: 'right',
    marginLeft: Space.md,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: Space.md,
    marginTop: Space.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  totalKey: {
    fontSize: Type.bodyEmphasis.size,
    fontFamily: Typography.family.bold,
  },
  totalValue: {
    fontSize: Type.priceList.size,
    fontFamily: Typography.family.bold,
    letterSpacing: -0.3,
  },
});
