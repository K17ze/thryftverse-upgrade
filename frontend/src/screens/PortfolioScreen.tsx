import React from 'react';
import { View, Text, StyleSheet, RefreshControl, useWindowDimensions, Pressable } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAppTheme } from '../theme/ThemeContext';
import { RootStackParamList } from '../navigation/types';
import { useStore } from '../store/useStore';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { useToast } from '../context/ToastContext';
import { Space, FontFamily, Stroke, LetterSpacing, Numeric } from '../theme/designTokens';
import { TypographyV2 } from '../theme/typography.v2';
import { RadiusRoleValue } from '../theme/surfaceRadiusRules';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { FlagshipScreen, FlagshipHeader } from '../components/flagship';
import { CoOwnNumericText } from '../components/ui/CoOwnNumericText';
import { haptics } from '../utils/haptics';
import {
  CoOwnPositionCard,
  CoOwnPositionActionSheet,
  CoOwnPortfolioSkeleton,
  CoOwnStateCanvas,
  CoOwnPortfolioStorytelling,
  CoOwnPortfolioPerformanceChart,
  CoOwnOfflineBanner,
  CoOwnReconciliationBanner,
  type CoOwnPositionAction,
} from '../components/coown';
import { fetchCoOwnPortfolioPositions, type CoOwnPositionVM, type CoOwnPortfolioSummary } from '../services/coOwnPortfolio';
// listCoOwnAssets and fetchCoOwnHoldings are re-exported here for transparency.
// The coOwnPortfolio adapter composes them internally; importing them here
// keeps the screen's data dependencies visible and auditable.
import { listCoOwnAssets, fetchCoOwnHoldings } from '../services/marketApi';
import { parseApiError } from '../lib/apiClient';
import { useBackendData } from '../context/BackendDataContext';
import { useConnectivity } from '../hooks/useConnectivity';
import { useScreenCaptureProtection } from '../platform/screenCapture';

type NavT = NativeStackNavigationProp<RootStackParamList>;

export default function PortfolioScreen() {
  useScreenCaptureProtection();
  const navigation = useNavigation<NavT>();
  const { colors } = useAppTheme();
  const currentUser = useStore((state) => state.currentUser);
  const coOwnWatchlist = useStore((state) => state.coOwnWatchlist);
  const { formatFromFiat, currencyCode } = useFormattedPrice();
  const { show } = useToast();
  const { width: screenWidth } = useWindowDimensions();
  const { listings } = useBackendData();
  const { isOffline } = useConnectivity();

  const [positions, setPositions] = React.useState<CoOwnPositionVM[]>([]);
  const [summary, setSummary] = React.useState<CoOwnPortfolioSummary>({
    totalValueGbp: 0,
    totalUnits: 0,
    totalUnrealizedGbp: 0,
    totalRealizedGbp: 0,
    positionCount: 0,
    totalDistributionsGbp: 0,
    todayChangeGbp: 0,
    todayChangePct: 0,
    todayChangeTimestamp: '',
    staleMarkCount: 0,
  });
  const [isLoading, setIsLoading] = React.useState(true);
  const [isError, setIsError] = React.useState(false);
  const [refreshing, setRefreshing] = React.useState(false);
  const [actionSheetAsset, setActionSheetAsset] = React.useState<CoOwnPositionVM | null>(null);
  const [allocationExpanded, setAllocationExpanded] = React.useState(false);
  const [activePortfolioTab, setActivePortfolioTab] = React.useState<'positions' | 'insights'>('positions');

  const loadPortfolio = React.useCallback((mode: 'initial' | 'refresh' = 'initial') => {
    if (!currentUser?.id) {
      setIsLoading(false);
      setRefreshing(false);
      return;
    }
    let cancelled = false;
    if (mode === 'refresh') setRefreshing(true);
    else setIsLoading(true);
    setIsError(false);

    fetchCoOwnPortfolioPositions(currentUser.id, listings)
      .then((result) => {
        if (cancelled) return;
        setPositions(result.positions);
        setSummary(result.summary);
      })
      .catch((err) => {
        if (cancelled) return;
        const parsed = parseApiError(err, 'Unable to load portfolio');
        show(parsed.message, 'error');
        setIsError(true);
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
          setRefreshing(false);
        }
      });

    return () => { cancelled = true; };
  }, [currentUser?.id, show, listings]);

  React.useEffect(() => {
    const cleanup = loadPortfolio();
    return cleanup;
  }, [loadPortfolio]);

  const handleRefresh = React.useCallback(() => {
    loadPortfolio('refresh');
  }, [loadPortfolio]);

  const handleBack = React.useCallback(() => {
    if (navigation.canGoBack()) { navigation.goBack(); return; }
    navigation.navigate('CoOwnHub');
  }, [navigation]);

  // Phase 3: derived summary values with defaults (fields are optional from the service)
  const todayChangeGbp = summary.todayChangeGbp ?? 0;
  const todayChangePct = summary.todayChangePct ?? 0;
  const totalDistributionsGbp = summary.totalDistributionsGbp ?? 0;
  const staleMarkCount = summary.staleMarkCount ?? 0;

  // Total cost basis — sum of avgEntryPrice * unitsOwned across all positions.
  // Used by the performance chart to show cost basis vs current value.
  const totalCostBasisGbp = React.useMemo(
    () => positions.reduce((sum, p) => sum + p.avgEntryPriceGbp * p.unitsOwned, 0),
    [positions],
  );

  // Allocation bars — only when real positions exist
  const allocationBars = React.useMemo(() => {
    if (positions.length === 0 || summary.totalValueGbp <= 0) return [];
    return positions.map((p) => ({
      id: p.assetId,
      ratio: (p.unitsOwned * p.unitPriceGbp) / summary.totalValueGbp,
      title: p.title,
    }));
  }, [positions, summary.totalValueGbp]);

  // Issuer concentration bands — privacy-safe (spec 06 §1.2)
  // Groups positions by issuer, computes concentration %, rounds to 5% bands.
  // Never names the issuer — shows "Top issuer", "2nd issuer", etc.
  const issuerBands = React.useMemo(() => {
    if (positions.length === 0 || summary.totalValueGbp <= 0) return [];
    const byIssuer = new Map<string, number>();
    for (const p of positions) {
      const value = p.unitsOwned * p.unitPriceGbp;
      byIssuer.set(p.issuerId, (byIssuer.get(p.issuerId) ?? 0) + value);
    }
    const sorted = [...byIssuer.entries()].sort((a, b) => b[1] - a[1]);
    const ORDINALS = ['Top', '2nd', '3rd', '4th', '5th'];
    return sorted.slice(0, 5).map(([_, value], i) => {
      const pct = (value / summary.totalValueGbp) * 100;
      const bandLow = Math.floor(pct / 5) * 5;
      const bandHigh = bandLow + 5;
      return {
        id: `issuer-${i}`,
        label: `${ORDINALS[i] ?? `${i + 1}th`} issuer`,
        band: `${bandLow}–${bandHigh}%`,
        ratio: value / summary.totalValueGbp,
      };
    });
  }, [positions, summary.totalValueGbp]);

  // By class allocation — groups positions by asset category (spec 06 §1.2)
  const classBars = React.useMemo(() => {
    if (positions.length === 0 || summary.totalValueGbp <= 0) return [];
    const byClass = new Map<string, number>();
    for (const p of positions) {
      const cls = p.category ?? 'Other';
      const value = p.unitsOwned * p.unitPriceGbp;
      byClass.set(cls, (byClass.get(cls) ?? 0) + value);
    }
    return [...byClass.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([cls, value]) => ({
        id: `class-${cls}`,
        label: cls.charAt(0).toUpperCase() + cls.slice(1),
        ratio: value / summary.totalValueGbp,
      }));
  }, [positions, summary.totalValueGbp]);

  // Best / worst performer — derived from unrealized P&L percentage
  const performers = React.useMemo(() => {
    if (positions.length === 0) return { best: null as CoOwnPositionVM | null, worst: null as CoOwnPositionVM | null };
    const withPct = positions
      .filter((p) => p.avgEntryPriceGbp > 0)
      .map((p) => ({ p, pct: p.unrealizedPnlGbp / (p.avgEntryPriceGbp * p.unitsOwned) }));
    if (withPct.length === 0) return { best: null, worst: null };
    const sorted = [...withPct].sort((a, b) => b.pct - a.pct);
    return {
      best: sorted[0].pct !== 0 ? sorted[0].p : null,
      worst: sorted[sorted.length - 1].pct !== 0 ? sorted[sorted.length - 1].p : null,
    };
  }, [positions]);

  const formatPositionStatus = (p: CoOwnPositionVM): 'open' | 'closed' | 'paused' => {
    if (!p.isOpen) return 'closed';
    return p.availableUnits > 0 ? 'open' : 'closed';
  };

  const handlePositionPress = React.useCallback((p: CoOwnPositionVM) => {
    navigation.navigate('AssetDetail', { assetId: p.assetId });
  }, [navigation]);

  const handleBuyMore = React.useCallback((p: CoOwnPositionVM) => {
    haptics.tap();
    navigation.navigate('Trade', { assetId: p.assetId, side: 'buy' });
  }, [navigation]);

  const handleSell = React.useCallback((p: CoOwnPositionVM) => {
    haptics.tap();
    navigation.navigate('Trade', { assetId: p.assetId, side: 'sell' });
  }, [navigation]);

  const handleOpenActions = React.useCallback((p: CoOwnPositionVM) => {
    haptics.tap();
    setActionSheetAsset(p);
  }, []);

  const actionSheetActions: CoOwnPositionAction[] = React.useMemo(() => {
    if (!actionSheetAsset) return [];
    const p = actionSheetAsset;
    const actions: CoOwnPositionAction[] = [
      {
        label: 'View item details',
        icon: 'cube-outline',
        onPress: () => navigation.navigate('AssetDetail', { assetId: p.assetId }),
        variant: 'primary',
      },
      {
        label: 'Buy more units',
        icon: 'add-circle-outline',
        onPress: () => navigation.navigate('Trade', { assetId: p.assetId, side: 'buy' }),
      },
    ];
    if (p.sellableUnits > 0) {
      actions.push({
        label: 'Sell units',
        icon: 'swap-horizontal-outline',
        onPress: () => navigation.navigate('Trade', { assetId: p.assetId, side: 'sell' }),
        variant: 'secondary',
      });
      actions.push({
        label: 'Request buyout',
        icon: 'exit-outline',
        onPress: () => navigation.navigate('Buyout', { assetId: p.assetId }),
      });
    }
    actions.push({
      label: 'View order history',
      icon: 'receipt-outline',
      onPress: () => navigation.navigate('CoOwnOrderHistory'),
    });
    actions.push({
      label: 'Distribution history',
      icon: 'cash-outline',
      onPress: () => navigation.navigate('DistributionHistory', { assetId: p.assetId }),
    });
    return actions;
  }, [actionSheetAsset, navigation]);

  const renderPosition = ({ item, index }: { item: CoOwnPositionVM; index: number }) => {
    return (
      <CoOwnPositionCard
        imageUri={item.imageUrl}
        title={item.title}
        unitsOwned={item.unitsOwned}
        totalUnits={item.totalUnits}
        ownershipPct={item.ownershipPct}
        currentValueLabel={formatFromFiat(item.currentValueGbp, currencyCode)}
        avgEntryLabel={formatFromFiat(item.avgEntryPriceGbp, currencyCode)}
        unrealizedLabel={item.unrealizedPnlGbp >= 0
          ? `+${formatFromFiat(Math.abs(item.unrealizedPnlGbp), currencyCode)}`
          : `-${formatFromFiat(Math.abs(item.unrealizedPnlGbp), currencyCode)}`
        }
        realizedLabel={item.realizedPnlGbp !== 0
          ? (item.realizedPnlGbp >= 0
            ? `+${formatFromFiat(Math.abs(item.realizedPnlGbp), currencyCode)}`
            : `-${formatFromFiat(Math.abs(item.realizedPnlGbp), currencyCode)}`)
          : undefined
        }
        status={formatPositionStatus(item)}
        sellable={item.sellableUnits > 0}
        onPress={() => handlePositionPress(item)}
        onBuyMore={() => handleBuyMore(item)}
        onSell={() => handleSell(item)}
        index={index}
        positionState={item.positionState}
        settlementState={item.settlementState}
      />
    );
  };

  // ── Loading state ──
  if (isLoading && positions.length === 0) {
    return (
      <FlagshipScreen
        header={
          <FlagshipHeader
            title="Portfolio"
            subtitle="Your Co-Own positions"
            onBack={handleBack}
            rightAction={
              <AnimatedPressable
                onPress={() => navigation.navigate('CoOwnOrderHistory')}
                scaleValue={0.9}
                hapticFeedback="light"
                accessibilityRole="button"
                accessibilityLabel="Activity"
                accessibilityHint="View order history"
              >
                <Ionicons name="receipt-outline" size={22} color={colors.textPrimary} />
              </AnimatedPressable>
            }
          />
        }
        scrollEnabled={false}
        contentStyle={{ paddingHorizontal: 0, paddingTop: 0 }}
      >
        <CoOwnPortfolioSkeleton />
      </FlagshipScreen>
    );
  }

  // ── Error state ──
  if (isError && positions.length === 0) {
    return (
      <FlagshipScreen
        header={
          <FlagshipHeader
            title="Portfolio"
            subtitle="Your Co-Own positions"
            onBack={handleBack}
            rightAction={
              <AnimatedPressable
                onPress={() => navigation.navigate('CoOwnOrderHistory')}
                scaleValue={0.9}
                hapticFeedback="light"
                accessibilityRole="button"
                accessibilityLabel="Activity"
                accessibilityHint="View order history"
              >
                <Ionicons name="receipt-outline" size={22} color={colors.textPrimary} />
              </AnimatedPressable>
            }
          />
        }
        scrollEnabled={false}
        contentStyle={{ paddingHorizontal: 0, paddingTop: 0 }}
      >
        <CoOwnStateCanvas
          variant="error"
          actionLabel="Try again"
          onAction={() => loadPortfolio()}
        />
      </FlagshipScreen>
    );
  }

  // ── Empty state ──
  if (positions.length === 0) {
    return (
      <FlagshipScreen
        header={
          <FlagshipHeader
            title="Portfolio"
            subtitle="Your Co-Own positions"
            onBack={handleBack}
            rightAction={
              <AnimatedPressable
                onPress={() => navigation.navigate('CoOwnOrderHistory')}
                scaleValue={0.9}
                hapticFeedback="light"
                accessibilityRole="button"
                accessibilityLabel="Activity"
                accessibilityHint="View order history"
              >
                <Ionicons name="receipt-outline" size={22} color={colors.textPrimary} />
              </AnimatedPressable>
            }
          />
        }
        scrollEnabled={false}
        contentStyle={{ paddingHorizontal: 0, paddingTop: 0 }}
      >
        <CoOwnStateCanvas
          variant="empty"
          title="No positions yet"
          subtitle="Your Co-Own portfolio will appear here once you purchase units."
          actionLabel="Browse items"
          onAction={() => navigation.navigate('CoOwnHub')}
          emptyGraphicVariant="bag"
        />
      </FlagshipScreen>
    );
  }

  return (
    <FlagshipScreen
      testID="portfolio-screen"
      header={
        <FlagshipHeader
          title="Portfolio"
          subtitle="Your Co-Own positions"
          onBack={handleBack}
          rightAction={
            <AnimatedPressable
              onPress={() => navigation.navigate('CoOwnOrderHistory')}
              scaleValue={0.9}
              hapticFeedback="light"
              accessibilityRole="button"
              accessibilityLabel="Activity"
              accessibilityHint="View order history"
            >
              <Ionicons name="receipt-outline" size={22} color={colors.textPrimary} />
            </AnimatedPressable>
          }
        />
      }
      scrollEnabled={false}
      contentStyle={{ paddingHorizontal: 0, paddingTop: 0 }}
    >
      <CoOwnOfflineBanner isOffline={isOffline} />
      <CoOwnReconciliationBanner isActive={false} />

      <FlashList
        data={activePortfolioTab === 'positions' ? positions : []}
        keyExtractor={(item) => item.assetId}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.textSecondary}
          />
        }
        ListHeaderComponent={
          <View>
            {/* Portfolio summary — ownership surface, not a finance dashboard */}
            <View style={[styles.summaryCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.summaryLabel, { color: colors.textMuted }]}>Portfolio value</Text>
              <CoOwnNumericText
                value={summary.totalValueGbp}
                unit="1ZE"
                size="priceLarge"
                align="left"
                showUnit={false}
                color={colors.textPrimary}
              />

              {/* Phase 3: today's change with timestamp */}
              {todayChangeGbp !== 0 && (
                <View style={styles.todayChangeRow}>
                  <CoOwnNumericText
                    value={todayChangeGbp}
                    unit="1ZE"
                    size="price"
                    signed
                    showUnit={false}
                    showGlyph={false}
                    color={todayChangeGbp >= 0 ? colors.success : colors.danger}
                  />
                  <Text style={[styles.todayChangePct, { color: todayChangeGbp >= 0 ? colors.success : colors.danger }]}>
                    ({todayChangeGbp >= 0 ? '+' : ''}{todayChangePct.toFixed(2)}%)
                  </Text>
                  <Ionicons
                    name={todayChangeGbp >= 0 ? 'arrow-up' : 'arrow-down'}
                    size={12}
                    color={todayChangeGbp >= 0 ? colors.success : colors.danger}
                  />
                  {summary.todayChangeTimestamp ? (
                    <Text style={[styles.todayChangeTime, { color: colors.textMuted }]} numberOfLines={1}>
                      · as of {summary.todayChangeTimestamp}
                    </Text>
                  ) : null}
                </View>
              )}

              {/* Phase 3: 4-tile summary — total return / unrealised / realised / distributions */}
              <View style={[styles.summaryStats, { borderColor: colors.border }]}>
                <View style={styles.summaryStat}>
                  <Text style={[styles.summaryStatLabel, { color: colors.textMuted }]} numberOfLines={1}>Total return</Text>
                  <CoOwnNumericText
                    value={summary.totalUnrealizedGbp + summary.totalRealizedGbp}
                    unit="1ZE"
                    size="priceList"
                    signed
                    showUnit={false}
                    showGlyph={false}
                    color={(summary.totalUnrealizedGbp + summary.totalRealizedGbp) >= 0 ? colors.success : colors.danger}
                  />
                </View>
                <View style={[styles.summaryStat, { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: colors.border }]}>
                  <Text style={[styles.summaryStatLabel, { color: colors.textMuted }]} numberOfLines={1}>Unrealised</Text>
                  <CoOwnNumericText
                    value={summary.totalUnrealizedGbp}
                    unit="1ZE"
                    size="priceList"
                    signed
                    showUnit={false}
                    showGlyph={false}
                    color={summary.totalUnrealizedGbp >= 0 ? colors.success : colors.danger}
                  />
                </View>
                <View style={[styles.summaryStat, { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: colors.border }]}>
                  <Text style={[styles.summaryStatLabel, { color: colors.textMuted }]} numberOfLines={1}>Realised</Text>
                  <CoOwnNumericText
                    value={summary.totalRealizedGbp}
                    unit="1ZE"
                    size="priceList"
                    signed
                    showUnit={false}
                    showGlyph={false}
                    color={summary.totalRealizedGbp >= 0 ? colors.success : colors.danger}
                  />
                </View>
                <View style={[styles.summaryStat, { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: colors.border }]}>
                  <Text style={[styles.summaryStatLabel, { color: colors.textMuted }]} numberOfLines={1}>Distrib.</Text>
                  <CoOwnNumericText
                    value={totalDistributionsGbp}
                    unit="1ZE"
                    size="priceList"
                    signed
                    showUnit={false}
                    showGlyph={false}
                    color={totalDistributionsGbp >= 0 ? colors.success : colors.danger}
                  />
                </View>
              </View>

              {/* Phase 3: data-quality note — only when true */}
              {staleMarkCount > 0 && (
                <View style={[styles.dataQualityNote, { backgroundColor: colors.warningSubtle }]}>
                  <Ionicons name="time-outline" size={12} color={colors.warning} />
                  <Text style={[styles.dataQualityText, { color: colors.warning }]} numberOfLines={2}>
                    Data quality: {staleMarkCount} {staleMarkCount === 1 ? 'position has' : 'positions have'} stale marks ({'>'}24h)
                  </Text>
                </View>
              )}
            </View>

            {/* Portfolio performance chart — flat canvas, no card chrome.
                Shows cost-basis accumulation over time and current mark value.
                Only rendered when there are positions with cost basis. */}
            {totalCostBasisGbp > 0 && (
              <CoOwnPortfolioPerformanceChart
                positions={positions}
                totalValueGbp={summary.totalValueGbp}
                totalCostBasisGbp={totalCostBasisGbp}
              />
            )}

            {/* Tab toggle — Positions (default) vs Insights.
                Positions shows holdings immediately; Insights moves allocations,
                P&L decomposition, performers and storytelling to a separate tab. */}
            <View style={[styles.portfolioTabRow, { borderColor: colors.border }]}>
              <Pressable
                onPress={() => { haptics.selection(); setActivePortfolioTab('positions'); }}
                style={({ pressed }) => [styles.portfolioTab, activePortfolioTab === 'positions' && { borderBottomColor: colors.textPrimary }, pressed && { opacity: 0.7 }]}
                accessibilityRole="tab"
                accessibilityLabel="Positions tab"
                accessibilityState={{ selected: activePortfolioTab === 'positions' }}
              >
                <Text style={[
                  styles.portfolioTabText,
                  {
                    color: activePortfolioTab === 'positions' ? colors.textPrimary : colors.textSecondary,
                    fontFamily: activePortfolioTab === 'positions' ? FontFamily.semibold : FontFamily.regular,
                  },
                ]}>
                  Positions
                </Text>
              </Pressable>
              <Pressable
                onPress={() => { haptics.selection(); setActivePortfolioTab('insights'); }}
                style={({ pressed }) => [styles.portfolioTab, activePortfolioTab === 'insights' && { borderBottomColor: colors.textPrimary }, pressed && { opacity: 0.7 }]}
                accessibilityRole="tab"
                accessibilityLabel="Insights tab"
                accessibilityState={{ selected: activePortfolioTab === 'insights' }}
              >
                <Text style={[
                  styles.portfolioTabText,
                  {
                    color: activePortfolioTab === 'insights' ? colors.textPrimary : colors.textSecondary,
                    fontFamily: activePortfolioTab === 'insights' ? FontFamily.semibold : FontFamily.regular,
                  },
                ]}>
                  Insights
                </Text>
              </Pressable>
            </View>

            {/* ── Insights tab ──
                Allocations, P&L decomposition, performers, realised returns,
                storytelling and watchlist — moved here from the default view
                to keep the Positions tab calm and focused. */}
            {activePortfolioTab === 'insights' && (
            <>
            {/* Position insight — calm, factual summary replacing gamification.
                Shows the best and worst positions by unrealized P&L without
                "TOP PERFORMER" / "LAGGING" labels that gamify holding. */}
            {(performers.best || performers.worst) && (
              <View style={[styles.insightCard, { borderBottomColor: colors.border }]}>
                {performers.best && performers.best.avgEntryPriceGbp > 0 && (
                  <Pressable
                    style={({ pressed }) => [styles.insightRow, pressed && { opacity: 0.7 }]}
                    onPress={() => handlePositionPress(performers.best!)}
                    accessibilityRole="button"
                    accessibilityLabel={`Best position: ${performers.best.title}`}
                  >
                    <Ionicons name="arrow-up-outline" size={14} color={colors.success} />
                    <Text style={[styles.insightLabel, { color: colors.textMuted }]} numberOfLines={1}>
                      Best position
                    </Text>
                    <Text style={[styles.insightTitle, { color: colors.textPrimary }]} numberOfLines={1}>
                      {performers.best.title}
                    </Text>
                    <CoOwnNumericText
                      value={(performers.best.unrealizedPnlGbp / (performers.best.avgEntryPriceGbp * performers.best.unitsOwned)) * 100}
                      unit="pct"
                      size="mono"
                      signed
                      showGlyph={false}
                      color={colors.success}
                    />
                  </Pressable>
                )}
                {performers.worst && performers.worst.avgEntryPriceGbp > 0 && performers.worst.assetId !== performers.best?.assetId && (
                  <Pressable
                    style={({ pressed }) => [styles.insightRow, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }, pressed && { opacity: 0.7 }]}
                    onPress={() => handlePositionPress(performers.worst!)}
                    accessibilityRole="button"
                    accessibilityLabel={`Worst position: ${performers.worst.title}`}
                  >
                    <Ionicons name="arrow-down-outline" size={14} color={colors.danger} />
                    <Text style={[styles.insightLabel, { color: colors.textMuted }]} numberOfLines={1}>
                      Worst position
                    </Text>
                    <Text style={[styles.insightTitle, { color: colors.textPrimary }]} numberOfLines={1}>
                      {performers.worst.title}
                    </Text>
                    <CoOwnNumericText
                      value={(performers.worst.unrealizedPnlGbp / (performers.worst.avgEntryPriceGbp * performers.worst.unitsOwned)) * 100}
                      unit="pct"
                      size="mono"
                      signed
                      showGlyph={false}
                      color={colors.danger}
                    />
                  </Pressable>
                )}
              </View>
            )}

            {/* Allocation breakdowns — collapsible for progressive disclosure.
                Collapsed by default to calm the screen; expands on tap. */}
            {allocationBars.length > 0 && (
              <View style={[styles.allocationCard, { borderBottomColor: colors.border }]}>
                <Pressable
                  style={({ pressed }) => [styles.allocationHeader, pressed && { opacity: 0.7 }]}
                  onPress={() => setAllocationExpanded((prev) => !prev)}
                  accessibilityRole="button"
                  accessibilityLabel={allocationExpanded ? 'Collapse allocation breakdown' : 'Expand allocation breakdown'}
                  accessibilityState={{ expanded: allocationExpanded }}
                >
                  <View>
                    <Text style={[styles.allocationTitle, { color: colors.textPrimary }]}>Allocation</Text>
                    <Text style={[styles.allocationSubtitle, { color: colors.textMuted }]} numberOfLines={1}>
                      {allocationBars.length} {allocationBars.length === 1 ? 'asset' : 'assets'}
                      {classBars.length > 0 ? ` · ${classBars.length} ${classBars.length === 1 ? 'class' : 'classes'}` : ''}
                    </Text>
                  </View>
                  <Ionicons
                    name={allocationExpanded ? 'chevron-up-outline' : 'chevron-down-outline'}
                    size={18}
                    color={colors.textSecondary}
                  />
                </Pressable>
                {allocationExpanded && (
                  <>
                    <Text style={[styles.allocationSubtitle, { color: colors.textMuted }]}>By asset</Text>
                    <View style={styles.barsContainer}>
                      {allocationBars.map((bar) => (
                        <View key={bar.id} style={styles.barItem}>
                          <View style={styles.barHeader}>
                            <Text style={[styles.barLabel, { color: colors.textSecondary }]} numberOfLines={1}>{bar.title}</Text>
                            <CoOwnNumericText
                              value={bar.ratio * 100}
                              unit="pct"
                              size="mono"
                              showUnit={false}
                              color={colors.textMuted}
                            />
                          </View>
                          <View style={[styles.barTrack, { backgroundColor: colors.surfaceAlt }]}>
                            <View style={[styles.barFill, { width: `${bar.ratio * 100}%`, backgroundColor: colors.brand }]} />
                          </View>
                        </View>
                      ))}
                    </View>

                    {/* By class allocation — spec 06 §1.2 */}
                    {classBars.length > 0 && (
                      <View style={[styles.issuerSection, { borderTopColor: colors.border }]}>
                        <Text style={[styles.allocationSubtitle, { color: colors.textMuted }]}>By class</Text>
                        <View style={styles.barsContainer}>
                          {classBars.map((bar) => (
                            <View key={bar.id} style={styles.barItem}>
                              <View style={styles.barHeader}>
                                <Text style={[styles.barLabel, { color: colors.textSecondary }]} numberOfLines={1}>{bar.label}</Text>
                                <CoOwnNumericText
                                  value={bar.ratio * 100}
                                  unit="pct"
                                  size="mono"
                                  showUnit={false}
                                  color={colors.textMuted}
                                />
                              </View>
                              <View style={[styles.barTrack, { backgroundColor: colors.surfaceAlt }]}>
                                <View style={[styles.barFill, { width: `${bar.ratio * 100}%`, backgroundColor: colors.textSecondary }]} />
                              </View>
                            </View>
                          ))}
                        </View>
                      </View>
                    )}

                    {/* Issuer concentration bands — privacy-safe (spec 06 §1.2) */}
                    {issuerBands.length > 1 && (
                      <View style={[styles.issuerSection, { borderTopColor: colors.border }]}>
                        <Text style={[styles.allocationSubtitle, { color: colors.textMuted }]}>By issuer concentration</Text>
                        <View style={styles.barsContainer}>
                          {issuerBands.map((band) => (
                            <View key={band.id} style={styles.barItem}>
                              <View style={styles.barHeader}>
                                <Text style={[styles.barLabel, { color: colors.textSecondary }]} numberOfLines={1}>
                                  {band.label}
                                </Text>
                                <Text style={[styles.barPct, { color: colors.textMuted }]}>{band.band}</Text>
                              </View>
                              <View style={[styles.barTrack, { backgroundColor: colors.surfaceAlt }]}>
                                <View style={[styles.barFill, { width: `${band.ratio * 100}%`, backgroundColor: colors.textSecondary }]} />
                              </View>
                            </View>
                          ))}
                        </View>
                      </View>
                    )}
                  </>
                )}
              </View>
            )}

            {/* Realised returns — income surface from closed positions */}
            {summary.totalRealizedGbp !== 0 && (
              <View style={[styles.realisedCard, { borderBottomColor: colors.border }]}>
                <View style={styles.realisedHeader}>
                  <View style={[styles.realisedIcon, { backgroundColor: `${summary.totalRealizedGbp >= 0 ? colors.success : colors.danger}15` }]}>
                    <Ionicons
                      name={summary.totalRealizedGbp >= 0 ? 'arrow-up-circle-outline' : 'arrow-down-circle-outline'}
                      size={15}
                      color={summary.totalRealizedGbp >= 0 ? colors.success : colors.danger}
                    />
                  </View>
                  <View style={styles.realisedHeaderText}>
                    <Text style={[styles.realisedLabel, { color: colors.textMuted }]}>Realised returns</Text>
                    <Text style={[styles.realisedCaption, { color: colors.textSecondary }]}>
                      From closed positions
                    </Text>
                  </View>
                  <CoOwnNumericText
                    value={summary.totalRealizedGbp}
                    unit="1ZE"
                    size="price"
                    signed
                    showUnit={false}
                    showGlyph={false}
                    color={summary.totalRealizedGbp >= 0 ? colors.success : colors.danger}
                  />
                </View>
              </View>
            )}

            {/* Phase 6: Portfolio storytelling — premium of last/NAV explanation */}
            {performers.best && performers.best.avgEntryPriceGbp > 0 && (
              <CoOwnPortfolioStorytelling
                premiumPct={null}
                lastPriceLabel={formatFromFiat(performers.best.currentValueGbp / performers.best.unitsOwned, currencyCode)}
                markSourceLabel="Last trade"
                markAgeLabel={undefined}
              />
            )}

            {/* Watchlist summary */}
            {coOwnWatchlist.length > 0 && (
              <AnimatedPressable
                style={[styles.watchlistRow, { borderBottomColor: colors.border }]}
                onPress={() => navigation.navigate('CoOwnHub', { initialSegment: 'watchlist' })}
                accessibilityRole="button"
                accessibilityLabel={`Open watchlist with ${coOwnWatchlist.length} watched assets`}
                scaleValue={0.98}
                hapticFeedback="light"
              >
                <View style={[styles.watchlistIcon, { backgroundColor: `${colors.brand}15` }]}>
                  <Ionicons name="eye-outline" size={15} color={colors.brand} />
                </View>
                <View style={styles.watchlistBody}>
                  <Text style={[styles.watchlistTitle, { color: colors.textPrimary }]}>Watchlist</Text>
                  <Text style={[styles.watchlistSub, { color: colors.textSecondary }]} numberOfLines={1}>
                    {coOwnWatchlist.length} {coOwnWatchlist.length === 1 ? 'asset' : 'assets'} on your radar
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={15} color={colors.textMuted} />
              </AnimatedPressable>
            )}

            {/* Ownership rights — what Co-Own entitles */}
            <View style={[styles.rightsCard, { borderBottomColor: colors.border }]}>
              <View style={styles.rightsHeader}>
                <Ionicons name="document-text-outline" size={14} color={colors.textSecondary} />
                <Text style={[styles.rightsTitle, { color: colors.textPrimary }]}>Rights are instrument-specific</Text>
              </View>
              <Text style={[styles.rightsText, { color: colors.textSecondary }]}>Open a position to review its current rights version, safeguarding arrangements, transfer limits and available exit routes.</Text>
            </View>
            </>
            )}

            {/* ── Positions tab ──
                Positions list shows immediately after the summary when the
                Positions tab is active. No insights chrome above it. */}
            {activePortfolioTab === 'positions' && (
            <>
            {/* Section header */}
            <View style={styles.sectionRow}>
              <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Your positions</Text>
              <View style={styles.sectionActions}>
                <AnimatedPressable
                  onPress={() => navigation.navigate('DistributionHistory', {})}
                  accessibilityRole="button"
                  accessibilityLabel="View distribution history"
                  scaleValue={0.96}
                  hapticFeedback="light"
                >
                  <Text style={[styles.sectionLink, { color: colors.textSecondary }]}>Distributions</Text>
                </AnimatedPressable>
                <AnimatedPressable
                  onPress={() => navigation.navigate('AssetLeaderboard')}
                  accessibilityRole="button"
                  accessibilityLabel="Open market overview"
                  scaleValue={0.96}
                  hapticFeedback="light"
                >
                  <Text style={[styles.sectionLink, { color: colors.textSecondary }]}>Market overview</Text>
                </AnimatedPressable>
              </View>
            </View>
            </>
            )}
          </View>
        }
        renderItem={renderPosition}
        ListFooterComponent={<View style={{ height: Space.xxl }} />}
      />

      {/* Position action sheet */}
      <CoOwnPositionActionSheet
        visible={actionSheetAsset != null}
        onClose={() => setActionSheetAsset(null)}
        imageUri={actionSheetAsset?.imageUrl ?? null}
        title={actionSheetAsset?.title ?? ''}
        unitsOwned={actionSheetAsset?.unitsOwned ?? 0}
        ownershipPct={actionSheetAsset?.ownershipPct ?? 0}
        currentValueLabel={actionSheetAsset ? formatFromFiat(actionSheetAsset.currentValueGbp, currencyCode) : ''}
        statusLabel={actionSheetAsset ? (actionSheetAsset.isOpen ? 'Active' : 'Closed') : ''}
        actions={actionSheetActions}
      />
    </FlagshipScreen>
  );
}

const styles = StyleSheet.create({
  listContent: {
    paddingHorizontal: Space.md,
  },
  // ── Portfolio summary — the one dominant panel above the fold ──
  // Per AGENTS.md §4 surface budget: one dominant non-media panel is allowed.
  // Calm financial presentation: flat canvas, hairline border, generous padding.
  // 24pt section spacing after the card (Space.lg).
  summaryCard: {
    borderRadius: RadiusRoleValue.sheetDialog,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: Space.lg,
    paddingHorizontal: Space.lg,
    gap: Space.sm,
    marginBottom: Space.lg,
  },
  // Label uses captionElevated per Design.md financial UI spec — quiet,
  // professional, not competing with the value below.
  summaryLabel: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: FontFamily.regular,
    letterSpacing: TypographyV2.meta.letterSpacing,
  },
  summaryValue: {
    fontSize: Numeric.priceLarge.size,
    lineHeight: Numeric.priceLarge.lineHeight,
    fontFamily: FontFamily.bold,
    letterSpacing: Numeric.priceLarge.letterSpacing,
    fontVariant: ['tabular-nums'] as ['tabular-nums'],
  },
  // ── 4-tile summary stats — total return / unrealised / realised / distrib.
  // Per Design.md: 12-16pt between data rows. Each stat has Space.sm (8px)
  // horizontal padding for breathing room. Labels use metaElevated (11/14/600)
  // for quiet hierarchy that doesn't compete with the numeric values.
  // Values use Numeric.priceList (20/24/700) with tabular-nums for stable
  // column alignment — per spec 11_COOWN: "Monetary and unit quantities
  // never change width erratically."
  summaryStats: {
    flexDirection: 'row',
    paddingTop: Space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  summaryStat: {
    flex: 1,
    paddingHorizontal: Space.sm,
    alignItems: 'center',
    gap: Space.xs,
  },
  summaryStatLabel: {
    fontSize: TypographyV2.label.size,
    lineHeight: TypographyV2.label.lineHeight,
    fontFamily: FontFamily.semibold,
    letterSpacing: TypographyV2.label.letterSpacing,
    textTransform: 'uppercase',
  },
  summaryStatValue: {
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: FontFamily.bold,
    fontVariant: ['tabular-nums'] as ['tabular-nums'],
  },
  // ── Allocation card — calm, professional breakdown ──
  // Per spec 11_COOWN: 24pt between sections. Hairline separator, no card
  // chrome — flat canvas with spacing communicates relationship.
  allocationCard: {
    paddingVertical: Space.lg,
    gap: Space.sm,
    marginBottom: Space.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  // ── Portfolio tab toggle — calm, professional segment control ──
  // Per Design.md: 2-3px underline indicator in colors.brand/textPrimary.
  // Tab text uses bodyEmphasis (15/21/600) for clear hierarchy.
  portfolioTabRow: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
    marginBottom: Space.lg,
    marginTop: Space.lg,
  },
  portfolioTab: {
    paddingVertical: Space.sm + 2,
    paddingHorizontal: Space.md,
    borderBottomWidth: Stroke.emphasis,
    borderBottomColor: 'transparent',
    marginRight: Space.sm,
  },
  portfolioTabText: {
    fontSize: TypographyV2.bodyStrong.size,
    lineHeight: TypographyV2.bodyStrong.lineHeight,
    fontFamily: FontFamily.regular,
    letterSpacing: TypographyV2.bodyStrong.letterSpacing,
  },
  // ── Position insight (calm replacement for gamification cards) ──
  // ── Position insight — calm, factual summary ──
  // 24pt section spacing. Hairline separator, no card chrome.
  // Per spec 11_COOWN: "Remove any gamified elements."
  insightCard: {
    marginBottom: Space.lg,
    overflow: 'hidden',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  insightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingVertical: Space.md,
    paddingHorizontal: Space.md,
  },
  // Insight label uses captionElevated for quiet readability.
  insightLabel: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: FontFamily.regular,
    letterSpacing: TypographyV2.meta.letterSpacing,
  },
  insightTitle: {
    flex: 1,
    fontSize: TypographyV2.body.size,
    fontFamily: FontFamily.medium,
    letterSpacing: TypographyV2.body.letterSpacing,
    minWidth: 0,
  },
  // Allocation title uses subtitle (17/24/600) — clear section header per
  // Design.md type scale. Subtitle uses captionElevated for quiet metadata.
  allocationTitle: {
    fontSize: TypographyV2.sectionTitle.size,
    lineHeight: TypographyV2.sectionTitle.lineHeight,
    fontFamily: FontFamily.semibold,
    letterSpacing: TypographyV2.sectionTitle.letterSpacing,
  },
  allocationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Space.xs,
  },
  // Allocation subtitle uses captionElevated for quiet metadata.
  allocationSubtitle: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: FontFamily.regular,
    letterSpacing: TypographyV2.meta.letterSpacing,
    marginTop: Space.xs / 2,
    marginBottom: Space.xs,
  },
  // Issuer section — 24pt between groups per spec.
  issuerSection: {
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: Space.lg,
    paddingTop: Space.lg,
  },
  // ── Allocation bars — 12-16pt between data rows per spec ──
  // Bar labels use captionElevated for quiet readability. Bar percentage
  // values use tabular-nums for stable alignment.
  barsContainer: {
    gap: Space.md,
  },
  barItem: {
    gap: Space.xs,
  },
  barHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  barLabel: {
    flex: 1,
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: FontFamily.regular,
    letterSpacing: TypographyV2.meta.letterSpacing,
  },
  barPct: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: FontFamily.semibold,
    fontVariant: ['tabular-nums'] as ['tabular-nums'],
  },
  barTrack: {
    height: Space.xs,
    borderRadius: RadiusRoleValue.compactControl,
    overflow: 'hidden',
  },
  barFill: {
    height: Space.xs,
    borderRadius: RadiusRoleValue.compactControl,
  },
  sectionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Space.sm,
  },
  sectionActions: {
    flexDirection: 'row',
    gap: Space.md,
  },
  // ── Realised returns — calm income surface ──
  // 24pt section spacing. Hairline separator, no card chrome.
  realisedCard: {
    paddingVertical: Space.lg,
    marginBottom: Space.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  realisedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
  },
  realisedIcon: {
    width: Space.xl + Space.xs,
    height: Space.xl + Space.xs,
    borderRadius: RadiusRoleValue.pillAvatar,
    alignItems: 'center',
    justifyContent: 'center',
  },
  realisedHeaderText: {
    flex: 1,
    gap: Space.xs / 2,
  },
  realisedLabel: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: FontFamily.regular,
    letterSpacing: TypographyV2.meta.letterSpacing,
  },
  realisedCaption: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: FontFamily.regular,
    letterSpacing: TypographyV2.meta.letterSpacing,
  },
  realisedAmount: {
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: FontFamily.bold,
    fontVariant: ['tabular-nums'] as ['tabular-nums'],
  },
  // ── Watchlist row — calm navigation, 24pt section spacing ──
  watchlistRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingVertical: Space.lg,
    marginBottom: Space.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  watchlistIcon: {
    width: Space.xl + Space.xs,
    height: Space.xl + Space.xs,
    borderRadius: RadiusRoleValue.pillAvatar,
    alignItems: 'center',
    justifyContent: 'center',
  },
  watchlistBody: {
    flex: 1,
    gap: Space.xs / 2,
  },
  watchlistTitle: {
    fontSize: TypographyV2.bodyStrong.size,
    lineHeight: TypographyV2.bodyStrong.lineHeight,
    fontFamily: FontFamily.semibold,
    letterSpacing: TypographyV2.bodyStrong.letterSpacing,
  },
  watchlistSub: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: FontFamily.regular,
    letterSpacing: TypographyV2.meta.letterSpacing,
  },
  // Section title uses subtitle (17/24/600) — clear section header.
  // Section links use captionElevated for quiet, professional navigation.
  sectionTitle: {
    fontSize: TypographyV2.sectionTitle.size,
    lineHeight: TypographyV2.sectionTitle.lineHeight,
    fontFamily: FontFamily.semibold,
    letterSpacing: TypographyV2.sectionTitle.letterSpacing,
  },
  sectionLink: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: FontFamily.semibold,
    letterSpacing: TypographyV2.meta.letterSpacing,
  },
  // ── Rights card — calm, professional, 24pt section spacing ──
  rightsCard: {
    paddingVertical: Space.lg,
    gap: Space.sm,
    marginBottom: Space.xl,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rightsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
  },
  rightsTitle: {
    fontSize: TypographyV2.bodyStrong.size,
    lineHeight: TypographyV2.bodyStrong.lineHeight,
    fontFamily: FontFamily.semibold,
    letterSpacing: TypographyV2.bodyStrong.letterSpacing,
  },
  rightsList: {
    gap: Space.xs,
  },
  rightsItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
  },
  rightsText: {
    flex: 1,
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight + 2,
    fontFamily: FontFamily.regular,
    letterSpacing: TypographyV2.meta.letterSpacing,
  },
  // ── Today's change row — tabular numerics for stable alignment ──
  // Per spec 11_COOWN: "Monetary and unit quantities never change width
  // erratically." All numeric values use tabular-nums.
  todayChangeRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Space.xs,
    flexWrap: 'wrap',
  },
  todayChangeValue: {
    fontSize: TypographyV2.bodyStrong.size,
    lineHeight: TypographyV2.bodyStrong.lineHeight,
    fontFamily: FontFamily.semibold,
    letterSpacing: TypographyV2.bodyStrong.letterSpacing,
    fontVariant: ['tabular-nums'] as ['tabular-nums'],
  },
  todayChangePct: {
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight,
    fontFamily: FontFamily.medium,
    letterSpacing: TypographyV2.body.letterSpacing,
    fontVariant: ['tabular-nums'] as ['tabular-nums'],
  },
  todayChangeTime: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: FontFamily.regular,
    letterSpacing: TypographyV2.meta.letterSpacing,
    fontVariant: ['tabular-nums'] as ['tabular-nums'],
  },
  // ── Data quality note — calm, professional warning ──
  // Uses warning color with subtle background. Tabular-nums for the count.
  dataQualityNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    paddingHorizontal: Space.sm,
    paddingVertical: Space.sm,
    borderRadius: RadiusRoleValue.compactControl,
    marginTop: Space.sm,
  },
  dataQualityText: {
    flex: 1,
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: FontFamily.regular,
    letterSpacing: TypographyV2.meta.letterSpacing,
    fontVariant: ['tabular-nums'] as ['tabular-nums'],
  },
});
