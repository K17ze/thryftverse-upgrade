import React from 'react';
import { View, RefreshControl } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { SharedValue } from 'react-native-reanimated';

import { EmptyState } from '../EmptyState';
import { MasonrySkeleton } from '../skeletons/MasonrySkeleton';
import { PinterestMasonryGrid } from '../discover/PinterestMasonryGrid';
import { RefreshIndicator } from '../RefreshIndicator';
import { friendlyBackendError } from '../../services/listingMapper';
import { openProductDetail } from '../../platform/product/openProductDetail';
import { Space } from '../../theme/designTokens';
import type { ThemeColors } from '../../theme/ThemeContext';
import type { Listing } from '../../domain';
import type { BrowseStyles } from './browseStyles';
import type { GridDensity } from '../../hooks/browse/useBrowseGridDensity';

interface BrowseResultsProps {
  styles: BrowseStyles;
  colors: ThemeColors;
  scrollY: SharedValue<number>;
  refreshing: boolean;
  onRefresh: () => void;
  backendLoading: boolean;
  showSkeleton: boolean;
  backendError: string | null;
  lastError: string | null;
  displayListings: Listing[];
  hasAnyFiltering: boolean;
  gridDensity: GridDensity;
  onClearFilters: () => void;
  onRetryListings: () => void;
}

export function BrowseResults({
  styles,
  colors,
  scrollY,
  refreshing,
  onRefresh,
  backendLoading,
  showSkeleton,
  backendError,
  lastError,
  displayListings,
  hasAnyFiltering,
  gridDensity,
  onClearFilters,
  onRetryListings }: BrowseResultsProps) {
  const navigation = useNavigation<any>();

  const renderBrowseLoadingState = () => (
    <View style={styles.loadingStateWrap}>
      <MasonrySkeleton numColumns={gridDensity === 'compact' ? 3 : 2} itemCount={gridDensity === 'compact' ? 9 : 6} horizontalPadding={Space.md} gap={3} />
    </View>
  );

  return (
    /* Masonry Grid - Pinterest/Depop Style */
    <View style={{ flex: 1 }}>
      <RefreshIndicator scrollY={scrollY} isRefreshing={refreshing} topInset={40} />

      {backendLoading || showSkeleton ? (
        renderBrowseLoadingState()
      ) : backendError ? (
        <EmptyState
          icon="cloud-offline-outline"
          title="Filter unavailable"
          subtitle={friendlyBackendError(backendError)}
          ctaLabel="Clear filters"
          onCtaPress={onClearFilters}
        />
      ) : lastError && displayListings.length === 0 ? (
        <EmptyState
          icon="cloud-offline-outline"
          iconColor={colors.danger}
          title="Browse unavailable"
          subtitle="We couldn't load listings. Check your connection and try again."
          ctaLabel="Retry"
          onCtaPress={onRetryListings}
        />
      ) : displayListings.length > 0 ? (
        <PinterestMasonryGrid
          items={displayListings}
          onPressItem={(item) => openProductDetail(navigation, { referenceKind: 'listing', canonicalId: item.id, sourceSurface: 'BrowseScreen' })}
          numColumns={gridDensity === 'compact' ? 3 : 2}
          showSaveButton
          gap={gridDensity === 'compact' ? Space.xs + 2 : 3}
          horizontalPadding={Space.md}
          testIDPrefix="golden-browse-product-card"
          firstItemTestID="golden-browse-first-product"
          enableImagePrefetch
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.brand}
              colors={[colors.brand]}
            />
          }
        />
      ) : hasAnyFiltering ? (
        // Filtered-empty — filters returned no results. Friendly, not an
        // error: the user can adjust or clear filters to recover.
        <View style={{ flex: 1 }}>
          <EmptyState
            icon="filter-outline"
            title="No items match your filters"
            subtitle="Try adjusting your filters or clearing them."
            ctaLabel="Clear filters"
            onCtaPress={onClearFilters}
          />
        </View>
      ) : (
        // Regular empty — no data at all for this category/search. Distinct
        // from filtered-empty: there is nothing to show regardless of filters.
        <View style={{ flex: 1 }}>
          <EmptyState
            icon="bag-handle-outline"
            title="No items here yet"
            subtitle="New listings arrive daily — check back soon or explore everything."
            ctaLabel="Explore all"
            onCtaPress={() => navigation.navigate('Browse', { categoryId: 'all', title: 'Explore' })}
          />
        </View>
      )}
    </View>
  );
}
