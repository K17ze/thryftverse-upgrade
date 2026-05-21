import React from 'react';
import { View, StyleSheet, RefreshControl } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import Reanimated, { FadeInDown } from 'react-native-reanimated';
import { Colors } from '../constants/colors';
import { RootStackParamList } from '../navigation/types';
import {
  formatMoney,
  getCoOwnMarket,
  getUserLabel,
  CoOwnAsset,
} from '../data/tradeHub';
import { useToast } from '../context/ToastContext';
import { EmptyState } from '../components/EmptyState';
import { useStore } from '../store/useStore';
import { useCurrencyContext } from '../context/CurrencyContext';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { SkeletonLoader } from '../components/SkeletonLoader';
import { SyncStatusPill } from '../components/SyncStatusPill';
import { SyncRetryBanner } from '../components/SyncRetryBanner';
import { AppButton } from '../components/ui/AppButton';
import { AppSegmentControl } from '../components/ui/AppSegmentControl';
import { formatIzeAmount, toIze } from '../utils/currency';
import { parseApiError } from '../lib/apiClient';
import { listCoOwnAssets, placeCoOwnOrder } from '../services/marketApi';
import { t } from '../i18n';
import { MOCK_USERS } from '../data/mockData';
import { Motion } from '../constants/motion';
import { Space, Radius } from '../theme/designTokens';
import { useReducedMotion } from '../hooks/useReducedMotion';
import {
  MetricGrid,
  CoOwnAssetCard,
  UnitsComposer,
} from '../components/trade';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { Meta, Body, BodyEmphasis } from '../components/ui/Text';

type NavT = StackNavigationProp<RootStackParamList>;
type CoOwnView = 'ISSUED' | 'HOLDINGS';

const CO_OWN_MAX_UNITS = 20;

function formatSigned(value: number) {
  const sign = value >= 0 ? '+' : '-';
  return `${sign}${formatMoney(Math.abs(value))}`;
}

export default function CoOwnScreen() {
  const navigation = useNavigation<NavT>();
  const { show } = useToast();
  const { goldRates } = useCurrencyContext();
  const { formatFromFiat, formatFromIze } = useFormattedPrice();
  const currentUser = useStore((state) => state.currentUser);
  const customCoOwns = useStore((state) => state.customCoOwns);
  const coOwnRuntime = useStore((state) => state.coOwnRuntime);
  const supportUser = MOCK_USERS[0];
  const reducedMotionEnabled = useReducedMotion();

  const actingUserId = currentUser?.id ?? 'u1';

  const [refreshing, setRefreshing] = React.useState(false);
  const [activeView, setActiveView] = React.useState<CoOwnView>('ISSUED');
  const [unitsComposerVisible, setUnitsComposerVisible] = React.useState(false);
  const [composerMode, setComposerMode] = React.useState<'buy' | 'sell'>('buy');
  const [selectedAsset, setSelectedAsset] = React.useState<CoOwnAsset | null>(null);
  const [unitsInput, setUnitsInput] = React.useState('1');
  const [remoteAssets, setRemoteAssets] = React.useState<CoOwnAsset[]>([]);
  const [isSyncingAssets, setIsSyncingAssets] = React.useState(false);
  const [syncError, setSyncError] = React.useState<string | null>(null);
  const [isSubmittingOrder, setIsSubmittingOrder] = React.useState(false);

  const syncCoOwnAssets = React.useCallback(async () => {
    setIsSyncingAssets(true);
    try {
      const items = await listCoOwnAssets({ limit: 120, issuerId: actingUserId });
      const mapped: CoOwnAsset[] = items.map((item) => ({
        id: item.id,
        listingId: item.listingId,
        issuerId: item.issuerId,
        title: item.title,
        image: item.imageUrl ?? `https://picsum.photos/seed/${item.id}/500/700`,
        totalUnits: item.totalUnits,
        availableUnits: item.availableUnits,
        unitPriceGBP: item.unitPriceGbp,
        unitPriceStable: item.unitPriceStable,
        settlementMode: 'TVUSD',
        issuerJurisdiction: undefined,
        marketMovePct24h: item.marketMovePct24h,
        holders: item.holders,
        volume24hGBP: item.volume24hGbp,
        yourUnits: 0,
        isOpen: item.isOpen,
      }));
      setRemoteAssets(mapped);
      setSyncError(null);
    } catch (error) {
      setSyncError((error as Error).message || t('syndicate.sync.unable'));
    } finally {
      setIsSyncingAssets(false);
    }
  }, [actingUserId]);

  React.useEffect(() => {
    void syncCoOwnAssets();
  }, [syncCoOwnAssets]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await syncCoOwnAssets();
    setRefreshing(false);
  };

  const mergedAssets = React.useMemo(() => {
    const merged = new Map<string, CoOwnAsset>();
    for (const item of remoteAssets) merged.set(item.id, item);
    for (const item of customCoOwns) {
      if (item.issuerId !== actingUserId) continue;
      merged.set(item.id, { ...item, settlementMode: 'TVUSD', issuerJurisdiction: undefined });
    }
    return [...merged.values()];
  }, [actingUserId, customCoOwns, remoteAssets]);

  const baseAssets = React.useMemo(() => getCoOwnMarket(mergedAssets), [mergedAssets]);

  const marketAssets = React.useMemo(() => {
    return baseAssets.map((asset) => {
      const runtime = coOwnRuntime[asset.id];
      if (!runtime) return asset;
      return {
        ...asset,
        availableUnits: runtime.availableUnits,
        holders: runtime.holders,
        volume24hGBP: runtime.volume24hGBP,
        yourUnits: runtime.yourUnits,
        unitPriceGBP: runtime.unitPriceGBP,
        unitPriceStable: runtime.unitPriceStable,
        marketMovePct24h: runtime.marketMovePct24h,
        avgEntryPriceGBP: runtime.avgEntryPriceGBP,
        realizedProfitGBP: runtime.realizedProfitGBP,
      };
    });
  }, [baseAssets, coOwnRuntime]);

  const visibleAssets = React.useMemo(() => {
    if (activeView === 'HOLDINGS') return marketAssets.filter((asset) => asset.yourUnits > 0);
    return marketAssets;
  }, [activeView, marketAssets]);

  const totalMarketValue = React.useMemo(
    () => marketAssets.reduce((sum, asset) => sum + asset.totalUnits * asset.unitPriceGBP, 0),
    [marketAssets]
  );

  const holdingsValue = React.useMemo(
    () => marketAssets.reduce((sum, asset) => sum + asset.yourUnits * asset.unitPriceGBP, 0),
    [marketAssets]
  );

  const unrealizedPnl = React.useMemo(() => {
    return marketAssets.reduce((sum, asset) => {
      if (asset.yourUnits <= 0) return sum;
      const avgEntry = asset.avgEntryPriceGBP ?? asset.unitPriceGBP;
      return sum + (asset.unitPriceGBP - avgEntry) * asset.yourUnits;
    }, 0);
  }, [marketAssets]);

  const realizedPnl = React.useMemo(
    () => marketAssets.reduce((sum, asset) => sum + (asset.realizedProfitGBP ?? 0), 0),
    [marketAssets]
  );

  const poolStatus = React.useMemo(() => {
    if (isSyncingAssets) return { tone: 'syncing' as const, label: t('syndicate.status.syncing') };
    if (syncError) return { tone: 'offline' as const, label: t('syndicate.status.reconnecting') };
    if (remoteAssets.length > 0) return { tone: 'live' as const, label: t('syndicate.status.synced') };
    if (marketAssets.length > 0) return { tone: 'offline' as const, label: t('syndicate.status.localMode') };
    return { tone: 'offline' as const, label: t('syndicate.status.none') };
  }, [isSyncingAssets, marketAssets.length, remoteAssets.length, syncError]);

  const handleOpenSyndicateSupport = React.useCallback(() => {
    navigation.navigate('Chat', {
      conversationId: 'c1',
      focusQuery: 'co-own issuance and holdings',
      partnerUserId: supportUser.id,
    });
    show('Opening support chat for co-own help.', 'info');
  }, [navigation, show, supportUser.id]);

  const openUnitsComposer = (asset: CoOwnAsset, mode: 'buy' | 'sell') => {
    setComposerMode(mode);
    setSelectedAsset(asset);
    if (mode === 'sell') {
      setUnitsInput(String(Math.max(1, Math.min(asset.yourUnits, 10))));
    } else {
      setUnitsInput('1');
    }
    setUnitsComposerVisible(true);
  };

  const closeUnitsComposer = () => {
    setUnitsComposerVisible(false);
    setSelectedAsset(null);
    setComposerMode('buy');
    setUnitsInput('1');
  };

  const submitUnitsOrder = async () => {
    if (!selectedAsset) return;
    if (isSubmittingOrder) return;

    const units = Math.floor(Number(unitsInput));
    if (!Number.isFinite(units) || units <= 0) {
      show(t('syndicate.units.error.min'), 'error');
      return;
    }
    if (units > CO_OWN_MAX_UNITS) {
      show(t('syndicate.units.error.max', { max: CO_OWN_MAX_UNITS }), 'error');
      return;
    }

    setIsSubmittingOrder(true);
    try {
      let remoteOrder: Awaited<ReturnType<typeof placeCoOwnOrder>> | null = null;
      try {
        remoteOrder = await placeCoOwnOrder(selectedAsset.id, {
          userId: actingUserId,
          side: composerMode,
          units,
        });
        await syncCoOwnAssets();
      } catch (error) {
        const parsedError = parseApiError(error, t('syndicate.order.error.unableSubmit'));
        if (!parsedError.isNetworkError) {
          show(parsedError.message, 'error');
          return;
        }
        show(t('syndicate.order.error.engineUnavailable'), 'error');
        return;
      }

      if (remoteOrder) {
        if (remoteOrder.order.status === 'rejected') {
          show(t('syndicate.order.error.rejected'), 'error');
          return;
        }
        closeUnitsComposer();
        if (remoteOrder.order.status === 'open' || remoteOrder.order.status === 'partially_filled') {
          show(t('syndicate.order.info.placed'), 'info');
        } else {
          show(t('syndicate.order.success.executed'), 'success');
        }
        if (remoteOrder.aml?.alertId) show(t('syndicate.order.info.aml'), 'info');
      }
    } finally {
      setIsSubmittingOrder(false);
    }
  };

  const renderHeader = () => (
    <View>
      <View style={styles.heroQuickRow}>
        <AppButton
          title={t('syndicate.quick.leaderboard')}
          icon={<Ionicons name="trophy-outline" size={13} color={Colors.textSecondary} />}
          style={styles.heroQuickChip}
          variant="secondary"
          size="sm"
          onPress={() => navigation.navigate('AssetLeaderboard')}
        />
        <AppButton
          title={t('syndicate.quick.recentOrders')}
          icon={<Ionicons name="time-outline" size={13} color={Colors.textSecondary} />}
          style={styles.heroQuickChip}
          variant="secondary"
          size="sm"
          onPress={() => navigation.navigate('CoOwnOrderHistory')}
        />
      </View>

      <MetricGrid
        metrics={[
          { label: t('syndicate.metrics.issuedPools'), value: String(marketAssets.length) },
          { label: t('syndicate.metrics.issuedValue'), value: formatFromFiat(totalMarketValue, 'GBP', { displayMode: 'fiat' }) },
          { label: t('syndicate.metrics.yourValue'), value: formatMoney(holdingsValue) },
        ]}
        columns={3}
      />

      <MetricGrid
        metrics={[
          { label: t('syndicate.metrics.unrealized'), value: formatSigned(unrealizedPnl), tone: unrealizedPnl >= 0 ? 'positive' : 'negative' },
          { label: t('syndicate.metrics.realized'), value: formatSigned(realizedPnl), tone: realizedPnl >= 0 ? 'positive' : 'negative' },
        ]}
        columns={2}
        style={{ marginTop: -Space.xs }}
      />

      {syncError ? (
        <SyncRetryBanner
          message={t('syndicate.sync.delayed')}
          onRetry={() => void syncCoOwnAssets()}
          isRetrying={isSyncingAssets}
          telemetryContext="coOwn_market_sync"
          containerStyle={styles.syncBanner}
        />
      ) : null}

      <View style={styles.issueRow}>
        <View>
          <BodyEmphasis style={styles.issueTitle}>{t('syndicate.issue.console')}</BodyEmphasis>
          <Meta style={styles.issueHint}>Issue co-own splits from your listings</Meta>
        </View>
        <AppButton
          title={t('syndicate.issue.cta')}
          icon={<Ionicons name="add" size={15} color={Colors.background} />}
          style={styles.issueBtn}
          variant="primary"
          size="sm"
          onPress={() => navigation.navigate('CreateCoOwn')}
          hapticFeedback="medium"
        />
      </View>

      <View style={styles.quickActionsRow}>
        <AppButton
          title={t('syndicate.quick.portfolio')}
          icon={<Ionicons name="pie-chart-outline" size={13} color={Colors.textSecondary} />}
          style={styles.quickActionChip}
          variant="secondary"
          size="sm"
          onPress={() => navigation.navigate('Portfolio')}
        />
        <AppButton
          title={t('syndicate.quick.orders')}
          icon={<Ionicons name="time-outline" size={13} color={Colors.textSecondary} />}
          style={styles.quickActionChip}
          variant="secondary"
          size="sm"
          onPress={() => navigation.navigate('CoOwnOrderHistory')}
        />
      </View>

      <AppSegmentControl
        style={styles.switcherWrap}
        options={[
          { value: 'ISSUED', label: t('syndicate.switcher.issued'), accessibilityLabel: 'Show issued pools' },
          { value: 'HOLDINGS', label: t('syndicate.switcher.holdings'), accessibilityLabel: 'Show your holdings' },
        ]}
        value={activeView}
        onChange={(v) => setActiveView(v as CoOwnView)}
        fullWidth
      />
    </View>
  );

  const renderLoadingState = () => (
    <View style={styles.loadingWrap}>
      {[0, 1, 2].map((i) => (
        <View key={i} style={styles.loadingCard}>
          <SkeletonLoader width="100%" height={160} borderRadius={12} />
          <View style={{ padding: 12 }}>
            <SkeletonLoader width="70%" height={16} borderRadius={8} style={{ marginBottom: 8 }} />
            <SkeletonLoader width="50%" height={12} borderRadius={6} style={{ marginBottom: 8 }} />
            <SkeletonLoader width="100%" height={40} borderRadius={10} />
          </View>
        </View>
      ))}
    </View>
  );

  const isHoldingsMode = activeView === 'HOLDINGS';

  return (
    <>
      <FlashList
        data={visibleAssets}
        keyExtractor={(item) => item.id}
        renderItem={({ item, index }) => {
          const issuerUser = MOCK_USERS.find((user) => user.id === item.issuerId);
          const issuerHandle = issuerUser?.username ?? item.issuerId;
          const canMessageIssuer = currentUser?.id !== item.issuerId;
          const marketValue = item.totalUnits * item.unitPriceGBP;
          const openValue = item.availableUnits * item.unitPriceGBP;

          return (
            <Reanimated.View
              entering={
                reducedMotionEnabled
                  ? undefined
                  : FadeInDown
                      .duration(Motion.list.enterDuration)
                      .delay(Math.min(index, Motion.list.maxStaggerItems) * Motion.list.staggerStep)
              }
            >
              <CoOwnAssetCard
                id={item.id}
                title={item.title}
                image={item.image}
                unitPrice={formatFromFiat(item.unitPriceGBP, 'GBP')}
                marketValue={formatFromFiat(marketValue, 'GBP', { displayMode: 'fiat' })}
                openValue={formatFromFiat(openValue, 'GBP', { displayMode: 'fiat' })}
                availableUnits={item.availableUnits}
                totalUnits={item.totalUnits}
                marketMovePct24h={item.marketMovePct24h}
                issuerHandle={issuerHandle}
                issuerAvatar={issuerUser?.avatar}
                yourUnits={item.yourUnits}
                isOpen={item.isOpen}
                onPress={() => navigation.navigate('AssetDetail', { assetId: item.id })}
                onBuy={() => openUnitsComposer(item, 'buy')}
                onSell={() => openUnitsComposer(item, 'sell')}
                onDetails={() => navigation.navigate('AssetDetail', { assetId: item.id })}
                onMessageIssuer={() =>
                  navigation.navigate('Chat', {
                    conversationId: `${item.issuerId}_${item.listingId}`,
                    focusQuery: issuerHandle,
                    partnerUserId: item.issuerId,
                  })
                }
                onViewIssuer={() => navigation.navigate('UserProfile', { userId: item.issuerId })}
                canMessageIssuer={canMessageIssuer}
                isSubmitting={isSubmittingOrder}
              />
            </Reanimated.View>
          );
        }}
        ListHeaderComponent={renderHeader}
        ListEmptyComponent={
          isSyncingAssets ? renderLoadingState() : (
            <EmptyState
              icon="pie-chart-outline"
              title={isHoldingsMode ? 'No holdings yet' : 'No pools issued'}
              subtitle={
                isHoldingsMode
                  ? 'Purchase units from issued pools to build your portfolio.'
                  : 'Issue a co-own to split a listing into tradable units.'
              }
            />
          )
        }
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
        ItemSeparatorComponent={() => <View style={{ height: Space.sm }} />}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={Colors.brand}
            colors={[Colors.brand]}
            progressBackgroundColor={Colors.surfaceAlt}
          />
        }
      />

      <UnitsComposer
        visible={unitsComposerVisible}
        assetTitle={selectedAsset?.title ?? ''}
        composerMode={composerMode}
        unitsInput={unitsInput}
        availableUnits={selectedAsset?.availableUnits ?? 0}
        yourUnits={selectedAsset?.yourUnits ?? 0}
        unitPriceGBP={selectedAsset?.unitPriceGBP ?? 0}
        avgEntryPriceGBP={selectedAsset?.avgEntryPriceGBP}
        estimatedIze={selectedAsset ? formatIzeAmount(toIze(Number(unitsInput) * (selectedAsset?.unitPriceGBP ?? 0), 'GBP', goldRates)) : '0 1ze'}
        estimatedFiat={selectedAsset ? `≈ ${formatFromFiat(Number(unitsInput) * (selectedAsset?.unitPriceGBP ?? 0), 'GBP', { displayMode: 'fiat' })}` : '≈ —'}
        estimatedRealized={
          composerMode === 'sell' && selectedAsset
            ? formatSigned(
                Number(unitsInput) *
                (selectedAsset.unitPriceGBP - (selectedAsset.avgEntryPriceGBP ?? selectedAsset.unitPriceGBP))
              )
            : undefined
        }
        isSubmitting={isSubmittingOrder}
        onUnitsChange={(value) => {
          const sanitized = value.replace(/\D/g, '');
          if (!sanitized) { setUnitsInput(''); return; }
          const parsed = Math.floor(Number(sanitized));
          if (!Number.isFinite(parsed) || parsed <= 0) { setUnitsInput('1'); return; }
          setUnitsInput(String(Math.min(CO_OWN_MAX_UNITS, parsed)));
        }}
        onQuickSet={(u) => setUnitsInput(String(u))}
        onCancel={closeUnitsComposer}
        onSubmit={() => void submitUnitsOrder()}
      />
    </>
  );
}

const styles = StyleSheet.create({
  contentContainer: {
    paddingBottom: 130,
    paddingTop: Space.sm,
  },
  heroQuickRow: {
    flexDirection: 'row',
    gap: Space.sm,
    paddingHorizontal: Space.md,
    marginBottom: Space.sm,
  },
  heroQuickChip: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    minHeight: 38,
  },
  syncBanner: {
    marginHorizontal: Space.md,
    marginBottom: Space.sm,
  },
  issueRow: {
    marginHorizontal: Space.md,
    marginBottom: Space.sm,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  issueTitle: {},
  issueHint: {
    marginTop: 2,
  },
  issueBtn: {
    borderRadius: 14,
    backgroundColor: Colors.brand,
    minHeight: 34,
    paddingHorizontal: 12,
    borderWidth: 0,
  },
  quickActionsRow: {
    marginHorizontal: Space.md,
    marginBottom: Space.sm,
    flexDirection: 'row',
    gap: Space.sm,
  },
  quickActionChip: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    minHeight: 38,
  },
  switcherWrap: {
    marginHorizontal: Space.md,
    marginBottom: Space.sm,
    backgroundColor: Colors.surface,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 4,
    flexDirection: 'row',
    gap: 4,
  },
  loadingWrap: {
    paddingHorizontal: Space.md,
    gap: Space.sm,
  },
  loadingCard: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    overflow: 'hidden',
    marginBottom: Space.sm,
  },
});
