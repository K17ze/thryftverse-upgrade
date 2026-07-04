import React from 'react';
import { View, StyleSheet, StatusBar, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import Reanimated, { FadeInDown } from 'react-native-reanimated';
import { useAppTheme } from '../theme/ThemeContext';
import { Colors } from '../constants/colors';
import { RootStackParamList } from '../navigation/types';
import { useStore } from '../store/useStore';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { useToast } from '../context/ToastContext';
import { parseApiError } from '../lib/apiClient';
import { fetchCoOwnAssetById, fetchCoOwnHoldings } from '../services/marketApi';
import { AppButton } from '../components/ui/AppButton';
import { CachedImage } from '../components/CachedImage';
import { TradeHeader } from '../components/trade';
import { Space, Radius, Typography } from '../theme/designTokens';
import { Motion } from '../constants/motion';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { Meta, BodyEmphasis, Body } from '../components/ui/Text';

type RouteT = RouteProp<RootStackParamList, 'Buyout'>;
type NavT = StackNavigationProp<RootStackParamList>;

export default function BuyoutScreen() {
  const navigation = useNavigation<NavT>();
  const route = useRoute<RouteT>();
  const { show } = useToast();
  const { isDark } = useAppTheme();
  const reducedMotionEnabled = useReducedMotion();
  const currentUser = useStore((state) => state.currentUser);
  const { formatFromFiat } = useFormattedPrice();

  const buyoutAssetId = route.params?.assetId;

  const [asset, setAsset] = React.useState<any>(null);
  const [sharesOwned, setSharesOwned] = React.useState(0);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isError, setIsError] = React.useState(false);

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

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={Colors.background} />
        <TradeHeader title="Buyout" onBack={() => navigation.goBack()} />
        <View style={styles.emptyWrap}>
          <Meta style={styles.emptyText}>Loading asset details...</Meta>
        </View>
      </SafeAreaView>
    );
  }

  if (isError || !asset) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={Colors.background} />
        <TradeHeader title="Buyout" onBack={() => navigation.goBack()} />
        <View style={styles.emptyWrap}>
          <BodyEmphasis style={styles.emptyText}>Asset not found.</BodyEmphasis>
        </View>
      </SafeAreaView>
    );
  }

  const ownershipPct = asset.totalUnits > 0 ? (sharesOwned / asset.totalUnits) * 100 : 0;
  const ownsAll = sharesOwned >= asset.totalUnits && asset.totalUnits > 0;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={Colors.background} />

      <TradeHeader title="Buyout" onBack={() => navigation.goBack()} />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {asset.imageUrl ? (
          <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(Motion.list.enterDuration)}>
            <CachedImage uri={asset.imageUrl} style={styles.image} containerStyle={styles.imageContainer} contentFit="cover" />
          </Reanimated.View>
        ) : null}

        <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(Motion.list.enterDuration).delay(50)}>
          <BodyEmphasis style={styles.title}>{asset.title}</BodyEmphasis>
        </Reanimated.View>

        <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(Motion.list.enterDuration).delay(100)}>
          <View style={styles.positionSummary}>
            <View style={styles.positionRow}>
              <Meta style={styles.positionLabel}>Your units</Meta>
              <BodyEmphasis style={styles.positionValue}>{sharesOwned} / {asset.totalUnits}</BodyEmphasis>
            </View>
            <View style={styles.positionRow}>
              <Meta style={styles.positionLabel}>Ownership</Meta>
              <BodyEmphasis style={styles.positionValue}>{ownershipPct.toFixed(1)}%</BodyEmphasis>
            </View>
          </View>
        </Reanimated.View>

        {ownsAll ? (
          <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(Motion.list.enterDuration).delay(150)}>
            <View style={styles.unavailableCard}>
              <Ionicons name="checkmark-circle-outline" size={32} color={Colors.success} />
              <BodyEmphasis style={styles.unavailableTitle}>You own 100% of this Co-Own</BodyEmphasis>
              <Body style={styles.unavailableBody}>
                You already hold all units in this pool. No buyout is needed.
              </Body>
            </View>
          </Reanimated.View>
        ) : (
          <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(Motion.list.enterDuration).delay(150)}>
            <View style={styles.unavailableCard}>
              <View style={styles.unavailableIconWrap}>
                <Ionicons name="lock-closed-outline" size={28} color={Colors.textMuted} />
              </View>
              <BodyEmphasis style={styles.unavailableTitle}>Buyout is not available yet</BodyEmphasis>
              <Body style={styles.unavailableBody}>
                Full buyout lifecycle — including offer acceptance, rejection, cancellation, and settlement — is not yet supported for this Co-Own.
              </Body>
              <Body style={styles.unavailableBody}>
                When buyout is enabled, you will be able to make an offer on the remaining units, track acceptance from other co-owners, and complete the transfer through a server-verified process.
              </Body>
              <View style={styles.futureFeatures}>
                <View style={styles.futureFeatureRow}>
                  <Ionicons name="checkmark" size={14} color={Colors.textMuted} />
                  <Meta style={styles.futureFeatureText}>Server-calculated buyout price</Meta>
                </View>
                <View style={styles.futureFeatureRow}>
                  <Ionicons name="checkmark" size={14} color={Colors.textMuted} />
                  <Meta style={styles.futureFeatureText}>Co-owner acceptance tracking</Meta>
                </View>
                <View style={styles.futureFeatureRow}>
                  <Ionicons name="checkmark" size={14} color={Colors.textMuted} />
                  <Meta style={styles.futureFeatureText}>Settlement and transfer receipt</Meta>
                </View>
              </View>
            </View>
          </Reanimated.View>
        )}

        <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(Motion.list.enterDuration).delay(200)}>
          <AppButton
            title="Back to asset"
            onPress={() => navigation.replace('AssetDetail', { assetId: asset.id })}
            variant="secondary"
            size="md"
            style={styles.backBtn}
            icon={<Ionicons name="arrow-back" size={16} color={Colors.textPrimary} />}
            accessibilityLabel="Go back to asset detail"
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
  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    color: Colors.textSecondary,
  },
  content: {
    paddingHorizontal: Space.md,
    paddingTop: Space.sm,
    paddingBottom: Space.xxl,
  },
  imageContainer: {
    width: '100%',
    height: 220,
    borderRadius: Radius.lg,
    backgroundColor: Colors.surface,
    marginBottom: Space.sm,
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  title: {
    marginBottom: Space.md,
  },
  positionSummary: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Space.md,
    marginBottom: Space.lg,
  },
  positionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Space.xs,
  },
  positionLabel: {
    color: Colors.textSecondary,
  },
  positionValue: {
    fontSize: 16,
  },
  unavailableCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Space.lg,
    alignItems: 'center',
    marginBottom: Space.lg,
  },
  unavailableIconWrap: {
    width: 56,
    height: 56,
    borderRadius: Radius.full,
    backgroundColor: Colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Space.md,
  },
  unavailableTitle: {
    textAlign: 'center',
    marginBottom: Space.sm,
    fontSize: 17,
  },
  unavailableBody: {
    textAlign: 'center',
    color: Colors.textSecondary,
    marginBottom: Space.sm,
    lineHeight: 22,
  },
  futureFeatures: {
    marginTop: Space.md,
    alignSelf: 'stretch',
    gap: Space.xs,
  },
  futureFeatureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
  },
  futureFeatureText: {
    color: Colors.textMuted,
  },
  backBtn: {
    marginTop: Space.sm,
  },
});
