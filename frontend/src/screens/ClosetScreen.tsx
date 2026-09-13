import React, { useState, useCallback } from 'react';
import {
  View,
  StatusBar,
  RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Reanimated, { FadeIn } from 'react-native-reanimated';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAppTheme } from '../theme/ThemeContext';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { RootStackParamList } from '../navigation/types';
import { openProductDetail } from '../platform/product/openProductDetail';
import { FlagshipHeader } from '../components/flagship';
import { SyncRetryBanner } from '../components/SyncRetryBanner';
import { OfflineBanner } from '../components/OfflineBanner';
import { RefreshIndicator } from '../components/RefreshIndicator';
import { useHaptic } from '../hooks/useHaptic';
import { ConfirmationSheet } from '../components/ConfirmationSheet';
import { Space, DockConstants } from '../theme/designTokens';
import {
  useClosetData,
  useClosetActions,
  useClosetScroll,
  type ClosetTabKey,
  type ClosetSortOption } from '../hooks/closet';
import { closetStyles, useClosetThemedStyles } from '../components/closet/closetStyles';
import { ClosetHeaderActions } from '../components/closet/ClosetHeaderActions';
import { ClosetTabBar } from '../components/closet/ClosetTabBar';
import { ClosetToolbar } from '../components/closet/ClosetToolbar';
import { ClosetSortMenu } from '../components/closet/ClosetSortMenu';
import { ClosetBrandFilterRow } from '../components/closet/ClosetBrandFilterRow';
import { ClosetPriceDropChip } from '../components/closet/ClosetPriceDropChip';
import { ClosetIdentityStrip } from '../components/closet/ClosetIdentityStrip';
import { ClosetListingSection } from '../components/closet/ClosetListingSection';
import { ClosetCollectionsSection } from '../components/closet/ClosetCollectionsSection';
import { ClosetOutfitsSection } from '../components/closet/ClosetOutfitsSection';

type NavT = NativeStackNavigationProp<RootStackParamList>;

/**
 * Closet — orchestrator only. Data lifecycle and derived projections live
 * in useClosetData (hooks/closet), destructive-action sheets in
 * useClosetActions, scroll chrome in useClosetScroll, and every rendered
 * section in components/closet/*. Pure derivations live in domain/closet.
 */
export default function ClosetScreen() {
  const { colors, isDark } = useAppTheme();
  const reducedMotion = useReducedMotion();
  const t = useClosetThemedStyles();
  const navigation = useNavigation<NavT>();
  const haptic = useHaptic();

  const [activeTab, setActiveTab] = useState<ClosetTabKey>('SAVED');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<ClosetSortOption>('Default');
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [showPriceDropsOnly, setShowPriceDropsOnly] = useState(false);
  const [activeBrand, setActiveBrand] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  const {
    listings,
    collections,
    outfits,
    savedItems,
    wishlistItems,
    isSyncing,
    lastError,
    refreshing,
    collectionsLoading,
    collectionsSyncError,
    filteredSaved,
    filteredWishlist,
    collectionBoards,
    outfitCards,
    priceDropCount,
    closetStats,
    availableBrands,
    tabCount,
    searchPlaceholder,
    handleRefresh,
  } = useClosetData({ activeTab, searchQuery, sortBy, showPriceDropsOnly, activeBrand });

  const { scrollY, scrollHandler, headerBgStyle } = useClosetScroll();
  const { confirmSheet, confirmDeleteOutfit, dismissConfirmSheet, handleShareCloset } =
    useClosetActions();

  // ── Navigation wiring ──
  const handleGoBack = useCallback(() => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.navigate('MainTabs');
    }
  }, [navigation]);

  const handleBrowse = useCallback(() => {
    navigation.navigate('UnifiedDiscovery');
  }, [navigation]);

  const handleCreateCollection = useCallback(() => {
    haptic.medium();
    navigation.navigate('CreateCollection');
  }, [haptic, navigation]);

  const handleCreateOutfit = useCallback(() => {
    haptic.medium();
    navigation.navigate('OutfitBuilder');
  }, [haptic, navigation]);

  const handleTabChange = (tab: ClosetTabKey) => {
    haptic.light();
    setActiveTab(tab);
  };

  const isItemTab = activeTab === 'SAVED' || activeTab === 'WISHLIST';

  return (
    <SafeAreaView style={[closetStyles.container, t.container]} edges={['top']}>
      <StatusBar barStyle={!isDark ? 'dark-content' : 'light-content'} backgroundColor={colors.background} />

      {/* Animated Header Border */}
      <Reanimated.View style={[closetStyles.headerBorder, t.headerBorder, headerBgStyle]} pointerEvents="none" />

      {/* Header — FlagshipHeader primitive (canonical header, 44pt back hit area) */}
      <FlagshipHeader
        title="Closet"
        onBack={handleGoBack}
        rightAction={
          <ClosetHeaderActions
            activeTab={activeTab}
            count={tabCount}
            onShare={handleShareCloset}
          />
        }
      />

      <RefreshIndicator scrollY={scrollY} isRefreshing={refreshing} topInset={20} />

      <Reanimated.ScrollView
        contentContainerStyle={closetStyles.scrollContent}
        showsVerticalScrollIndicator={false}
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor="transparent"
            colors={['transparent']}
            progressBackgroundColor="transparent"
          />
        }
      >
        {/* Offline banner */}
        <OfflineBanner onRetry={() => void handleRefresh()} />

        {/* Error banner */}
        {(lastError || collectionsSyncError) && (
          <View style={{ paddingHorizontal: Space.md, marginBottom: Space.sm }}>
            <SyncRetryBanner
              message={collectionsSyncError ? 'Collections are temporarily unavailable. Your saved items are still here.' : 'Saved items are unavailable. Showing cached results.'}
              onRetry={() => void handleRefresh()}
              isRetrying={isSyncing || refreshing}
              telemetryContext="closet_sync"
            />
          </View>
        )}

        {/* Tabs — immediately after header, before any stats/filters */}
        <ClosetTabBar
          activeTab={activeTab}
          counts={{
            SAVED: savedItems.length,
            WISHLIST: wishlistItems.length,
            COLLECTIONS: collections.length,
            OUTFITS: outfits.length }}
          onTabChange={handleTabChange}
        />

        {/* Compact search + sort/filter toolbar — single icons, not chip walls */}
        <ClosetToolbar
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          placeholder={searchPlaceholder}
          showItemControls={isItemTab}
          sortBy={sortBy}
          onToggleSortMenu={() => setShowSortMenu((v) => !v)}
          showFilters={showFilters}
          onToggleFilters={() => { haptic.light(); setShowFilters((v) => !v); }}
          brandFilterActive={activeBrand != null}
        />

        {/* Sort menu — compact dropdown */}
        {showSortMenu && isItemTab ? (
          <ClosetSortMenu
            sortBy={sortBy}
            onSelect={(opt) => {
              haptic.light();
              setSortBy(opt);
              setShowSortMenu(false);
            }}
          />
        ) : null}

        {/* Brand filter panel — only visible when filter icon is tapped */}
        {showFilters && isItemTab && availableBrands.length > 1 ? (
          <ClosetBrandFilterRow
            brands={availableBrands}
            activeBrand={activeBrand}
            onSelectBrand={(brand) => {
              haptic.light();
              setActiveBrand((prev) => (prev === brand ? null : brand));
            }}
          />
        ) : null}

        {/* Price drop filter — only on wishlist, compact chip */}
        {activeTab === 'WISHLIST' && priceDropCount > 0 ? (
          <ClosetPriceDropChip
            count={priceDropCount}
            active={showPriceDropsOnly}
            onToggle={() => {
              haptic.light();
              setShowPriceDropsOnly((v) => !v);
            }}
          />
        ) : null}

        {/* Closet identity strip — flat canvas + hairline dividers, no card.
            This is the closet's headline (value, items, collections, savings),
            promoted to the first viewport so the surface reads as an identity
            moment, not a footer (AGENTS.md §4 — no card-on-card, hierarchy). */}
        {closetStats.totalItems > 0 ? (
          <ClosetIdentityStrip stats={closetStats} />
        ) : null}

        {activeTab === 'SAVED' && (
          <Reanimated.View key="SAVED" entering={reducedMotion ? undefined : FadeIn.duration(200)}>
            <ClosetListingSection
              variant="saved"
              showSkeleton={isSyncing && listings.length === 0}
              items={filteredSaved}
              onPressItem={(item) => openProductDetail(navigation, { referenceKind: 'listing', canonicalId: item.id, sourceSurface: 'ClosetSaved' })}
              onBrowse={handleBrowse}
            />
          </Reanimated.View>
        )}
        {activeTab === 'WISHLIST' && (
          <Reanimated.View key="WISHLIST" entering={reducedMotion ? undefined : FadeIn.duration(200)}>
            <ClosetListingSection
              variant="wishlist"
              showSkeleton={isSyncing && listings.length === 0}
              items={filteredWishlist}
              onPressItem={(item) => openProductDetail(navigation, { referenceKind: 'listing', canonicalId: item.id, sourceSurface: 'ClosetWishlist' })}
              onBrowse={handleBrowse}
            />
          </Reanimated.View>
        )}
        {activeTab === 'COLLECTIONS' && (
          <Reanimated.View key="COLLECTIONS" entering={reducedMotion ? undefined : FadeIn.duration(200)}>
            <ClosetCollectionsSection
              showSkeleton={collectionsLoading && collections.length === 0}
              showSyncError={collectionsSyncError && collections.length === 0}
              boards={collectionBoards}
              onRetry={() => void handleRefresh()}
              onCreateCollection={handleCreateCollection}
              onPressBoard={(id) => navigation.navigate('CollectionDetail', { collectionId: id })}
            />
          </Reanimated.View>
        )}
        {activeTab === 'OUTFITS' && (
          <Reanimated.View key="OUTFITS" entering={reducedMotion ? undefined : FadeIn.duration(200)}>
            <ClosetOutfitsSection
              outfits={outfitCards}
              hasAnyOutfits={outfits.length > 0}
              searchQuery={searchQuery}
              onCreateOutfit={handleCreateOutfit}
              onPressOutfit={() => navigation.navigate('OutfitBuilder')}
              onLongPressOutfit={confirmDeleteOutfit}
            />
          </Reanimated.View>
        )}

        <View style={{ height: DockConstants.singleActionHeight }} />
      </Reanimated.ScrollView>

      <ConfirmationSheet
        visible={confirmSheet.visible}
        onDismiss={dismissConfirmSheet}
        title={confirmSheet.title}
        message={confirmSheet.message}
        confirmLabel={confirmSheet.confirmLabel ?? 'Confirm'}
        variant={confirmSheet.variant ?? 'default'}
        onConfirm={confirmSheet.onConfirm}
      />
    </SafeAreaView>
  );
}
