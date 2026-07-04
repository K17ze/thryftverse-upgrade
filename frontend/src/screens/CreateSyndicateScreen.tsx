import React from 'react';
import { View, Text, StyleSheet, StatusBar, ScrollView } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import Reanimated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import { ActiveTheme, Colors } from '../constants/colors';
import { RootStackParamList } from '../navigation/types';
import type { Listing } from '../data/mockData';
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
import { AnimatedPressable } from '../components/AnimatedPressable';
import { Space, Radius, Typography, Type } from '../theme/designTokens';
import { Motion } from '../constants/motion';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useHaptic } from '../hooks/useHaptic';
import { Meta, BodyEmphasis, Body } from '../components/ui/Text';
import { FinancialDisclosure } from '../components/FinancialDisclosure';

type NavT = StackNavigationProp<RootStackParamList>;
type RouteT = RouteProp<RootStackParamList, 'CreateCoOwn'>;

// The backend enforces a maximum of 20 units per Co-Own issuance.
// This is a real backend constraint, not a UI-only limit.
const MAX_UNITS = 20;

type Stage = 'select' | 'configure' | 'review';

export default function CreateCoOwnScreen() {
  const navigation = useNavigation<NavT>();
  const route = useRoute<RouteT>();
  const { show } = useToast();
  const { formatFromFiat } = useFormattedPrice();
  const { currencyCode, goldRates } = useCurrencyContext();
  const { listings } = useBackendData();
  const reducedMotionEnabled = useReducedMotion();
  const haptic = useHaptic();
  const insets = useSafeAreaInsets();

  const prefill = route.params;

  const currentUser = useStore((state) => state.currentUser);

  const issuerId = currentUser?.id ?? '';

  // Only show listings owned by the authenticated issuer.
  // Never fall back to other users' listings — that could expose or attempt
  // to issue a listing the viewer does not own.
  const issuerListings = React.useMemo(() => {
    if (!issuerId) return [];
    return listings.filter((item) => item.sellerId === issuerId);
  }, [issuerId, listings]);

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
      show('Unable to derive a valid 1ze split value from this price', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      const imageUrl = getListingCoverUri(selectedListing.images, '');
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
    ? getListingCoverUri(selectedListing.images, '')
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

  const stageTitle = stage === 'select' ? 'Select listing' : stage === 'configure' ? 'Configure' : 'Review';

  const renderListingCard = ({ item }: { item: Listing }) => {
    const selected = item.id === selectedListingId;
    return (
      <AnimatedPressable
        style={[styles.listingCard, selected && styles.listingCardSelected]}
        onPress={() => { haptic.selection(); setSelectedListingId(item.id); }}
        activeOpacity={0.9}
        disableAnimation={false}
        scaleValue={0.97}
        accessibilityRole="button"
        accessibilityLabel={`Select ${item.title}`}
        accessibilityState={{ selected }}
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

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle={ActiveTheme === 'light' ? 'dark-content' : 'light-content'} backgroundColor={Colors.background} />

      {/* Header with back/close and stage indicator */}
      <View style={styles.header}>
        <AnimatedPressable
          onPress={handleBack}
          style={styles.headerBackBtn}
          accessibilityRole="button"
          accessibilityLabel={stage === 'select' ? 'Close' : 'Go back'}
        >
          <Ionicons name={stage === 'select' ? 'close' : 'chevron-back'} size={24} color={Colors.textPrimary} />
        </AnimatedPressable>
        <View style={styles.headerTitleWrap}>
          <Text style={styles.headerTitle}>{stageTitle}</Text>
          <Text style={styles.headerContext}>Issue Co-Own</Text>
        </View>
        <View style={styles.stageIndicator}>
          <View style={[styles.stageDot, stage === 'select' && styles.stageDotActive]} />
          <View style={[styles.stageDot, stage === 'configure' && styles.stageDotActive]} />
          <View style={[styles.stageDot, stage === 'review' && styles.stageDotActive]} />
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* ── Stage 1: Select listing ── */}
        {stage === 'select' && (
          <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeIn.duration(300)}>
            <Meta style={styles.sectionLabel}>Select a listing to split into Co-Own units</Meta>
            <FlashList
              data={issuerListings}
              horizontal
              keyExtractor={(item) => item.id}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.listingListContent}
              renderItem={renderListingCard}
              ListEmptyComponent={
                <View style={styles.emptyListWrap}>
                  <Ionicons name="cube-outline" size={32} color={Colors.textMuted} />
                  <Meta style={styles.emptyListText}>
                    {issuerId
                      ? 'You have no eligible listings. Create a listing first to issue a Co-Own.'
                      : 'Sign in to issue a Co-Own from your listings.'}
                  </Meta>
                  {!issuerId ? (
                    <AppButton
                      title="Sign In"
                      onPress={() => navigation.goBack()}
                      variant="secondary"
                      size="sm"
                      style={{ marginTop: Space.sm }}
                    />
                  ) : (
                    <AppButton
                      title="Create Listing"
                      onPress={() => navigation.navigate('Sell')}
                      variant="secondary"
                      size="sm"
                      style={{ marginTop: Space.sm }}
                    />
                  )}
                </View>
              }
            />

            {selectedListing && (
              <View style={styles.previewCard}>
                <CachedImage uri={previewImage} style={styles.previewImage} containerStyle={styles.previewImageContainer} contentFit="cover" />
                <View style={styles.previewMeta}>
                  <BodyEmphasis style={styles.previewTitle} numberOfLines={1}>
                    {selectedListing.title}
                  </BodyEmphasis>
                  <Meta style={styles.previewPrice}>
                    {formatFromFiat(selectedListing.price, 'GBP', { displayMode: 'fiat' })}
                  </Meta>
                </View>
              </View>
            )}
          </Reanimated.View>
        )}

        {/* ── Stage 2: Configure units and price ── */}
        {stage === 'configure' && (
          <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeIn.duration(300)}>
            {/* Selected listing context */}
            <View style={styles.contextCard}>
              <CachedImage uri={previewImage} style={styles.contextImage} contentFit="cover" />
              <View style={styles.contextInfo}>
                <BodyEmphasis style={styles.contextTitle} numberOfLines={1}>{selectedListing?.title}</BodyEmphasis>
                <Meta style={styles.contextPrice}>
                  {selectedListing ? formatFromFiat(selectedListing.price, 'GBP', { displayMode: 'fiat' }) : '—'}
                </Meta>
              </View>
            </View>

            {/* Total units */}
            <View style={styles.formCard}>
              <View style={styles.formLabelRow}>
                <Meta style={styles.formLabel}>Total units</Meta>
                <Meta style={styles.formHint}>Max {MAX_UNITS}</Meta>
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
                    style={styles.unitPreset}
                    onPress={() => { haptic.selection(); setTotalUnitsInput(String(preset)); }}
                    accessibilityRole="button"
                    accessibilityLabel={`Set units to ${preset}`}
                  >
                    <Text style={styles.unitPresetText}>{preset}</Text>
                  </AnimatedPressable>
                ))}
              </View>
            </View>

            {/* Unit price */}
            <View style={styles.formCard}>
              <Meta style={styles.formLabel}>Unit price ({currencyCode})</Meta>
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
            <View style={styles.estimateCard}>
              <Meta style={styles.formLabel}>Estimated value</Meta>
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
            </View>
          </Reanimated.View>
        )}

        {/* ── Stage 3: Review and issue ── */}
        {stage === 'review' && (
          <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeIn.duration(300)}>
            {/* Asset preview */}
            <View style={styles.reviewAssetCard}>
              <CachedImage uri={previewImage} style={styles.reviewAssetImage} contentFit="cover" />
              <View style={styles.reviewAssetInfo}>
                <BodyEmphasis style={styles.reviewAssetTitle} numberOfLines={2}>
                  {selectedListing?.title} Split
                </BodyEmphasis>
                <Meta style={styles.reviewAssetSub}>Co-Own issuance</Meta>
              </View>
            </View>

            {/* Summary */}
            <View style={styles.summaryCard}>
              <Meta style={styles.summaryLabel}>ISSUANCE SUMMARY</Meta>
              <View style={styles.summaryRow}>
                <Meta style={styles.summaryKey}>Listing</Meta>
                <Text style={styles.summaryValue} numberOfLines={1}>{selectedListing?.title}</Text>
              </View>
              <View style={styles.summaryRow}>
                <Meta style={styles.summaryKey}>Total units</Meta>
                <Text style={styles.summaryValue}>{totalUnitsInput}</Text>
              </View>
              <View style={styles.summaryRow}>
                <Meta style={styles.summaryKey}>Unit price</Meta>
                <Text style={styles.summaryValue}>
                  {Number(unitPriceInput) > 0 ? `${unitPriceInput} ${currencyCode}` : '—'}
                </Text>
              </View>
              <View style={styles.summaryRow}>
                <Meta style={styles.summaryKey}>Settlement</Meta>
                <Text style={styles.summaryValue}>TVUSD</Text>
              </View>
              <View style={styles.summaryDivider} />
              <View style={styles.summaryRow}>
                <BodyEmphasis style={styles.summaryKey}>Total value</BodyEmphasis>
                <BodyEmphasis style={styles.summaryTotal}>
                  {estimatedValue > 0 ? formatFromFiat(estimatedValue, 'GBP', { displayMode: 'fiat' }) : '—'}
                </BodyEmphasis>
              </View>
            </View>

            {/* Risk disclosure */}
            <View style={styles.riskCard}>
              <FinancialDisclosure />
            </View>
          </Reanimated.View>
        )}
      </ScrollView>

      {/* Bottom action bar */}
      <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        {stage === 'review' ? (
          <AppButton
            title={isSubmitting ? 'Issuing...' : 'Issue Co-Own'}
            icon={<Ionicons name="flash-outline" size={16} color={Colors.background} />}
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
            icon={<Ionicons name="arrow-forward" size={18} color={Colors.background} />}
            onPress={handleNext}
            variant="primary"
            size="lg"
            disabled={stage === 'select' ? !canProceedToConfigure : !canProceedToReview}
            hapticFeedback="medium"
            accessibilityLabel="Continue to next step"
            style={{ flex: 1 }}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    gap: Space.xs,
  },
  headerBackBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitleWrap: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontFamily: Typography.family.bold,
    color: Colors.textPrimary,
    letterSpacing: -0.3,
  },
  headerContext: {
    fontSize: 12,
    fontFamily: Typography.family.regular,
    color: Colors.textSecondary,
    marginTop: 1,
  },
  stageIndicator: {
    flexDirection: 'row',
    gap: 6,
  },
  stageDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.surfaceAlt,
  },
  stageDotActive: {
    backgroundColor: Colors.brand,
  },
  // Content
  content: {
    paddingBottom: Space.xxl,
  },
  sectionLabel: {
    marginHorizontal: Space.md,
    marginBottom: Space.sm,
    marginTop: Space.md,
    color: Colors.textSecondary,
  },
  // Listing selection
  listingListContent: {
    paddingHorizontal: Space.md,
    gap: Space.sm,
    paddingBottom: Space.sm,
  },
  emptyListWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Space.lg,
    paddingVertical: Space.xl,
    gap: Space.sm,
  },
  emptyListText: {
    textAlign: 'center',
    color: Colors.textMuted,
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
  // Preview (stage 1)
  previewCard: {
    marginHorizontal: Space.md,
    marginTop: Space.md,
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Space.sm,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  previewImageContainer: {
    width: '100%',
    height: 200,
    borderRadius: Radius.md,
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
  // Context card (stage 2)
  contextCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    marginHorizontal: Space.md,
    marginTop: Space.md,
    marginBottom: Space.sm,
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Space.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  contextImage: {
    width: 56,
    height: 56,
    borderRadius: Radius.md,
    backgroundColor: Colors.surfaceAlt,
  },
  contextInfo: {
    flex: 1,
    gap: 2,
  },
  contextTitle: {
    fontSize: 15,
  },
  contextPrice: {
    color: Colors.textSecondary,
  },
  // Form cards
  formCard: {
    marginHorizontal: Space.md,
    marginTop: Space.sm,
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Space.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  formLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Space.sm,
  },
  formLabel: {
    color: Colors.textSecondary,
    marginBottom: Space.sm,
  },
  formHint: {
    color: Colors.textMuted,
  },
  // Unit presets
  unitPresets: {
    flexDirection: 'row',
    gap: Space.sm,
    marginTop: Space.sm,
  },
  unitPreset: {
    flex: 1,
    paddingVertical: Space.sm,
    backgroundColor: Colors.surfaceAlt,
    borderRadius: Radius.md,
    alignItems: 'center',
  },
  unitPresetText: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.semibold,
    color: Colors.textPrimary,
  },
  // Estimate
  estimateCard: {
    marginHorizontal: Space.md,
    marginTop: Space.sm,
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Space.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  estimatedRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: Space.xs,
  },
  estimatedValue: {
    fontSize: 22,
    fontFamily: Typography.family.bold,
    color: Colors.textPrimary,
    letterSpacing: -0.3,
  },
  estimatedSub: {
    color: Colors.textSecondary,
    marginTop: 2,
  },
  stablePreview: {
    alignItems: 'flex-end',
  },
  stableLabel: {
    color: Colors.textMuted,
  },
  stableValue: {
    color: Colors.textPrimary,
    marginTop: 2,
  },
  // Review stage
  reviewAssetCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    marginHorizontal: Space.md,
    marginTop: Space.md,
    marginBottom: Space.sm,
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Space.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  reviewAssetImage: {
    width: 64,
    height: 64,
    borderRadius: Radius.md,
    backgroundColor: Colors.surfaceAlt,
  },
  reviewAssetInfo: {
    flex: 1,
    gap: 2,
  },
  reviewAssetTitle: {
    fontSize: 15,
    lineHeight: 20,
  },
  reviewAssetSub: {
    color: Colors.textSecondary,
  },
  summaryCard: {
    marginHorizontal: Space.md,
    marginBottom: Space.sm,
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Space.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  summaryLabel: {
    color: Colors.textMuted,
    marginBottom: Space.sm,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  summaryKey: {
    color: Colors.textSecondary,
  },
  summaryValue: {
    fontSize: 15,
    fontFamily: Typography.family.semibold,
    color: Colors.textPrimary,
    flex: 1,
    textAlign: 'right',
    marginLeft: Space.md,
  },
  summaryDivider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: Space.sm,
  },
  summaryTotal: {
    fontSize: 18,
    fontFamily: Typography.family.bold,
    color: Colors.brand,
  },
  riskCard: {
    marginHorizontal: Space.md,
    marginBottom: Space.lg,
  },
  // Bottom bar
  bottomBar: {
    flexDirection: 'row',
    paddingHorizontal: Space.md,
    paddingTop: Space.sm,
    backgroundColor: Colors.background,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
  },
});
