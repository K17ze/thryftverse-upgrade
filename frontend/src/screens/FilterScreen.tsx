import React, { useMemo } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Pressable,
  useWindowDimensions } from 'react-native';
import Reanimated from 'react-native-reanimated';
import { GestureDetector } from 'react-native-gesture-handler';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { Radius, Elevation } from '../theme/designTokens';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { RootStackParamList } from '../navigation/types';
import { useStore } from '../store/useStore';
import { useBackendData } from '../context/BackendDataContext';
import { SyncRetryBanner } from '../components/SyncRetryBanner';
import { getBackendSyncStatus } from '../utils/syncStatus';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useFeatureFlag } from '../analytics';
import { track } from '../analytics/track';
import {
  SORT_OPTIONS,
  AUCTION_SORT_OPTION } from '../components/filters/filterTypes';
import { createFilterStyles } from '../components/filters/filterStyles';
import { FilterSheetHeader } from '../components/filters/FilterSheetHeader';
import { FilterPresets } from '../components/filters/FilterPresets';
import { FilterLoadingState } from '../components/filters/FilterLoadingState';
import { FilterSortSection } from '../components/filters/FilterSortSection';
import { FilterBrandSection } from '../components/filters/FilterBrandSection';
import { FilterSizeSection } from '../components/filters/FilterSizeSection';
import { FilterConditionSection } from '../components/filters/FilterConditionSection';
import { FilterSustainabilitySection } from '../components/filters/FilterSustainabilitySection';
import { FilterPriceRange } from '../components/filters/FilterPriceRange';
import { FilterAdvancedSection } from '../components/filters/FilterAdvancedSection';
import { FilterFooter } from '../components/filters/FilterFooter';
import { useFilterSheet } from '../hooks/filters/useFilterSheet';
import { useFilterScreenState } from '../hooks/filters/useFilterScreenState';
import { useFilterResultCount } from '../hooks/filters/useFilterResultCount';

type FilterRoute = RouteProp<RootStackParamList, 'Filter'>;

export default function FilterScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<FilterRoute>();
  const browseFilters = useStore((state) => state.browseFilters);
  const updateBrowseFilters = useStore((state) => state.updateBrowseFilters);
  const { listings, source, isSyncing, lastError, refreshListings } = useBackendData();
  const { colors } = useAppTheme();
  const reducedMotion = useReducedMotion();
  const { height, width } = useWindowDimensions();
  const SNAP_HALF = height * 0.5;
  const SNAP_FULL = height * 0.1;
  const styles = useMemo(() => createStyles(colors, width, height), [colors, width, height]);
  const filterStyles = useMemo(() => createFilterStyles(colors), [colors]);

  // Feature flag — gates the advanced filter section (quick price presets).
  // Additive enhancement; absent when the flag is off (current behaviour).
  // When enabled, an "Advanced" collapsible section surfaces quick price
  // range presets that set the existing priceMin/priceMax fields.
  const advancedFiltersEnabled = useFeatureFlag('advanced_filters');
  const categoryId = route.params?.categoryId ?? 'search';
  const title = route.params?.title;
  const subcategoryId = route.params?.subcategoryId;

  // "Ending soon" is only meaningful for auction listings. Include it solely
  // when the filter context is an auction category (mirrors BrowseScreen).
  const isAuctionContext = categoryId.toLowerCase().includes('auction');
  // Search context targets GET /search/listings — the client-side result
  // count is only an approximation there, so the header stays honest.
  const isSearchContext = categoryId === 'search';
  const sortOptions = React.useMemo(
    () => (isAuctionContext ? [...SORT_OPTIONS, AUCTION_SORT_OPTION] : SORT_OPTIONS),
    [isAuctionContext],
  );

  const {
    activeSort,
    setActiveSort,
    selectedBrands,
    toggleBrand,
    selectedSizes,
    toggleSize,
    selectedCondition,
    setSelectedCondition,
    sustainableOnly,
    toggleSustainableOnly,
    priceMin,
    setPriceMin,
    priceMax,
    setPriceMax,
    expandedSections,
    toggleSection,
    handleClear,
    applyPresetSelection,
    presetSelection,
    hasActiveSelection,
    activeFilterCount,
  } = useFilterScreenState(browseFilters);

  const { gesture, sheetStyle, overlayStyle, closeBottomSheet } = useFilterSheet({
    height,
    snapHalf: SNAP_HALF,
    snapFull: SNAP_FULL,
    reducedMotion,
    onClose: navigation.goBack });

  const brandOptions = React.useMemo(() => {
    return Array.from(
      new Set(
        listings
          .map((listing) => listing.brand?.trim())
          .filter((brand): brand is string => Boolean(brand)),
      ),
    );
  }, [listings]);

  const sizeOptions = React.useMemo(() => {
    return Array.from(
      new Set(
        listings
          .map((listing) => listing.size?.trim())
          .filter((size): size is string => Boolean(size)),
      ),
    );
  }, [listings]);

  const filterStatus = React.useMemo(
    () =>
      getBackendSyncStatus({
        isSyncing,
        source,
        hasError: Boolean(lastError),
        labels: {
          live: 'Live data' } }),
    [isSyncing, lastError, source],
  );

  const showFilterLoadingState = isSyncing && listings.length === 0 && !lastError;

  const resultCount = useFilterResultCount({
    listings,
    categoryId,
    subcategoryId,
    title,
    query: browseFilters.query,
    selectedBrands,
    selectedSizes,
    selectedCondition,
    priceMin,
    priceMax,
    sustainableOnly });

  const handleApply = () => {
    const parsedMin = priceMin.trim() ? Number(priceMin.trim()) : null;
    const parsedMax = priceMax.trim() ? Number(priceMax.trim()) : null;
    updateBrowseFilters({
      sort: activeSort,
      brands: selectedBrands,
      sizes: selectedSizes,
      condition: selectedCondition as typeof browseFilters.condition,
      sustainableOnly,
      priceMin: parsedMin != null && !Number.isNaN(parsedMin) ? parsedMin : null,
      priceMax: parsedMax != null && !Number.isNaN(parsedMax) ? parsedMax : null });
    track('filter_applied', { filter_name: 'sort', filter_value: activeSort });
    for (const brand of selectedBrands) {
      track('filter_applied', { filter_name: 'brand', filter_value: brand });
    }
    for (const size of selectedSizes) {
      track('filter_applied', { filter_name: 'size', filter_value: size });
    }
    if (selectedCondition !== 'Any') {
      track('filter_applied', { filter_name: 'condition', filter_value: selectedCondition });
    }
    if (sustainableOnly) {
      track('filter_applied', { filter_name: 'sustainableOnly', filter_value: true });
    }
    if (parsedMin != null && !Number.isNaN(parsedMin)) {
      track('filter_applied', { filter_name: 'priceMin', filter_value: parsedMin });
    }
    if (parsedMax != null && !Number.isNaN(parsedMax)) {
      track('filter_applied', { filter_name: 'priceMax', filter_value: parsedMax });
    }
    closeBottomSheet();
  };

  const applyLabel = showFilterLoadingState
    ? 'Loading options...'
    : isSearchContext
      ? 'Apply filters'
      : `Show ${resultCount} items`;

  return (
    <View style={styles.container}>
      <Reanimated.View style={[StyleSheet.absoluteFill, { backgroundColor: colors.overlay }, overlayStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={closeBottomSheet} />
      </Reanimated.View>

      <GestureDetector gesture={gesture}>
        <Reanimated.View style={[styles.sheet, sheetStyle]}>
          <FilterSheetHeader
            activeFilterCount={activeFilterCount}
            onClear={handleClear}
            statusMeta={
              isSearchContext
                ? 'Filters apply to the current search'
                : `${resultCount} matches currently`
            }
            syncTone={filterStatus.tone}
            syncLabel={filterStatus.label}
            contextLabel={title ?? categoryId}
            onPressContext={() => navigation.navigate('CategoryTree', { categoryPrefix: categoryId === 'search' ? '' : categoryId })}
          />

          <FilterPresets
            hasActiveSelection={hasActiveSelection}
            selection={presetSelection}
            onApplyPreset={applyPresetSelection}
          />

          {lastError ? (
            <SyncRetryBanner
              message="Live filter data is delayed. Showing cached catalog options."
              onRetry={() => void refreshListings()}
              isRetrying={isSyncing}
              telemetryContext="filter_sync"
              containerStyle={filterStyles.syncRetryBanner}
              actionStyle={filterStyles.syncRetryBtn}
            />
          ) : null}

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={filterStyles.scrollContent}>
            {showFilterLoadingState ? (
              <FilterLoadingState />
            ) : (
              <>
                <FilterSortSection
                  expanded={expandedSections.has('sort')}
                  onToggle={() => toggleSection('sort')}
                  options={sortOptions}
                  value={activeSort}
                  onChange={setActiveSort}
                />

                <View style={filterStyles.sectionDivider} />

                <FilterBrandSection
                  expanded={expandedSections.has('brand')}
                  onToggle={() => toggleSection('brand')}
                  brandOptions={brandOptions}
                  selectedBrands={selectedBrands}
                  onToggleBrand={toggleBrand}
                />

                <View style={filterStyles.sectionDivider} />

                <FilterSizeSection
                  expanded={expandedSections.has('size')}
                  onToggle={() => toggleSection('size')}
                  sizeOptions={sizeOptions}
                  selectedSizes={selectedSizes}
                  onToggleSize={toggleSize}
                />

                <View style={filterStyles.sectionDivider} />

                <FilterConditionSection
                  expanded={expandedSections.has('condition')}
                  onToggle={() => toggleSection('condition')}
                  value={selectedCondition}
                  onChange={setSelectedCondition}
                />

                <View style={filterStyles.sectionDivider} />

                <FilterSustainabilitySection
                  expanded={expandedSections.has('sustainability')}
                  onToggle={() => toggleSection('sustainability')}
                  checked={sustainableOnly}
                  onToggleChecked={toggleSustainableOnly}
                />

                <View style={filterStyles.sectionDivider} />

                <FilterPriceRange
                  expanded={expandedSections.has('price')}
                  onToggle={() => toggleSection('price')}
                  priceMin={priceMin}
                  priceMax={priceMax}
                  onChangeMin={setPriceMin}
                  onChangeMax={setPriceMax}
                />

                {/* Advanced Section — collapsible, gated by the
                    advanced_filters feature flag. Additive; absent when the
                    flag is off (current behaviour). Surfaces quick price
                    range presets that set the existing priceMin/priceMax
                    fields — a progressive-disclosure shortcut for power
                    users. */}
                {advancedFiltersEnabled ? (
                  <>
                    <View style={filterStyles.sectionDivider} />
                    <FilterAdvancedSection
                      expanded={expandedSections.has('advanced')}
                      onToggle={() => toggleSection('advanced')}
                      priceMin={priceMin}
                      priceMax={priceMax}
                      onSelectPreset={(min, max) => {
                        setPriceMin(min);
                        setPriceMax(max);
                      }}
                    />
                  </>
                ) : null}
              </>
            )}

            {/* Sticky Bottom Action — Apply + Reset side by side */}
            <FilterFooter
              resetDisabled={!hasActiveSelection}
              onReset={handleClear}
              applyLabel={applyLabel}
              applyDisabled={showFilterLoadingState}
              onApply={handleApply}
            />
          </ScrollView>
        </Reanimated.View>
      </GestureDetector>
    </View>
  );
}

function createStyles(colors: ThemeColors, width: number, height: number) {
  return StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  sheet: {
    position: 'absolute',
    bottom: 0,
    width: width,
    height: height,
    backgroundColor: colors.surface,
    borderTopLeftRadius: Radius.xxl,
    borderTopRightRadius: Radius.xxl,
    ...Elevation.modal } });
}
