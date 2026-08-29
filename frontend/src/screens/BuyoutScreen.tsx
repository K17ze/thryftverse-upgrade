import React from 'react';
import { View, Text, StyleSheet, ScrollView, useWindowDimensions, TextInput, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAppTheme } from '../theme/ThemeContext';
import { RootStackParamList } from '../navigation/types';
import { useStore } from '../store/useStore';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { useToast } from '../context/ToastContext';
import { parseApiError } from '../lib/apiClient';
import { fetchCoOwnAssetById, fetchCoOwnHoldings, createCoOwnBuyoutOffer } from '../services/marketApi';
import { AppButton } from '../components/ui/AppButton';
import { CachedImage } from '../components/CachedImage';
import { Space, Radius, DockConstants, Stroke } from '../theme/designTokens';
import { TypographyV2 } from '../theme/typography.v2';
import { useConnectivity } from '../hooks/useConnectivity';
import { haptics } from '../utils/haptics';
import { FlagshipScreen, FlagshipHeader } from '../components/flagship';
import { ConfirmationSheet } from '../components/ConfirmationSheet';
import {
  CoOwnStateCanvas,
  CoOwnStickyActionDock } from '../components/coown';

type RouteT = RouteProp<RootStackParamList, 'Buyout'>;
type NavT = NativeStackNavigationProp<RootStackParamList>;

export default function BuyoutScreen() {
  const navigation = useNavigation<NavT>();
  const route = useRoute<RouteT>();
  const { colors } = useAppTheme();
  const { show } = useToast();
  const { isOffline } = useConnectivity();
  const insets = useSafeAreaInsets();
  const currentUser = useStore((state) => state.currentUser);
  const { currencySymbol } = useFormattedPrice();
  const { width: screenWidth } = useWindowDimensions();
  const scrollBottomPadding = Math.max(insets.bottom, Space.md) + DockConstants.singleActionHeight;

  const buyoutAssetId = route.params?.assetId;

  const [asset, setAsset] = React.useState<any>(null);
  const [sharesOwned, setSharesOwned] = React.useState(0);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isError, setIsError] = React.useState(false);

  // Buyout offer creation state
  const [offerPrice, setOfferPrice] = React.useState('');
  const [targetUnits, setTargetUnits] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);
  const [confirmSheet, setConfirmSheet] = React.useState<{
    visible: boolean;
    title: string;
    message: string;
    confirmLabel: string;
    cancelLabel: string;
    onConfirm: () => void;
    variant: 'default' | 'danger';
  }>({ visible: false, title: '', message: '', confirmLabel: 'Confirm', cancelLabel: 'Cancel', onConfirm: () => {}, variant: 'default' });

  React.useEffect(() => {
    if (!buyoutAssetId) { setIsLoading(false); setIsError(true); return; }
    let cancelled = false;
    setIsLoading(true);
    setIsError(false);

    Promise.all([
      fetchCoOwnAssetById(buyoutAssetId),
      currentUser?.id ? fetchCoOwnHoldings(currentUser.id).catch(() => []) : Promise.resolve([]),
    ])
      .then(([fetchedAsset, holdings]) => {
        if (cancelled) return;
        setAsset(fetchedAsset);
        const holding = holdings.find((h) => h.assetId === buyoutAssetId);
        setSharesOwned(holding?.unitsOwned ?? 0);
      })
      .catch((err) => {
        if (cancelled) return;
        const parsed = parseApiError(err, 'Unable to load asset');
        show(parsed.message, 'error');
        setIsError(true);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => { cancelled = true; };
  }, [buyoutAssetId, currentUser?.id, show]);

  const handleBack = React.useCallback(() => {
    if (navigation.canGoBack()) { navigation.goBack(); return; }
    if (buyoutAssetId) navigation.replace('AssetDetail', { assetId: buyoutAssetId });
    else navigation.navigate('CoOwnHub');
  }, [navigation, buyoutAssetId]);

  const handleCreateBuyoutOffer = React.useCallback(async () => {
    if (!asset || !currentUser?.id) return;
    const priceNum = parseFloat(offerPrice);
    if (!priceNum || priceNum <= 0) {
      show('Enter a valid offer price', 'error');
      return;
    }
    const unitsNum = targetUnits.trim() ? parseInt(targetUnits, 10) : undefined;
    if (targetUnits.trim() && (!unitsNum || unitsNum <= 0)) {
      show('Enter a valid target units count', 'error');
      return;
    }

    setConfirmSheet({
      visible: true,
      title: 'Submit buyout offer?',
      message: `Offer ${currencySymbol}${priceNum.toFixed(2)}${unitsNum ? ` for ${unitsNum} units` : ' for remaining units'}?`,
      confirmLabel: 'Submit offer',
      cancelLabel: 'Cancel',
      onConfirm: async () => {
        setSubmitting(true);
        try {
          await createCoOwnBuyoutOffer(asset.id, {
            bidderUserId: currentUser.id,
            offerPriceGbp: priceNum,
            targetUnits: unitsNum });
          haptics.success();
          show('Buyout offer submitted', 'success');
          setOfferPrice('');
          setTargetUnits('');
          navigation.replace('AssetDetail', { assetId: asset.id });
        } catch (err) {
          const isNetworkError = isOffline || (err instanceof Error && /network|fetch|timeout/i.test(err.message));
          const parsed = parseApiError(err, isNetworkError ? 'You appear to be offline. Check your connection and try again.' : 'Failed to submit buyout offer');
          show(parsed.message, 'error');
        } finally {
          setSubmitting(false);
        }
      },
      variant: 'default' });
  }, [asset, currentUser?.id, offerPrice, targetUnits, navigation, show]);

  if (isLoading) {
    return (
      <FlagshipScreen
        style={{ backgroundColor: colors.background }}
        header={
          <FlagshipHeader
            title="Buyout"
            subtitle="Acquire remaining units"
            onBack={handleBack}
          />
        }
        scrollEnabled={false}
      >
        <CoOwnStateCanvas variant="loading" />
      </FlagshipScreen>
    );
  }

  if (isError || !asset) {
    return (
      <FlagshipScreen
        style={{ backgroundColor: colors.background }}
        header={
          <FlagshipHeader
            title="Buyout"
            subtitle="Acquire remaining units"
            onBack={handleBack}
          />
        }
        scrollEnabled={false}
      >
        <CoOwnStateCanvas
          variant="error"
          title="Asset not found"
          subtitle="This Co-Own item may have been delisted."
          actionLabel="Back to Co-Own"
          onAction={() => navigation.navigate('CoOwnHub')}
        />
      </FlagshipScreen>
    );
  }

  const ownershipPct = asset.totalUnits > 0 ? (sharesOwned / asset.totalUnits) * 100 : 0;
  const ownsAll = sharesOwned >= asset.totalUnits && asset.totalUnits > 0;
  const remainingUnits = Math.max(0, asset.totalUnits - sharesOwned);
  const imageHeight = Math.min(screenWidth * 0.5, 240);

  return (
    <FlagshipScreen
      style={{ backgroundColor: colors.background }}
      contentStyle={{ paddingHorizontal: 0, paddingTop: 0 }}
      header={
        <FlagshipHeader
          title="Buyout"
          subtitle={asset.title}
          onBack={handleBack}
        />
      }
      scrollEnabled={false}
    >
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: scrollBottomPadding }]} showsVerticalScrollIndicator={false}>
        {/* Item image */}
        {asset.imageUrl ? (
          <CachedImage uri={asset.imageUrl} style={[styles.image, { height: imageHeight }]} contentFit="cover" transition={300} />
        ) : null}

        {/* Title */}
        <Text style={[styles.title, { color: colors.textPrimary }]}>{asset.title}</Text>

        {/* Position summary — flat section with hairline rows */}
        <View style={[styles.positionSection, { borderBottomColor: colors.borderSubtle }]}>
          <View style={[styles.positionRow, { borderBottomColor: colors.borderSubtle }]}>
            <Text style={[styles.positionLabel, { color: colors.textMuted }]}>Your units</Text>
            <Text style={[styles.positionValue, { color: colors.textPrimary }]}>{sharesOwned} / {asset.totalUnits}</Text>
          </View>
          <View style={[styles.positionRow, { borderBottomColor: colors.borderSubtle }]}>
            <Text style={[styles.positionLabel, { color: colors.textMuted }]}>Ownership</Text>
            <Text style={[styles.positionValue, { color: colors.textPrimary }]}>{ownershipPct.toFixed(1)}%</Text>
          </View>
          <View style={styles.positionRowLast}>
            <Text style={[styles.positionLabel, { color: colors.textMuted }]}>Remaining</Text>
            <Text style={[styles.positionValue, { color: colors.textPrimary }]}>{remainingUnits} units</Text>
          </View>
        </View>

        {/* Status message — flat section */}
        {ownsAll ? (
          <View style={[styles.statusSection, { borderBottomColor: colors.borderSubtle }]}>
            <Ionicons name="checkmark-circle" size={28} color={colors.success} />
            <Text style={[styles.statusTitle, { color: colors.textPrimary }]}>You own 100% of this item</Text>
            <Text style={[styles.statusBody, { color: colors.textSecondary }]}>
              You already hold all units in this Co-Own. No buyout is needed.
            </Text>
          </View>
        ) : (
          <View style={[styles.statusSection, { borderBottomColor: colors.borderSubtle }]}>
            <Ionicons name="cash-outline" size={28} color={colors.brand} />
            <Text style={[styles.statusTitle, { color: colors.textPrimary }]}>Make a buyout offer</Text>
            <Text style={[styles.statusBody, { color: colors.textSecondary }]}>
              Submit an offer to acquire the remaining {remainingUnits} units from current holders. Holders will be notified and can accept or decline.
            </Text>
          </View>
        )}

        {/* Buyout offer form — flat section */}
        {!ownsAll && (
          <View style={styles.formSection}>
            <Text style={[styles.formLabel, { color: colors.textSecondary }]}>Offer price ({currencySymbol})</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.textPrimary }]}
              value={offerPrice}
              onChangeText={setOfferPrice}
              placeholder="e.g. 500.00"
              placeholderTextColor={colors.textMuted}
              keyboardType="decimal-pad"
              accessibilityLabel="Offer price in pounds"
            />

            <Text style={[styles.formLabel, { color: colors.textSecondary, marginTop: Space.md }]}>Target units (optional)</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.textPrimary }]}
              value={targetUnits}
              onChangeText={setTargetUnits}
              placeholder={`All remaining (${remainingUnits})`}
              placeholderTextColor={colors.textMuted}
              keyboardType="numeric"
              accessibilityLabel="Target units to acquire"
            />
            <Text style={[styles.formHint, { color: colors.textMuted }]}>
              Leave blank to offer on all remaining units.
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Sticky action dock */}
      <CoOwnStickyActionDock>
        {ownsAll ? (
          <AppButton
            title="Back to item"
            onPress={() => { haptics.tap(); navigation.replace('AssetDetail', { assetId: asset.id }); }}
            variant="secondary"
            size="lg"
            icon={<Ionicons name="arrow-back" size={16} color={colors.textPrimary} />}
            accessibilityLabel="Go back to item detail"
            style={{ flex: 1 }}
          />
        ) : (
          <View style={{ flexDirection: 'row', gap: Space.sm, flex: 1 }}>
            <AppButton
              title="Back"
              onPress={() => { haptics.tap(); handleBack(); }}
              variant="secondary"
              size="lg"
              accessibilityLabel="Go back"
              style={{ flex: 1 }}
            />
            <AppButton
              title={submitting ? 'Submitting…' : 'Submit offer'}
              onPress={() => { haptics.press(); void handleCreateBuyoutOffer(); }}
              variant="primary"
              size="lg"
              disabled={submitting || !offerPrice}
              icon={submitting ? <ActivityIndicator size="small" color={colors.textInverse} /> : <Ionicons name="send-outline" size={16} color={colors.textInverse} />}
              accessibilityLabel="Submit buyout offer"
              style={{ flex: 2 }}
            />
          </View>
        )}
      </CoOwnStickyActionDock>

      <ConfirmationSheet
        visible={confirmSheet.visible}
        onDismiss={() => setConfirmSheet((prev) => ({ ...prev, visible: false }))}
        title={confirmSheet.title}
        message={confirmSheet.message}
        confirmLabel={confirmSheet.confirmLabel}
        cancelLabel={confirmSheet.cancelLabel}
        onConfirm={confirmSheet.onConfirm}
        variant={confirmSheet.variant}
      />
    </FlagshipScreen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: Space.md,
    paddingTop: Space.md },
  image: {
    width: '100%',
    borderRadius: Radius.lg,
    marginBottom: Space.md },
  title: {
    fontSize: TypographyV2.screenTitle.size,
    fontFamily: TypographyV2.screenTitle.fontFamily,
    letterSpacing: TypographyV2.screenTitle.letterSpacing + 0.1,
    lineHeight: TypographyV2.screenTitle.lineHeight,
    marginBottom: Space.md },
  positionSection: {
    paddingVertical: Space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth },
  positionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth },
  positionRowLast: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Space.sm },
  positionLabel: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily },
  positionValue: {
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: TypographyV2.bodyStrong.fontFamily },
  statusSection: {
    paddingVertical: Space.lg,
    gap: Space.sm,
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth },
  statusTitle: {
    fontSize: TypographyV2.sectionTitle.size,
    fontFamily: TypographyV2.sectionTitle.fontFamily,
    letterSpacing: TypographyV2.sectionTitle.letterSpacing + 0.1,
    textAlign: 'center' },
  statusBody: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    lineHeight: TypographyV2.body.lineHeight,
    textAlign: 'center' },
  formSection: {
    paddingVertical: Space.md },
  formLabel: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    marginBottom: Space.xs },
  input: {
    borderWidth: Stroke.standard,
    borderRadius: Radius.md,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    fontVariant: ['tabular-nums'] },
  formHint: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    marginTop: Space.xs } });
