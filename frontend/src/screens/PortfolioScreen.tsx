import React from 'react';
import { View, RefreshControl, useWindowDimensions } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useAppTheme } from '../theme/ThemeContext';
import { useStore } from '../store/useStore';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { Space } from '../theme/designTokens';
import { FlagshipScreen } from '../components/flagship';
import { CoOwnPositionActionSheet, CoOwnOfflineBanner } from '../components/coown';
import type { CoOwnPositionVM } from '../services/coOwnPortfolio';
import { useConnectivity } from '../hooks/useConnectivity';
import { useScreenCaptureProtection } from '../platform/screenCapture';
import {
  usePortfolioData,
  usePortfolioDerived,
  usePortfolioActions,
  type PortfolioTab,
} from '../hooks/portfolio';
import { portfolioScreenStyles as styles } from '../components/portfolio/portfolioScreenStyles';
import { PortfolioHeader } from '../components/portfolio/PortfolioHeader';
import {
  PortfolioLoadingScreen,
  PortfolioErrorScreen,
  PortfolioPartialErrorScreen,
  PortfolioEmptyScreen,
} from '../components/portfolio/PortfolioStates';
import { PortfolioPartialBanner } from '../components/portfolio/PortfolioPartialBanner';
import { PortfolioSummaryCard } from '../components/portfolio/PortfolioSummaryCard';
import { PortfolioTabBar } from '../components/portfolio/PortfolioTabBar';
import { PortfolioInsightsTab } from '../components/portfolio/PortfolioInsightsTab';
import { PortfolioPositionsHeader } from '../components/portfolio/PortfolioPositionsHeader';
import { PortfolioPositionRow } from '../components/portfolio/PortfolioPositionRow';

export default function PortfolioScreen() {
  useScreenCaptureProtection();
  const { colors } = useAppTheme();
  const coOwnWatchlist = useStore((state) => state.coOwnWatchlist);
  const { formatFromFiat } = useFormattedPrice();
  const { width: screenWidth } = useWindowDimensions();
  const { isOffline } = useConnectivity();

  const {
    positions,
    summary,
    isLoading,
    isError,
    refreshing,
    isPartial,
    loadPortfolio,
    handleRefresh,
  } = usePortfolioData();

  const {
    totalCostBasisGbp,
    allocationBars,
    issuerBands,
    classBars,
    performers,
  } = usePortfolioDerived(positions, summary);

  const {
    handleBack,
    handleOpenActivity,
    handleBrowseItems,
    handleViewDistributions,
    handleOpenMarketOverview,
    handleOpenWatchlist,
    handlePositionPress,
    handleBuyMore,
    handleSell,
    actionSheetAsset,
    closeActionSheet,
    actionSheetActions,
  } = usePortfolioActions();

  const [activePortfolioTab, setActivePortfolioTab] = React.useState<PortfolioTab>('positions');
  const [allocationExpanded, setAllocationExpanded] = React.useState(false);

  const renderPosition = ({ item, index }: { item: CoOwnPositionVM; index: number }) => (
    <PortfolioPositionRow
      item={item}
      index={index}
      formatFromFiat={formatFromFiat}
      onPress={handlePositionPress}
      onBuyMore={handleBuyMore}
      onSell={handleSell}
    />
  );

  // ── Loading state ──
  if (isLoading && positions.length === 0) {
    return (
      <PortfolioLoadingScreen
        onBack={handleBack}
        onOpenActivity={handleOpenActivity}
      />
    );
  }

  // ── Error state ──
  if (isError && positions.length === 0) {
    return (
      <PortfolioErrorScreen
        onBack={handleBack}
        onOpenActivity={handleOpenActivity}
        onRetry={() => loadPortfolio()}
      />
    );
  }

  // ── Partial-failure state ──
  // Holdings were fetched but every asset-detail fetch failed. The user
  // owns something, but we can't value or display it. This is materially
  // different from owning nothing — show a retry, not an empty state.
  if (isPartial && positions.length === 0) {
    return (
      <PortfolioPartialErrorScreen
        onBack={handleBack}
        onOpenActivity={handleOpenActivity}
        onRetry={() => loadPortfolio()}
      />
    );
  }

  // ── Empty state ──
  if (positions.length === 0) {
    return (
      <PortfolioEmptyScreen
        onBack={handleBack}
        onOpenActivity={handleOpenActivity}
        onBrowse={handleBrowseItems}
      />
    );
  }

  return (
    <FlagshipScreen
      testID="portfolio-screen"
      header={<PortfolioHeader onBack={handleBack} onOpenActivity={handleOpenActivity} />}
      scrollEnabled={false}
      contentStyle={{ paddingHorizontal: 0, paddingTop: 0 }}
    >
      <CoOwnOfflineBanner isOffline={isOffline} />

      {isPartial && <PortfolioPartialBanner />}

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
            <PortfolioSummaryCard summary={summary} />

            <PortfolioTabBar activeTab={activePortfolioTab} onSelect={setActivePortfolioTab} />

            {/* ── Insights tab ──
                Allocations, P&L decomposition, performers, realised returns,
                storytelling and watchlist — moved here from the default view
                to keep the Positions tab calm and focused. */}
            {activePortfolioTab === 'insights' && (
              <PortfolioInsightsTab
                summary={summary}
                positions={positions}
                totalCostBasisGbp={totalCostBasisGbp}
                performers={performers}
                allocationBars={allocationBars}
                classBars={classBars}
                issuerBands={issuerBands}
                watchlistCount={coOwnWatchlist.length}
                formatFromFiat={formatFromFiat}
                allocationExpanded={allocationExpanded}
                onToggleAllocation={() => setAllocationExpanded((prev) => !prev)}
                onPositionPress={handlePositionPress}
                onOpenWatchlist={handleOpenWatchlist}
              />
            )}

            {/* ── Positions tab ──
                Positions list shows immediately after the summary when the
                Positions tab is active. No insights chrome above it. */}
            {activePortfolioTab === 'positions' && (
              <PortfolioPositionsHeader
                onViewDistributions={handleViewDistributions}
                onOpenMarketOverview={handleOpenMarketOverview}
              />
            )}
          </View>
        }
        renderItem={renderPosition}
        ListFooterComponent={<View style={{ height: Space.xxl }} />}
      />

      {/* Position action sheet */}
      <CoOwnPositionActionSheet
        visible={actionSheetAsset != null}
        onClose={closeActionSheet}
        imageUri={actionSheetAsset?.imageUrl ?? null}
        title={actionSheetAsset?.title ?? ''}
        unitsOwned={actionSheetAsset?.unitsOwned ?? 0}
        ownershipPct={actionSheetAsset?.ownershipPct ?? 0}
        currentValueLabel={actionSheetAsset ? formatFromFiat(actionSheetAsset.currentValueGbp, 'GBP') : ''}
        statusLabel={actionSheetAsset ? (actionSheetAsset.isOpen ? 'Active' : 'Closed') : ''}
        actions={actionSheetActions}
      />
    </FlagshipScreen>
  );
}
