import React, { useMemo } from 'react';
import { View, Text, Pressable, ScrollView, RefreshControl } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { useAppTheme } from '../../theme/ThemeContext';
import { MAX_FONT_SCALE } from '../../theme/typography.v2';
import { CachedImage } from '../CachedImage';
import { OfflineBanner } from '../OfflineBanner';
import { MasonrySkeleton } from '../skeletons/MasonrySkeleton';
import { FlagshipState } from '../flagship';
import { PinterestMasonryGrid } from '../discover/PinterestMasonryGrid';
import { HorizontalRail } from '../HorizontalRail';
import { DiscoveryCollectionRailCard } from './DiscoveryCollectionRailCard';
import { createUnifiedDiscoveryStyles } from './unifiedDiscoveryStyles';
import type { DiscoveryFeedUnit } from '../../contracts/discoveryFeedUnit';
import type { DiscoveryListingSummary } from '../../contracts/DiscoveryListingSummary';
import type { DynamicSignalChip } from '../../services/algorithmicSignalsService';
import type { GalleriaCollection, GalleriaEditorial } from '../../services/galleriaApi';
import type { DiscoveryModuleId } from '../../hooks/discovery/useDiscoveryContent';

// ============================================================================
// DISCOVERY FEED VIEW — the unified personalised surface
// ============================================================================

// Per-module failure attribution (FRESH-10): a failed module renders a
// restrained retry row at its own position — never silently absent, never a
// generic note over healthy modules. `staleModules` names the content
// modules; `listingsError` covers the listings sync on a populated feed.
const MODULE_LABELS: Record<DiscoveryModuleId, string> = {
  looks: 'Looks',
  posters: 'Posters',
  moodboards: 'Moodboards',
  collections: 'Collections',
  editorials: 'Editorial',
};

export function DiscoveryFeedView({
  units,
  isLoading,
  showError,
  showEmpty,
  showFilteredEmpty,
  isOffline,
  activeCategory,
  onCategoryChange,
  categoryPills,
  heroEditorial,
  collections,
  onListingPress,
  onLookPress,
  onPosterPress,
  onMoodboardPress,
  onCollectionPress,
  onRefresh,
  staleModules,
  listingsError,
  onEditorialPress,
  isRefreshing,
  hasMore,
  isLoadingMore,
  onEndReached,
  scrollRef,
  onItemSaveToggle,
  onItemSaveLongPress,
  onListingLongPress,
  isItemSaved }: {
  units: DiscoveryFeedUnit[];
  isLoading: boolean;
  showError: boolean;
  showEmpty: boolean;
  showFilteredEmpty: boolean;
  isOffline: boolean;
  activeCategory: string;
  onCategoryChange: (c: string) => void;
  categoryPills: DynamicSignalChip[];
  heroEditorial?: GalleriaEditorial;
  collections: GalleriaCollection[];
  onListingPress: (listing: DiscoveryListingSummary) => void;
  onLookPress: (id: string) => void;
  onPosterPress: (id: string) => void;
  onMoodboardPress: (id: string) => void;
  onCollectionPress: (id: string) => void;
  onRefresh: () => void;
  /** Modules whose last refresh rejected, by identity — each renders a
   *  restrained retry row at its own position (F21/FRESH-10). */
  staleModules?: DiscoveryModuleId[];
  /** Last listings-sync failure while the feed stays populated — rendered
   *  as an inline retry row at the feed position, not a blocking state. */
  listingsError?: string | null;
  /** Opens the editorial's real destination (the Galleria surface that owns
   *  the editorial). When absent the hero renders non-interactive —
   *  never a fake affordance (FRESH-08). */
  onEditorialPress?: () => void;
  /** True while the pull-to-refresh gesture's sources are still settling —
   *  keeps the RefreshControl honest (F06). */
  isRefreshing: boolean;
  /** Whether another page of backend listings exists. */
  hasMore: boolean;
  /** True while the next page is in flight — drives the grid footer. */
  isLoadingMore: boolean;
  /** Loads the next page; undefined when the feed is a fixed recommendation
   *  page (the grid then shows its honest end-of-list state). */
  onEndReached?: () => void;
  scrollRef: React.MutableRefObject<any>;
  onItemSaveToggle?: (listing: DiscoveryListingSummary) => void;
  onItemSaveLongPress?: (listing: DiscoveryListingSummary) => void;
  /** Long-press on a listing tile — opens the feed-control sheet
   *  (not interested / show less / why am I seeing this). */
  onListingLongPress?: (listing: DiscoveryListingSummary) => void;
  isItemSaved?: (listingId: string) => boolean;
}) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createUnifiedDiscoveryStyles(colors), [colors]);

  // A failed module's inline retry — hairline row, meta copy, brand text
  // action. Reuses the active-filters row grammar; no new chrome.
  const renderModuleRetry = (label: string) => (
    <Pressable
      key={label}
      onPress={onRefresh}
      accessibilityRole="button"
      accessibilityLabel={`${label} couldn't load. Tap to retry.`}
      style={({ pressed }) => [styles.activeFiltersRow, { opacity: pressed ? 0.6 : 1 }]}
    >
      <Text style={styles.activeFiltersText} numberOfLines={1} maxFontSizeMultiplier={MAX_FONT_SCALE.utility}>
        {label} couldn't load
      </Text>
      <Text style={styles.clearFiltersText} maxFontSizeMultiplier={MAX_FONT_SCALE.utility}>
        Retry
      </Text>
    </Pressable>
  );

  // Feed-positioned modules: looks/posters/moodboards are woven into the
  // masonry units, and the listings sync feeds the grid body — their retry
  // rows sit at the top of the feed, where that content would appear.
  const feedModuleRetryRows = !isOffline ? (
    <>
      {(['looks', 'posters', 'moodboards'] as const)
        .filter((m) => staleModules?.includes(m))
        .map((m) => renderModuleRetry(MODULE_LABELS[m]))}
      {listingsError ? renderModuleRetry('Latest items') : null}
    </>
  ) : null;

  if (showError) {
    return (
      <View style={styles.stateWrap}>
        <FlagshipState
          variant="error"
          icon="cloud-offline-outline"
          title="Discovery unavailable"
          subtitle="We couldn't load discovery right now. Check your connection and try again."
          actionLabel="Retry"
          onAction={onRefresh}
        />
      </View>
    );
  }

  if (showFilteredEmpty) {
    return (
      <View style={styles.stateWrap}>
        <FlagshipState
          variant="empty"
          icon="bag-handle-outline"
          title={`No ${activeCategory.toLowerCase()} items yet`}
          subtitle="Try another category or check back soon."
          actionLabel="Browse all"
          onAction={() => onCategoryChange('All')}
        />
      </View>
    );
  }

  if (showEmpty) {
    return (
      <View style={styles.stateWrap}>
        <FlagshipState
          variant="empty"
          icon="search-outline"
          title="Nothing to explore yet"
          subtitle="New items are uploaded every day. Check back soon."
          actionLabel="Refresh"
          onAction={onRefresh}
        />
      </View>
    );
  }

  // Build the header component for the masonry grid:
  // category pills + hero editorial (compact) + collections rail
  // Per 2026 research: product media should own the first viewport.
  // Greeting removed — not needed on a search-first surface.
  const listHeader = (
    <>
      {isOffline && <OfflineBanner onRetry={onRefresh} />}

      {/* Category pills — horizontal scroll, dynamically driven by user algorithm.
          Wrapped in a ScrollView so 8+ pills scroll on narrow screens with a
          partial next pill visible at the edge (paddingRight: Space.md). */}
      <View style={styles.categoryBar}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoryBarContent}
        >
          {categoryPills.map((chip) => {
            const isSelected = activeCategory === chip.label;
            return (
              <Pressable
                key={`pill-${chip.id}-${chip.filterKey}`}
                onPress={() => onCategoryChange(chip.label)}
                style={[
                  styles.categoryPill,
                  isSelected && styles.categoryPillActive,
                  chip.isPersonalized && !isSelected && styles.categoryPillPersonalized,
                ]}
                accessibilityRole="button"
                accessibilityLabel={`Filter by ${chip.label}${chip.isPersonalized ? ', personalized' : ''}`}
                accessibilityState={{ selected: isSelected }}
              >
                {chip.isPersonalized && chip.kind !== 'all' && chip.filterKey !== 'new' ? (
                  <View style={[styles.categoryDot, isSelected && styles.categoryDotActive]} />
                ) : null}
                <Text
                  style={[
                    styles.categoryPillText,
                    isSelected && styles.categoryPillTextActive,
                  ]}
                 maxFontSizeMultiplier={MAX_FONT_SCALE.utility}>
                  {chip.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* Hero editorial — compact media strip, no decorative chrome.
          Per 2026 research: hero max 96-120pt on discovery feeds.
          FRESH-08: the hero is a real navigation target (the Galleria
          surface that owns the editorial) when a handler is provided;
          without one it renders non-interactive — no fake affordance.
          FRESH-10: when the editorials module failed, its position shows a
          restrained retry row instead of vanishing silently. */}
      {heroEditorial && heroEditorial.heroImage ? (
        onEditorialPress ? (
          <Pressable
            onPress={onEditorialPress}
            style={({ pressed }) => [styles.heroWrap, { opacity: pressed ? 0.85 : 1 }]}
            accessibilityRole="button"
            accessibilityLabel={heroEditorial.title}
            accessibilityHint="Opens the editorial in the Galleria"
          >
            <CachedImage
              uri={heroEditorial.heroImage}
              style={styles.heroImage}
              contentFit="cover"
              priority="high"
            />
            <LinearGradient
              colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.65)']}
              style={styles.heroGradient}
            />
            <View style={styles.heroOverlay} pointerEvents="none">
              <Text style={styles.heroEyebrow}>EDITORIAL</Text>
              <Text style={styles.heroTitle} numberOfLines={2} maxFontSizeMultiplier={MAX_FONT_SCALE.heading}>
                {heroEditorial.title}
              </Text>
              <Text style={styles.heroMeta} numberOfLines={1} maxFontSizeMultiplier={MAX_FONT_SCALE.utility}>
                {heroEditorial.author} · {heroEditorial.readTime}
              </Text>
            </View>
          </Pressable>
        ) : (
          <View style={styles.heroWrap}>
            <CachedImage
              uri={heroEditorial.heroImage}
              style={styles.heroImage}
              contentFit="cover"
              priority="high"
            />
            <LinearGradient
              colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.65)']}
              style={styles.heroGradient}
            />
            <View style={styles.heroOverlay} pointerEvents="none">
              <Text style={styles.heroEyebrow}>EDITORIAL</Text>
              <Text style={styles.heroTitle} numberOfLines={2} maxFontSizeMultiplier={MAX_FONT_SCALE.heading}>
                {heroEditorial.title}
              </Text>
              <Text style={styles.heroMeta} numberOfLines={1} maxFontSizeMultiplier={MAX_FONT_SCALE.utility}>
                {heroEditorial.author} · {heroEditorial.readTime}
              </Text>
            </View>
          </View>
        )
      ) : null}
      {/* Stale editorials keep their cached hero on screen — the failure is
          still attributed at the module's position with an inline retry. */}
      {!isOffline && staleModules?.includes('editorials')
        ? renderModuleRetry(MODULE_LABELS.editorials)
        : null}

      {/* Curated collections rail — horizontal scroll of collection cards.
          A failed collections module keeps its position: cached cards stay
          on screen and the retry row attributes the stale refresh inline. */}
      {collections.length > 0 || (!isOffline && staleModules?.includes('collections')) ? (
        <View style={styles.collectionsSection}>
          <Text style={styles.sectionTitle}>Curated collections</Text>
          {collections.length > 0 ? (
            <HorizontalRail
              contentContainerStyle={styles.railContent}
              showsHorizontalScrollIndicator={false}
            >
              {collections.map((collection) => (
                <DiscoveryCollectionRailCard
                  key={collection.id}
                  collection={collection}
                  onPress={() => onCollectionPress(collection.id)}
                />
              ))}
            </HorizontalRail>
          ) : null}
          {!isOffline && staleModules?.includes('collections')
            ? renderModuleRetry(MODULE_LABELS.collections)
            : null}
        </View>
      ) : null}

      {feedModuleRetryRows}
    </>
  );

  // Loading skeleton — use the shared MasonrySkeleton so the loading frame
  // matches the final FlashList masonry layout (no loading→final geometry
  // shift). AGENTS.md §4 / §14: skeletons should resemble the final layout.
  if (isLoading) {
    return (
      <View style={styles.skeletonWrap}>
        <MasonrySkeleton numColumns={3} itemCount={9} />
      </View>
    );
  }

  return (
    <PinterestMasonryGrid
      items={units}
      onItemPress={onListingPress}
      onLookPress={onLookPress}
      onPosterPress={onPosterPress}
      onMoodboardPress={onMoodboardPress}
      numColumns={3}
      isLoading={isLoading}
      hasMore={hasMore}
      isLoadingMore={isLoadingMore}
      onEndReached={onEndReached}
      refreshControl={
        <RefreshControl
          refreshing={isRefreshing}
          onRefresh={onRefresh}
          tintColor={colors.brand}
          colors={[colors.brand]}
          progressBackgroundColor={colors.surface}
        />
      }
      scrollRef={scrollRef}
      listHeaderComponent={listHeader}
      onItemSaveToggle={onItemSaveToggle}
      onItemSaveLongPress={onItemSaveLongPress}
      onListingLongPress={onListingLongPress}
      isItemSaved={isItemSaved}
    />
  );
}
