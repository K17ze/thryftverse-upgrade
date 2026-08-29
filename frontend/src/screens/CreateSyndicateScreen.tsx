import React from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, useWindowDimensions } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAppTheme } from '../theme/ThemeContext';
import { RootStackParamList } from '../navigation/types';
import { useStore } from '../store/useStore';
import { useToast } from '../context/ToastContext';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { useCurrencyContext } from '../context/CurrencyContext';
import { toFiat, toIze, formatIzeAmount } from '../utils/currency';
import { sanitizeDecimalInput, sanitizeIntegerInput } from '../utils/currencyAuthoringFlows';
import { getCreateCoOwnInitialState } from '../utils/syndicatePrefill';
import { createCoOwnAsset, fetchIssuerVerification, signRecourseAgreement } from '../services/marketApi';
import { fetchUserListingsFromApi, type ListingApiItem } from '../services/listingsApi';
import { CachedImage } from '../components/CachedImage';
import { getListingCoverUri } from '../utils/media';
import { AppButton } from '../components/ui/AppButton';
import { AppInput } from '../components/ui/AppInput';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { Space, Radius, DockConstants, Control, Stroke, LetterSpacing } from '../theme/designTokens';
import { TypographyV2 } from '../theme/typography.v2';
import { useBackendData } from '../context/BackendDataContext';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../platform/server/queryKeys';
import { useHaptic } from '../hooks/useHaptic';
import { haptics } from '../utils/haptics';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { FlagshipScreen, FlagshipHeader } from '../components/flagship';
import Reanimated, { FadeIn } from 'react-native-reanimated';
import {
  CoOwnIssueStudioStep,
  CoOwnStickyActionDock,
  CoOwnRiskDisclosure,
  CoOwnCreateStudioSkeleton,
  CoOwnStateCanvas,
} from '../components/coown';

type NavT = NativeStackNavigationProp<RootStackParamList>;
type RouteT = RouteProp<RootStackParamList, 'CreateCoOwn'>;

// The backend enforces a maximum of 20 units per Co-Own issuance.
// This is a real backend constraint, not a UI-only limit.
const MAX_UNITS = 20;

type Stage = 'select' | 'configure' | 'review' | 'recourse';

export default function CreateCoOwnScreen() {
  const navigation = useNavigation<NavT>();
  const route = useRoute<RouteT>();
  const { colors } = useAppTheme();
  const { show } = useToast();
  const { formatFromFiat } = useFormattedPrice();
  const { currencyCode, fxRates } = useCurrencyContext();
  const haptic = useHaptic();
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const reducedMotion = useReducedMotion();
  const scrollBottomPadding = Math.max(insets.bottom, Space.md) + DockConstants.singleActionHeight;
  const { refreshListings } = useBackendData();
  const queryClient = useQueryClient();

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
        // Safety filter: only show listings where sellerId === issuerId.
        // The backend should already filter by userId, but this prevents
        // any cross-user listing leakage.
        const ownListings = result.items.filter((item) => item.sellerId === issuerId);
        setIssuerListings(ownListings);
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
  const [recourseAccepted, setRecourseAccepted] = React.useState(false);
  const [createdAssetId, setCreatedAssetId] = React.useState<string | null>(null);

  // ── WS2: Issuer KYC gate ──
  // The backend requires 'id' or 'seller' tier to issue. Fetch the
  // current tier so we can show a blocking notice before the user
  // reaches the issue button (fail fast, don't let them fill the form
  // only to hit a 403).
  const [issuerTier, setIssuerTier] = React.useState<'email' | 'id' | 'seller' | null | 'loading'>('loading');
  React.useEffect(() => {
    if (!issuerId) { setIssuerTier(null); return; }
    let cancelled = false;
    fetchIssuerVerification(issuerId)
      .then((result) => { if (!cancelled) setIssuerTier(result?.tier ?? 'email'); })
      .catch(() => { if (!cancelled) setIssuerTier('email'); });
    return () => { cancelled = true; };
  }, [issuerId]);
  const canIssue = issuerTier === 'id' || issuerTier === 'seller';

  // ── Trust profile (WS1) ──
  // Legal vehicle type is required for issuance (equity-market pattern:
  // no listing without a disclosed legal wrapper). Defaults to 'spv'.
  const [legalVehicleType, setLegalVehicleType] = React.useState<'spv' | 'llc' | 'trust' | 'series_llc' | 'none'>('spv');
  const [legalVehicleName, setLegalVehicleName] = React.useState('');
  const [legalVehicleJurisdiction, setLegalVehicleJurisdiction] = React.useState('');
  const [custodianName, setCustodianName] = React.useState('');
  const [custodianLocation, setCustodianLocation] = React.useState('');
  const [custodyInsured, setCustodyInsured] = React.useState(false);
  const [custodyInsurer, setCustodyInsurer] = React.useState('');
  const [authenticityMethod, setAuthenticityMethod] = React.useState('');

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
      const amountIze = toIze(amountDisplay, currencyCode, fxRates);
      return toFiat(amountIze, 'GBP', fxRates);
    },
    [currencyCode, fxRates]
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

    const unitPriceStable = toIze(unitPriceGBP, 'GBP', fxRates);
    if (!Number.isFinite(unitPriceStable) || unitPriceStable <= 0) {
      show('Unable to derive a valid stablecoin value from this price', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      const imageUrl = getListingCoverUri(selectedListing.images, selectedListing.imageUrl ?? '');
      const result = await createCoOwnAsset({
        listingId: selectedListing.id,
        issuerId,
        title: `${selectedListing.title} Split`,
        imageUrl,
        totalUnits,
        unitPriceGbp: unitPriceGBP,
        unitPriceStable,
        settlementMode: 'ONEZE',
        // ── Trust profile (WS1) ──
        legalVehicleType,
        legalVehicleName: legalVehicleType !== 'none' ? legalVehicleName.trim() || undefined : undefined,
        legalVehicleJurisdiction: legalVehicleJurisdiction.trim() || undefined,
        custodianName: custodianName.trim() || undefined,
        custodianLocation: custodianLocation.trim() || undefined,
        custodyInsured: custodyInsured || undefined,
        custodyInsurer: custodyInsured ? custodyInsurer.trim() || undefined : undefined,
        authenticityMethod: authenticityMethod.trim() || undefined,
        authenticityStatus: authenticityMethod.trim() ? 'verified' : 'unverified',
      });
      // Store the created asset ID for the recourse signing step
      const assetId = result.assetId;
      setCreatedAssetId(assetId);
      // Move to the recourse agreement signing stage
      setStage('recourse');
    } catch (err) {
      show('Failed to issue co-own. Try again.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const signAndFinish = async () => {
    if (!createdAssetId) {
      show('Asset not created yet', 'error');
      return;
    }
    if (!recourseAccepted) {
      show('You must accept the recourse agreement to continue', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      await signRecourseAgreement(createdAssetId, { personalGuarantee: true });
      show('Co-Own issued successfully', 'success');
      // The backend pauses the listing when a co-own asset is created from
      // it. Refresh the feed + invalidate the listing detail so the paused
      // status propagates immediately when the user returns.
      void refreshListings();
      if (selectedListing) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.listing.detail(selectedListing.id) });
      }
      void queryClient.invalidateQueries({ queryKey: ['coown', 'assets'] });
      navigation.goBack();
    } catch (err) {
      show('Failed to sign recourse agreement. The asset was created but cannot be traded until signed.', 'error');
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
    () => (estimatedValue > 0 ? toIze(estimatedValue, 'GBP', fxRates) : 0),
    [estimatedValue, fxRates]
  );

  const unitPriceStablePreview = React.useMemo(() => {
    const unitPriceGBP = fromDisplayToGbp(Number(unitPriceInput));
    if (!Number.isFinite(unitPriceGBP) || unitPriceGBP <= 0) return 0;
    return toIze(unitPriceGBP, 'GBP', fxRates);
  }, [fromDisplayToGbp, fxRates, unitPriceInput]);

  const previewImage = selectedListing
    ? getListingCoverUri(selectedListing.images, selectedListing.imageUrl ?? '')
    : '';

  const canProceedToConfigure = !!selectedListing && canIssue;
  const canProceedToReview = !!selectedListing
    && Number(totalUnitsInput) >= 1
    && Number(totalUnitsInput) <= MAX_UNITS
    && Number(unitPriceInput) > 0
    && canIssue;

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
    } else if (stage === 'recourse') {
      // Don't go back to review — the asset is already created.
      // Going back would create a duplicate. Navigate out instead.
      navigation.goBack();
    } else {
      navigation.goBack();
    }
  };

  const stageTitles: Record<Stage, string> = {
    select: 'Select listing',
    configure: 'Configure',
    review: 'Review & issue',
    recourse: 'Seller liability',
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
            {formatFromFiat(item.priceGbp, currencyCode, { displayMode: 'fiat' })}
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
      <FlagshipScreen
        header={
          <FlagshipHeader
            title="Issue Co-Own"
            subtitle="Create a shared ownership item"
            onBack={handleBack}
          />
        }
        scrollEnabled={false}
        contentStyle={{ paddingHorizontal: 0, paddingTop: 0 }}
      >
        <CoOwnCreateStudioSkeleton />
      </FlagshipScreen>
    );
  }

  // ── Empty state (no listings) ──
  if (issuerListings.length === 0) {
    return (
      <FlagshipScreen
        header={
          <FlagshipHeader
            title="Issue Co-Own"
            subtitle="Create a shared ownership item"
            onBack={handleBack}
          />
        }
        scrollEnabled={false}
        contentStyle={{ paddingHorizontal: 0, paddingTop: 0 }}
      >
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
      </FlagshipScreen>
    );
  }

  return (
    <FlagshipScreen
      header={
        <FlagshipHeader
          title={stageTitles[stage]}
          subtitle="Issue Co-Own"
          onBack={handleBack}
        />
      }
      scrollEnabled={false}
      contentStyle={{ paddingHorizontal: 0, paddingTop: 0 }}
    >
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: scrollBottomPadding }]} showsVerticalScrollIndicator={false}>
        {/* ── Stage 1: Select listing ── */}
        {stage === 'select' && (
          <Reanimated.View entering={reducedMotion ? undefined : FadeIn.duration(250)}>
            <CoOwnIssueStudioStep
              stepNumber={1}
              totalSteps={3}
              title="Select a listing"
              description="Choose one of your active listings to split into Co-Own units."
            >
              {/* ── WS2: KYC gate ──
                  Issuers must have 'id' or 'seller' tier verification to
                  issue. Show a blocking notice before the listing selector
                  so the user doesn't fill the form only to hit a 403. */}
              {issuerTier !== 'loading' && !canIssue && (
                <View style={[styles.kycGateCard, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}>
                  <Ionicons name="lock-closed-outline" size={20} color={colors.warning} />
                  <View style={styles.kycGateBody}>
                    <Text style={[styles.kycGateTitle, { color: colors.textPrimary }]}>
                      Identity verification required
                    </Text>
                    <Text style={[styles.kycGateText, { color: colors.textSecondary }]}>
                      Complete ID verification to issue Co-Own assets. This protects buyers and meets regulatory standards.
                    </Text>
                  </View>
                </View>
              )}
              <FlashList
                data={issuerListings}
                horizontal
                keyExtractor={(item) => item.id}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.listingListContent}
                renderItem={renderListingCard}
              />

              {selectedListing && (
                <View style={[styles.previewCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <CachedImage uri={previewImage} style={styles.previewImage} containerStyle={styles.previewImageContainer} contentFit="cover" />
                  <View style={styles.previewMeta}>
                    <Text style={[styles.previewTitle, { color: colors.textPrimary }]} numberOfLines={1}>
                      {selectedListing.title}
                    </Text>
                    <Text style={[styles.previewPrice, { color: colors.textSecondary }]}>
                      {formatFromFiat(selectedListing.priceGbp, currencyCode, { displayMode: 'fiat' })}
                    </Text>
                  </View>
                </View>
              )}
            </CoOwnIssueStudioStep>
          </Reanimated.View>
        )}

        {/* ── Stage 2: Configure units and price ── */}
        {stage === 'configure' && (
          <Reanimated.View entering={reducedMotion ? undefined : FadeIn.duration(250)}>
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
                    {selectedListing ? formatFromFiat(selectedListing.priceGbp, currencyCode, { displayMode: 'fiat' }) : '—'}
                  </Text>
                </View>
              </View>

              {/* Total units */}
              <View style={styles.formCard}>
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
              <View style={styles.formCard}>
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

              {/* ── Legal & custody (WS1) ──
                  Equity-market pattern: the legal wrapper and custody
                  arrangement must be disclosed before issuance. The
                  legal vehicle type is required; other fields are
                  optional but shown so the issuer can substantiate
                  trust signals on the asset detail screen. */}
              <View style={styles.formCard}>
                <Text style={[styles.formLabel, { color: colors.textMuted }]}>Legal vehicle</Text>
                <Text style={[styles.formHint, { color: colors.textMuted, marginBottom: Space.sm }]}>
                  Required — the legal structure that holds the asset
                </Text>
                <View style={styles.vehicleTypeRow}>
                  {(['spv', 'llc', 'trust', 'series_llc', 'none'] as const).map((vt) => (
                    <AnimatedPressable
                      key={vt}
                      style={[
                        styles.vehicleTypeChip,
                        {
                          backgroundColor: legalVehicleType === vt ? colors.surfaceAlt : 'transparent',
                          borderColor: legalVehicleType === vt ? colors.border : colors.borderSubtle,
                        },
                      ]}
                      onPress={() => { haptic.selection(); setLegalVehicleType(vt); }}
                      accessibilityRole="button"
                      accessibilityLabel={`Legal vehicle: ${vt}`}
                      scaleValue={0.96}
                      hapticFeedback="light"
                    >
                      <Text style={[styles.vehicleTypeText, { color: legalVehicleType === vt ? colors.textPrimary : colors.textSecondary }]}>
                        {vt === 'spv' ? 'SPV' : vt === 'series_llc' ? 'Series LLC' : vt === 'llc' ? 'LLC' : vt === 'trust' ? 'Trust' : 'None'}
                      </Text>
                    </AnimatedPressable>
                  ))}
                </View>
                {legalVehicleType !== 'none' && (
                  <>
                    <AppInput
                      value={legalVehicleName}
                      onChangeText={setLegalVehicleName}
                      placeholder="Vehicle name"
                      accessibilityLabel="Legal vehicle name"
                    />
                    <AppInput
                      value={legalVehicleJurisdiction}
                      onChangeText={setLegalVehicleJurisdiction}
                      placeholder="Jurisdiction (e.g. England, Delaware)"
                      accessibilityLabel="Legal vehicle jurisdiction"
                    />
                  </>
                )}
              </View>

              <View style={styles.formCard}>
                <Text style={[styles.formLabel, { color: colors.textMuted }]}>Custodian (optional)</Text>
                <AppInput
                  value={custodianName}
                  onChangeText={setCustodianName}
                  placeholder="Custodian name"
                  accessibilityLabel="Custodian name"
                />
                <AppInput
                  value={custodianLocation}
                  onChangeText={setCustodianLocation}
                  placeholder="Storage location"
                  accessibilityLabel="Custodian location"
                />
                <View style={styles.insuranceRow}>
                  <AnimatedPressable
                    style={[styles.insuranceToggle, { borderColor: custodyInsured ? colors.brand : colors.border }]}
                    onPress={() => { haptic.selection(); setCustodyInsured((v) => !v); }}
                    accessibilityRole="switch"
                    accessibilityLabel="Toggle custody insurance"
                    accessibilityState={{ checked: custodyInsured }}
                    scaleValue={0.96}
                    hapticFeedback="light"
                  >
                    <Ionicons
                      name={custodyInsured ? 'checkmark-circle' : 'ellipse-outline'}
                      size={18}
                      color={custodyInsured ? colors.brand : colors.textMuted}
                    />
                    <Text style={[styles.insuranceToggleText, { color: custodyInsured ? colors.textPrimary : colors.textSecondary }]}>
                      Insured
                    </Text>
                  </AnimatedPressable>
                </View>
                {custodyInsured && (
                  <AppInput
                    value={custodyInsurer}
                    onChangeText={setCustodyInsurer}
                    placeholder="Insurer name"
                    accessibilityLabel="Custody insurer name"
                  />
                )}
              </View>

              <View style={styles.formCard}>
                <Text style={[styles.formLabel, { color: colors.textMuted }]}>Authenticity (optional)</Text>
                <AppInput
                  value={authenticityMethod}
                  onChangeText={setAuthenticityMethod}
                  placeholder="Verification method (e.g. third-party appraisal)"
                  accessibilityLabel="Authenticity verification method"
                />
              </View>

              {/* Estimated value */}
              <View style={[styles.estimateCard, { borderTopColor: colors.border }]}>
                <Text style={[styles.formLabel, { color: colors.textMuted }]}>Estimated value</Text>
                <View style={styles.estimatedRow}>
                  <View>
                    <Text style={[styles.estimatedValue, { color: colors.textPrimary }]}>
                      {estimatedValue > 0 ? formatFromFiat(estimatedValue, currencyCode, { displayMode: 'fiat' }) : '—'}
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
          <Reanimated.View entering={reducedMotion ? undefined : FadeIn.duration(250)}>
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
              <View style={[styles.summaryCard, { borderTopColor: colors.border }]}>
                <Text style={[styles.summaryLabel, { color: colors.textMuted }]}>Issuance summary</Text>
                <View style={[styles.summaryRow, { borderColor: colors.border }]}>
                  <Text style={[styles.summaryKey, { color: colors.textSecondary }]}>Listing</Text>
                  <Text style={[styles.summaryValue, { color: colors.textPrimary }]} numberOfLines={1}>{selectedListing?.title}</Text>
                </View>
                <View style={[styles.summaryRow, { borderColor: colors.border }]}>
                  <Text style={[styles.summaryKey, { color: colors.textSecondary }]} numberOfLines={1}>Total units</Text>
                  <Text style={[styles.summaryValue, { color: colors.textPrimary }]} numberOfLines={1}>{totalUnitsInput}</Text>
                </View>
                <View style={[styles.summaryRow, { borderColor: colors.border }]}>
                  <Text style={[styles.summaryKey, { color: colors.textSecondary }]} numberOfLines={1}>Unit price</Text>
                  <Text style={[styles.summaryValue, { color: colors.textPrimary }]} numberOfLines={1}>
                    {Number(unitPriceInput) > 0 ? `${unitPriceInput} ${currencyCode}` : '—'}
                  </Text>
                </View>
                <View style={[styles.summaryRow, { borderColor: colors.border }]}>
                  <Text style={[styles.summaryKey, { color: colors.textSecondary }]} numberOfLines={1}>Settlement</Text>
                  <Text style={[styles.summaryValue, { color: colors.textPrimary }]} numberOfLines={1}>TVUSD</Text>
                </View>
                <View style={[styles.summaryRow, { borderColor: colors.border }]}>
                  <Text style={[styles.summaryKey, { color: colors.textSecondary }]} numberOfLines={1}>Legal vehicle</Text>
                  <Text style={[styles.summaryValue, { color: colors.textPrimary }]} numberOfLines={1}>
                    {legalVehicleType === 'spv' ? 'SPV'
                      : legalVehicleType === 'series_llc' ? 'Series LLC'
                      : legalVehicleType === 'llc' ? 'LLC'
                      : legalVehicleType === 'trust' ? 'Trust'
                      : 'None'}
                    {legalVehicleType !== 'none' && legalVehicleName ? ` · ${legalVehicleName}` : ''}
                  </Text>
                </View>
                <View style={[styles.totalRow, { borderColor: colors.border }]}>
                  <Text style={[styles.totalKey, { color: colors.textPrimary }]} numberOfLines={1}>Total value</Text>
                  <Text style={[styles.totalValue, { color: colors.textPrimary }]} numberOfLines={1}>
                    {estimatedValue > 0 ? formatFromFiat(estimatedValue, currencyCode, { displayMode: 'fiat' }) : '—'}
                  </Text>
                </View>
              </View>

              {/* Risk disclosure */}
              <CoOwnRiskDisclosure />
            </CoOwnIssueStudioStep>
          </Reanimated.View>
        )}

        {/* ── Stage 4: Recourse agreement — seller signs personal liability ── */}
        {stage === 'recourse' && (
          <Reanimated.View entering={reducedMotion ? undefined : FadeIn.duration(250)}>
            <CoOwnIssueStudioStep
              stepNumber={4}
              totalSteps={4}
              title="Seller liability agreement"
              description="You are personally liable for safeguarding this asset. Read carefully before signing."
            >
              {/* Liability summary */}
              <View style={[styles.recourseSummaryCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={styles.recourseLiabilityRow}>
                  <Ionicons name="checkmark-done" size={20} color={colors.brand} />
                  <View style={styles.recourseLiabilityBody}>
                    <Text style={[styles.recourseLiabilityLabel, { color: colors.textMuted }]}>
                      Personal liability
                    </Text>
                    <Text style={[styles.recourseLiabilityValue, { color: colors.textPrimary }]}>
                      {estimatedValue > 0
                        ? formatFromFiat(estimatedValue, currencyCode, { displayMode: 'fiat' })
                        : '—'}
                    </Text>
                  </View>
                </View>
                <View style={styles.recourseLiabilityBullets}>
                  <Text style={[styles.recourseBulletText, { color: colors.textSecondary }]}>
                    {'\u2022'} If you fail to safeguard the physical asset in the condition stated
                  </Text>
                  <Text style={[styles.recourseBulletText, { color: colors.textSecondary }]}>
                    {'\u2022'} If you cannot prove authenticity when requested by a unit holder
                  </Text>
                  <Text style={[styles.recourseBulletText, { color: colors.textSecondary }]}>
                    {'\u2022'} If you cannot produce the physical item on demand within 14 days
                  </Text>
                  <Text style={[styles.recourseBulletText, { color: colors.textSecondary }]}>
                    {'\u2192'} You are legally liable to repay the total traded value of this asset
                  </Text>
                </View>
              </View>

              {/* Obligations list */}
              <View style={styles.recourseObligationsList}>
                <Text style={[styles.recourseObligationsTitle, { color: colors.textSecondary }]}>
                  Your obligations
                </Text>
                {([
                  { icon: 'cube-outline', text: 'Safeguard the physical asset in the condition stated' },
                  { icon: 'search-outline', text: 'Prove authenticity when requested by a unit holder' },
                  { icon: 'hand-right-outline', text: 'Produce the physical item on demand within 14 days' },
                  { icon: 'cash-outline', text: 'Repay the total traded value if you fail any obligation' },
                ] as Array<{ icon: React.ComponentProps<typeof Ionicons>['name']; text: string }>).map((ob, i) => (
                  <View key={i} style={[styles.recourseObligationRow, i < 3 && { borderBottomColor: colors.borderSubtle }]}>
                    <Ionicons name={ob.icon} size={16} color={colors.textMuted} />
                    <Text style={[styles.recourseObligationText, { color: colors.textSecondary }]}>
                      {ob.text}
                    </Text>
                  </View>
                ))}
              </View>

              {/* Acceptance checkbox */}
              <Pressable
                style={({ pressed }) => [
                  styles.recourseAcceptRow,
                  { borderColor: recourseAccepted ? colors.brand : colors.border },
                  pressed && { opacity: 0.7 },
                ]}
                onPress={() => { haptic.selection(); setRecourseAccepted(!recourseAccepted); }}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: recourseAccepted }}
                accessibilityLabel="Accept personal liability agreement"
              >
                <View style={[
                  styles.recourseCheckbox,
                  {
                    backgroundColor: recourseAccepted ? colors.brand : 'transparent',
                    borderColor: recourseAccepted ? colors.brand : colors.border,
                  },
                ]}>
                  {recourseAccepted && (
                    <Ionicons name="checkmark" size={14} color={colors.background} />
                  )}
                </View>
                <Text style={[styles.recourseAcceptText, { color: colors.textPrimary }]}>
                  I understand and accept personal liability for this asset
                </Text>
              </Pressable>
            </CoOwnIssueStudioStep>
          </Reanimated.View>
        )}
      </ScrollView>

      {/* Sticky action dock */}
      <CoOwnStickyActionDock>
        {stage === 'review' ? (
          <AppButton
            title={isSubmitting ? 'Issuing...' : 'Issue Co-Own'}
            icon={<Ionicons name="speedometer-outline" size={16} color={colors.background} />}
            onPress={() => void issueCoOwn()}
            variant="primary"
            size="lg"
            disabled={isSubmitting}
            hapticFeedback="heavy"
            accessibilityLabel="Issue co-own"
            style={{ flex: 1 }}
          />
        ) : stage === 'recourse' ? (
          <AppButton
            title={isSubmitting ? 'Signing...' : 'Sign & finish'}
            icon={<Ionicons name="checkmark-done" size={16} color={colors.background} />}
            onPress={() => void signAndFinish()}
            variant="primary"
            size="lg"
            disabled={isSubmitting || !recourseAccepted}
            hapticFeedback="heavy"
            accessibilityLabel="Sign recourse agreement and finish"
            style={{ flex: 1 }}
          />
        ) : (
          <AppButton
            title="Next step"
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
    </FlagshipScreen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: Space.md,
    paddingTop: Space.md,
  },
  listingListContent: {
    gap: Space.md,
    paddingRight: Space.md,
  },
  listingCard: {
    width: Space.xl * 5,
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
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
    height: Space.xxl * 2 + Space.lg,
  },
  listingMeta: {
    gap: Space.xs,
  },
  listingTitle: {
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: TypographyV2.bodyStrong.fontFamily,
    letterSpacing: TypographyV2.body.letterSpacing,
  },
  listingPrice: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
  },
  selectedTick: {
    position: 'absolute',
    top: Space.xs,
    right: Space.xs,
    width: Space.md + Space.xs,
    height: Space.md + Space.xs,
    borderRadius: Radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Space.md,
    marginTop: Space.lg,
  },
  previewImageContainer: {
    borderRadius: Radius.md,
    overflow: 'hidden',
  },
  previewImage: {
    width: Space.xl + Space.lg,
    height: Space.xl + Space.lg,
  },
  previewMeta: {
    flex: 1,
    gap: Space.xs,
  },
  previewTitle: {
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: TypographyV2.bodyStrong.fontFamily,
    letterSpacing: TypographyV2.body.letterSpacing,
  },
  previewPrice: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
  },
  contextCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Space.md,
  },
  contextImage: {
    width: Space.xl + Space.lg,
    height: Space.xl + Space.lg,
    borderRadius: Radius.md,
  },
  contextInfo: {
    flex: 1,
    gap: Space.xs,
  },
  contextTitle: {
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: TypographyV2.bodyStrong.fontFamily,
    letterSpacing: TypographyV2.body.letterSpacing,
  },
  contextPrice: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
  },
  formCard: {
    paddingVertical: Space.md,
    gap: Space.sm,
  },
  formLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  formLabel: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: LetterSpacing.wide + 0.08,
    textTransform: 'uppercase',
  },
  formHint: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
  },
  unitPresets: {
    flexDirection: 'row',
    gap: Space.sm,
  },
  unitPreset: {
    flex: 1,
    paddingVertical: Space.sm,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
  },
  unitPresetText: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
  },
  vehicleTypeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Space.xs,
    marginBottom: Space.sm,
  },
  vehicleTypeChip: {
    paddingVertical: Space.sm,
    paddingHorizontal: Space.md,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
  },
  vehicleTypeText: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
  },
  kycGateCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Space.sm,
    padding: Space.md,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: Space.md,
  },
  kycGateBody: {
    flex: 1,
    gap: Space.xs,
  },
  kycGateTitle: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
  },
  kycGateText: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
  },
  insuranceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingVertical: Space.sm,
  },
  insuranceToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    paddingVertical: Space.xs,
    paddingHorizontal: Space.sm,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  insuranceToggleText: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
  },
  estimateCard: {
    paddingVertical: Space.md,
    gap: Space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  estimatedRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  estimatedValue: {
    fontSize: TypographyV2.priceList.size,
    fontFamily: TypographyV2.priceList.fontFamily,
    letterSpacing: TypographyV2.priceList.letterSpacing,
  },
  estimatedSub: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    marginTop: Space.xs / 2,
  },
  stablePreview: {
    alignItems: 'flex-end',
    gap: Space.xs,
  },
  stableLabel: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
  },
  stableValue: {
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: TypographyV2.bodyStrong.fontFamily,
  },
  reviewAssetCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Space.md,
  },
  reviewAssetImage: {
    width: Space.xl * 2,
    height: Space.xl * 2,
    borderRadius: Radius.md,
  },
  reviewAssetInfo: {
    flex: 1,
    gap: Space.xs,
  },
  reviewAssetTitle: {
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: TypographyV2.bodyStrong.fontFamily,
    letterSpacing: TypographyV2.body.letterSpacing,
  },
  reviewAssetSub: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
  },
  summaryCard: {
    paddingVertical: Space.md,
    gap: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  summaryLabel: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: LetterSpacing.wide + 0.18,
    textTransform: 'uppercase',
    marginBottom: Space.sm,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: Space.md,
  },
  summaryKey: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    flexShrink: 0,
  },
  summaryValue: {
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: TypographyV2.bodyStrong.fontFamily,
    flex: 1,
    minWidth: 0,
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
    gap: Space.md,
  },
  totalKey: {
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: TypographyV2.bodyStrong.fontFamily,
    flexShrink: 1,
    minWidth: 0,
  },
  totalValue: {
    fontSize: TypographyV2.priceList.size,
    fontFamily: TypographyV2.priceList.fontFamily,
    letterSpacing: TypographyV2.priceList.letterSpacing,
    flexShrink: 0,
  },
  // ── Recourse agreement stage ──
  recourseSummaryCard: {
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Space.md,
    gap: Space.sm,
  },
  recourseLiabilityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
  },
  recourseLiabilityBody: {
    flex: 1,
    gap: Space.xs / 2,
  },
  recourseLiabilityLabel: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: LetterSpacing.wide + 0.08,
    textTransform: 'uppercase',
  },
  recourseLiabilityValue: {
    fontSize: TypographyV2.priceList.size,
    fontFamily: TypographyV2.priceList.fontFamily,
    letterSpacing: TypographyV2.priceList.letterSpacing,
  },
  recourseLiabilityBullets: {
    gap: Space.xs,
  },
  recourseBulletText: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    lineHeight: TypographyV2.body.size + 6,
  },
  recourseObligationsList: {
    gap: 0,
    marginTop: Space.md,
  },
  recourseObligationsTitle: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: LetterSpacing.wide + 0.18,
    textTransform: 'uppercase',
    marginBottom: Space.sm,
  },
  recourseObligationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingVertical: Space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  recourseObligationText: {
    flex: 1,
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    lineHeight: TypographyV2.body.lineHeight - 1,
  },
  recourseAcceptRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingVertical: Space.md,
    paddingHorizontal: Space.md,
    borderRadius: Radius.md,
    borderWidth: Stroke.standard,
    marginTop: Space.md,
  },
  recourseCheckbox: {
    width: Control.icon,
    height: Control.icon,
    borderRadius: Radius.md,
    borderWidth: Stroke.standard + Stroke.hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recourseAcceptText: {
    flex: 1,
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    lineHeight: TypographyV2.body.lineHeight - 1,
  },
});
