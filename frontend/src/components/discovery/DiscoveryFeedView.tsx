import React, { useMemo } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { useAppTheme } from '../../theme/ThemeContext';
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

// ============================================================================
// DISCOVERY FEED VIEW — the unified personalised surface
// ============================================================================

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
  scrollRef,
  onItemSaveToggle,
  onItemSaveLongPress,
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
  scrollRef: React.MutableRefObject<any>;
  onItemSaveToggle?: (listing: DiscoveryListingSummary) => void;
  onItemSaveLongPress?: (listing: DiscoveryListingSummary) => void;
  isItemSaved?: (listingId: string) => boolean;
}) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createUnifiedDiscoveryStyles(colors), [colors]);

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
                 maxFontSizeMultiplier={2}>
                  {chip.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* Hero editorial — compact media strip, no decorative chrome.
          Per 2026 research: hero max 96-120pt on discovery feeds. */}
      {heroEditorial && heroEditorial.heroImage && (
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
            <Text style={styles.heroTitle} numberOfLines={2} maxFontSizeMultiplier={2}>
              {heroEditorial.title}
            </Text>
            <Text style={styles.heroMeta} numberOfLines={1} maxFontSizeMultiplier={2}>
              {heroEditorial.author} · {heroEditorial.readTime}
            </Text>
          </View>
        </View>
      )}

      {/* Curated collections rail — horizontal scroll of collection cards */}
      {collections.length > 0 && (
        <View style={styles.collectionsSection}>
          <Text style={styles.sectionTitle}>Curated collections</Text>
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
        </View>
      )}
    </>
  );

  // Loading skeleton — use the shared MasonrySkeleton so the loading frame
  // matches the final FlashList masonry layout (no loading→final geometry
  // shift). AGENTS.md §4 / §14: skeletons should resemble the final layout.
  if (isLoading) {
    return (
      <View style={styles.skeletonWrap}>
        <MasonrySkeleton numColumns={2} itemCount={8} />
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
      numColumns={2}
      isLoading={isLoading}
      hasMore={false}
      scrollRef={scrollRef}
      listHeaderComponent={listHeader}
      showSaveButton
      onItemSaveToggle={onItemSaveToggle}
      onItemSaveLongPress={onItemSaveLongPress}
      isItemSaved={isItemSaved}
    />
  );
}
