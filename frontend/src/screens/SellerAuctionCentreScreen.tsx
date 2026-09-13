import React, { useCallback, useMemo } from 'react';
import {
  View,
  RefreshControl,
  StatusBar,
  Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FlashList, type ListRenderItem } from '@shopify/flash-list';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { RootStackParamList } from '../navigation/types';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { useCurrencyContext } from '../context/CurrencyContext';
import { useAppTheme } from '../theme/ThemeContext';
import { AppButton } from '../components/ui/AppButton';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { OfflineBanner } from '../components/OfflineBanner';
import { Space } from '../theme/designTokens';
import {
  SellerAuctionRow,
  SellerAuctionSummary,
  SellerAuctionTabRail,
  SellerAuctionEmptyState,
  SellerAuctionLoadMore } from '../components/auction';
import {
  buildSellerTabs,
  type FlatListItem } from '../components/auction/sellerAuctionCentreViewModels';
import { createSellerAuctionCentreScreenStyles } from '../components/auction/sellerAuctionCentreScreenStyles';
import {
  useSellerAuctionCentreData,
  useSellerAuctionTabScroll } from '../hooks/auction';

type NavT = NativeStackNavigationProp<RootStackParamList>;

export default function SellerAuctionCentreScreen() {
  const navigation = useNavigation<NavT>();
  const { formatFromFiat, currencyCode } = useFormattedPrice();
  const { fxRates } = useCurrencyContext();
  const { colors, isDark } = useAppTheme();
  const styles = useMemo(() => createSellerAuctionCentreScreenStyles(colors), [colors]);
  const insets = useSafeAreaInsets();

  const {
    activeTab,
    setActiveTab,
    stats,
    flatData,
    secondClock,
    loading,
    refreshing,
    error,
    cursor,
    loadingMore,
    fetchAuctions,
    handleRefresh,
    handleLoadMore } = useSellerAuctionCentreData();

  const { listRef, tabScrollRef, tabLayoutsRef, handleTabPress } =
    useSellerAuctionTabScroll(activeTab, setActiveTab);

  const handleBack = useCallback(() => {
    if (navigation.canGoBack()) navigation.goBack();
    else navigation.navigate('AuctionHome');
  }, [navigation]);

  const navigateToDetail = useCallback((auctionId: string) => {
    navigation.navigate('AuctionDetail', { auctionId });
  }, [navigation]);

  const navigateToCreate = useCallback(() => {
    navigation.navigate('CreateAuction');
  }, [navigation]);

  const tabs = useMemo(() => buildSellerTabs(stats), [stats]);

  // Empty / loading / error state — rendered for the 'empty' item in the
  // flattened FlashList data (see flatData). Defined before renderItem because
  // renderItem closes over it.
  const renderEmpty = useCallback(() => (
    <SellerAuctionEmptyState
      loading={loading}
      error={error}
      activeTab={activeTab}
      onRetry={() => void fetchAuctions(false)}
      onCreateAuction={navigateToCreate}
    />
  ), [loading, error, activeTab, fetchAuctions, navigateToCreate]);

  // Tab rail — rendered for the 'header' item in the flattened FlashList data.
  // Kept sticky via `stickyHeaderIndices={[0]}` on FlashList (the header is
  // always the first element of the flattened array).
  const renderSectionHeader = useCallback(() => (
    <SellerAuctionTabRail
      tabs={tabs}
      activeTab={activeTab}
      onTabPress={handleTabPress}
      tabScrollRef={tabScrollRef}
      tabLayoutsRef={tabLayoutsRef}
    />
  ), [tabs, activeTab, handleTabPress, tabScrollRef, tabLayoutsRef]);

  // Distinguishes header items from row items so FlashList can recycle cells
  // by type rather than treating every cell as interchangeable.
  const getItemType = useCallback((item: FlatListItem) => item.type, []);

  // Stable unique keys: headers are keyed by their section title, rows by their
  // underlying auction id (preserving the original SectionList keyExtractor).
  const keyExtractor = useCallback((item: FlatListItem) => {
    if (item.type === 'header') return `header-${item.sectionTitle}`;
    if (item.type === 'empty') return 'empty-state';
    return item.id;
  }, []);

  const renderItem: ListRenderItem<FlatListItem> = useCallback(({ item }) => {
    if (item.type === 'empty') {
      return renderEmpty();
    }
    if (item.type !== 'item') return null;
    return (
      <SellerAuctionRow
        item={item}
        clockMs={secondClock}
        onPress={() => navigateToDetail(item.id)}
        formatFromFiat={formatFromFiat}
        fxRates={fxRates}
        currencyCode={currencyCode}
      />
    );
  }, [renderEmpty, secondClock, navigateToDetail, formatFromFiat, fxRates, currencyCode]);

  const renderSeparator = useCallback(
    ({ leadingItem, trailingItem }: { leadingItem: FlatListItem; trailingItem: FlatListItem }) => {
      if (leadingItem.type !== 'item' || trailingItem.type !== 'item') return null;
      return <View style={styles.rowSeparator} />;
    },
    [styles.rowSeparator],
  );

  // Summary — scrolls away as ListHeaderComponent
  const listHeader = useMemo(() => {
    if (stats.total === 0) return null;
    return (
      <SellerAuctionSummary
        stats={stats}
        formatFromFiat={formatFromFiat}
        fxRates={fxRates}
        currencyCode={currencyCode}
      />
    );
  }, [stats, formatFromFiat, fxRates, currencyCode]);

  // Load-more affordance — previously rendered via SectionList's
  // renderSectionFooter. With a single flattened section FlashList's
  // ListFooterComponent occupies the same position (after all rows).
  const listFooter = useMemo(() => {
    if (!cursor || loading) return null;
    return (
      <SellerAuctionLoadMore
        loadingMore={loadingMore}
        onPress={() => void handleLoadMore()}
      />
    );
  }, [cursor, loading, loadingMore, handleLoadMore]);

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor={colors.background}
      />

      {/* Header — native, deliberate, 44pt touch targets, no filled icon backgrounds */}
      <View style={[styles.header, { paddingTop: insets.top + Space.sm }]}>
        <View style={styles.headerRow}>
          <AnimatedPressable
            onPress={handleBack}
            hitSlop={{ top: 8, bottom: 8, left: 12, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            style={styles.headerIconBtn}
          >
            <Ionicons name="chevron-back" size={26} color={colors.textPrimary} />
          </AnimatedPressable>
          <View style={styles.headerTitleWrap}>
            <Text style={styles.headerTitle} numberOfLines={1}>Your auctions</Text>
            <Text style={styles.headerSubtitle} numberOfLines={1}>
              {stats.total > 0 ? `${stats.total} auctions` : 'Auction listings'}
            </Text>
          </View>
          <AnimatedPressable
            onPress={navigateToCreate}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 12 }}
            accessibilityRole="button"
            accessibilityLabel="Create new auction"
            style={styles.headerIconBtn}
          >
            <Ionicons name="add" size={26} color={colors.textPrimary} />
          </AnimatedPressable>
        </View>
      </View>

      {/* Offline banner */}
      <OfflineBanner onRetry={() => void fetchAuctions(false)} />

      {/* Single authoritative tab selector */}
      {renderSectionHeader()}

      {/* Authoritative virtualised list (FlashList) */}
      <FlashList
        ref={listRef}
        data={flatData}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        getItemType={getItemType}
        ListHeaderComponent={listHeader}
        ListFooterComponent={listFooter}
        ItemSeparatorComponent={renderSeparator}
        contentContainerStyle={[
          styles.listContent,
          stats.total === 0 && !loading && !error && { paddingBottom: 120 + insets.bottom },
        ]}
        showsVerticalScrollIndicator={false}
        // FlashList v2 has no windowSize/maxToRenderPerBatch (FlatList props).
        // drawDistance (dp) is the native render-window control; ~2000dp
        // approximates the requested windowSize={7} (≈7 viewports of coverage).
        drawDistance={2000}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.brand}
            colors={[colors.brand]}
            progressBackgroundColor={colors.surfaceAlt}
          />
        }
      />

      {/* Floating create CTA — only when no auctions exist; safe-area aware, controlled elevation */}
      {stats.total === 0 && !loading && !error && (
        <View style={[styles.floatingCta, { bottom: Space.lg + insets.bottom }]}>
          <AppButton
            onPress={navigateToCreate}
            variant="primary"
            size="md"
            align="center"
            title="Create your first auction"
            accessibilityLabel="Create your first auction"
          />
        </View>
      )}
    </SafeAreaView>
  );
}
