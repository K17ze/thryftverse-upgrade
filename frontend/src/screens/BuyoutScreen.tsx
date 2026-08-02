import React from 'react';
import { View, Text, StyleSheet, ScrollView, useWindowDimensions, TextInput, ActivityIndicator, Alert } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import Reanimated, { FadeInDown } from 'react-native-reanimated';
import { useAppTheme } from '../theme/ThemeContext';
import { RootStackParamList } from '../navigation/types';
import { useStore } from '../store/useStore';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { useToast } from '../context/ToastContext';
import { parseApiError } from '../lib/apiClient';
import { fetchCoOwnAssetById, fetchCoOwnHoldings, createCoOwnBuyoutOffer } from '../services/marketApi';
import { AppButton } from '../components/ui/AppButton';
import { CachedImage } from '../components/CachedImage';
import { Space, Radius, Type, Typography, DockConstants } from '../theme/designTokens';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { haptics } from '../utils/haptics';
import {
  CoOwnMarketHeader,
  CoOwnStateCanvas,
  CoOwnStickyActionDock,
} from '../components/coown';

type RouteT = RouteProp<RootStackParamList, 'Buyout'>;
type NavT = StackNavigationProp<RootStackParamList>;

export default function BuyoutScreen() {
  const navigation = useNavigation<NavT>();
  const route = useRoute<RouteT>();
  const { colors, isDark } = useAppTheme();
  const { show } = useToast();
  const reducedMotionEnabled = useReducedMotion();
  const insets = useSafeAreaInsets();
  const currentUser = useStore((state) => state.currentUser);
  const { formatFromFiat } = useFormattedPrice();
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

    Alert.alert(
      'Submit buyout offer?',
      `Offer £${priceNum.toFixed(2)}${unitsNum ? ` for ${unitsNum} units` : ' for remaining units'}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Submit offer',
          style: 'default',
          onPress: async () => {
            setSubmitting(true);
            try {
              await createCoOwnBuyoutOffer(asset.id, {
                bidderUserId: currentUser.id,
                offerPriceGbp: priceNum,
                targetUnits: unitsNum,
              });
              haptics.success();
              show('Buyout offer submitted', 'success');
              setOfferPrice('');
              setTargetUnits('');
              navigation.replace('AssetDetail', { assetId: asset.id });
            } catch (err) {
              const parsed = parseApiError(err, 'Failed to submit buyout offer');
              show(parsed.message, 'error');
            } finally {
              setSubmitting(false);
            }
          },
        },
      ]
    );
  }, [asset, currentUser?.id, offerPrice, targetUnits, navigation, show]);

  if (isLoading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <CoOwnMarketHeader
          title="Buyout"
          subtitle="Acquire remaining units"
          onBack={handleBack}
        />
        <CoOwnStateCanvas variant="loading" />
      </SafeAreaView>
    );
  }

  if (isError || !asset) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <CoOwnMarketHeader
          title="Buyout"
          subtitle="Acquire remaining units"
          onBack={handleBack}
        />
        <CoOwnStateCanvas
          variant="error"
          title="Asset not found"
          subtitle="This Co-Own item may have been delisted."
          actionLabel="Back to Co-Own"
          onAction={() => navigation.navigate('CoOwnHub')}
        />
      </SafeAreaView>
    );
  }

  const ownershipPct = asset.totalUnits > 0 ? (sharesOwned / asset.totalUnits) * 100 : 0;
  const ownsAll = sharesOwned >= asset.totalUnits && asset.totalUnits > 0;
  const remainingUnits = Math.max(0, asset.totalUnits - sharesOwned);
  const imageHeight = Math.min(screenWidth * 0.5, 240);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <StatusBar style={isDark ? 'light' : 'dark'} />

      <CoOwnMarketHeader
        title="Buyout"
        subtitle={asset.title}
        onBack={handleBack}
      />

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: scrollBottomPadding }]} showsVerticalScrollIndicator={false}>
        {/* Item image */}
        {asset.imageUrl ? (
          <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300)}>
            <CachedImage uri={asset.imageUrl} style={[styles.image, { height: imageHeight }]} contentFit="cover" transition={300} />
          </Reanimated.View>
        ) : null}

        {/* Title */}
        <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300).delay(50)}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>{asset.title}</Text>
        </Reanimated.View>

        {/* Position summary */}
        <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300).delay(100)}>
          <View style={[styles.positionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.positionRow}>
              <Text style={[styles.positionLabel, { color: colors.textMuted }]}>Your units</Text>
              <Text style={[styles.positionValue, { color: colors.textPrimary }]}>{sharesOwned} / {asset.totalUnits}</Text>
            </View>
            <View style={[styles.positionRow, { borderColor: colors.border }]}>
              <Text style={[styles.positionLabel, { color: colors.textMuted }]}>Ownership</Text>
              <Text style={[styles.positionValue, { color: colors.textPrimary }]}>{ownershipPct.toFixed(1)}%</Text>
            </View>
            <View style={styles.positionRow}>
              <Text style={[styles.positionLabel, { color: colors.textMuted }]}>Remaining</Text>
              <Text style={[styles.positionValue, { color: colors.textPrimary }]}>{remainingUnits} units</Text>
            </View>
          </View>
        </Reanimated.View>

        {/* Status message */}
        <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300).delay(150)}>
          {ownsAll ? (
            <View style={[styles.statusCard, { backgroundColor: colors.success + '12', borderColor: colors.success + '40' }]}>
              <View style={[styles.statusIconWrap, { backgroundColor: colors.success + '22' }]}>
                <Ionicons name="checkmark-circle" size={28} color={colors.success} />
              </View>
              <Text style={[styles.statusTitle, { color: colors.textPrimary }]}>You own 100% of this item</Text>
              <Text style={[styles.statusBody, { color: colors.textSecondary }]}>
                You already hold all units in this Co-Own. No buyout is needed.
              </Text>
            </View>
          ) : (
            <View style={[styles.statusCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={[styles.statusIconWrap, { backgroundColor: colors.surfaceAlt }]}>
                <Ionicons name="cash-outline" size={28} color={colors.brand} />
              </View>
              <Text style={[styles.statusTitle, { color: colors.textPrimary }]}>Make a buyout offer</Text>
              <Text style={[styles.statusBody, { color: colors.textSecondary }]}>
                Submit an offer to acquire the remaining {remainingUnits} units from current holders. Holders will be notified and can accept or decline.
              </Text>
            </View>
          )}
        </Reanimated.View>

        {/* Buyout offer form */}
        {!ownsAll && (
          <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300).delay(200)}>
            <View style={[styles.formCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.formLabel, { color: colors.textSecondary }]}>Offer price (£)</Text>
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
          </Reanimated.View>
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
              onPress={() => { haptics.tap(); void handleCreateBuyoutOffer(); }}
              variant="primary"
              size="lg"
              disabled={submitting || !offerPrice}
              icon={submitting ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="send-outline" size={16} color="#fff" />}
              accessibilityLabel="Submit buyout offer"
              style={{ flex: 2 }}
            />
          </View>
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
  },
  image: {
    width: '100%',
    borderRadius: Radius.lg,
    marginBottom: Space.md,
  },
  title: {
    fontSize: Type.title.size,
    fontFamily: Typography.family.bold,
    letterSpacing: -0.5,
    lineHeight: Type.title.lineHeight,
    marginBottom: Space.md,
  },
  positionCard: {
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Space.md,
    gap: 0,
    marginBottom: Space.lg,
  },
  positionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  positionLabel: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.regular,
  },
  positionValue: {
    fontSize: Type.bodyEmphasis.size,
    fontFamily: Typography.family.semibold,
  },
  statusCard: {
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Space.md,
    gap: Space.sm,
    alignItems: 'center',
  },
  statusIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Space.xs,
  },
  statusTitle: {
    fontSize: Type.subtitle.size,
    fontFamily: Typography.family.semibold,
    letterSpacing: -0.3,
    textAlign: 'center',
  },
  statusBody: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.regular,
    lineHeight: 20,
    textAlign: 'center',
  },
  futureFeatures: {
    gap: Space.xs,
    marginTop: Space.sm,
    alignSelf: 'stretch',
  },
  futureFeatureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
  },
  futureFeatureText: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
  },
  formCard: {
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Space.md,
    marginBottom: Space.lg,
  },
  formLabel: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.medium,
    marginBottom: Space.xs,
  },
  input: {
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    fontSize: Type.body.size,
    fontFamily: Typography.family.regular,
  },
  formHint: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.regular,
    marginTop: Space.xs,
  },
});
