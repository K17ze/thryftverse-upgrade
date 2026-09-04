import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  AnimatedPressable } from '../components/AnimatedPressable';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  StatusBar,
  Platform,
  useWindowDimensions,
  Pressable,
  TextInput } from 'react-native';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  runOnJS,
  interpolate,
  Extrapolation
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { Typography, Radius, Space, Stroke, Control, LetterSpacing, Elevation } from '../theme/designTokens';
import { TypographyV2 } from '../theme/typography.v2';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { RootStackParamList } from '../navigation/types';
import { useStore } from '../store/useStore';
import { useBackendData } from '../context/BackendDataContext';
import { SyncStatusPill } from '../components/SyncStatusPill';
import { SkeletonLoader } from '../components/SkeletonLoader';
import { SyncRetryBanner } from '../components/SyncRetryBanner';
import { getBackendSyncStatus } from '../utils/syncStatus';
import { AppButton } from '../components/ui/AppButton';
import { AppSegmentControl } from '../components/ui/AppSegmentControl';
import { useToast } from '../context/ToastContext';
import { useSettingsPreferences } from '../context/SettingsPreferencesContext';
import { haptics } from '../utils/haptics';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { isSustainableGrade } from '../utils/sustainabilityScore';
import { useFeatureFlag } from '../analytics';
import { track } from '../analytics/track';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { useTaxonomy } from '../context/TaxonomyContext';

type SortOption = 'Recommended' | 'Newest' | 'Price: Low to High' | 'Price: High to Low' | 'Most liked' | 'Ending soon';
type ConditionOption = 'Any' | string;
type FilterRoute = RouteProp<RootStackParamList, 'Filter'>;

const SORT_OPTIONS: Array<{ value: SortOption; label: string; accessibilityLabel: string }> = [
  { value: 'Recommended', label: 'Recommended', accessibilityLabel: 'Sort by recommended' },
  { value: 'Newest', label: 'Newest', accessibilityLabel: 'Sort by newest items' },
  { value: 'Price: Low to High', label: 'Price: Low to High', accessibilityLabel: 'Sort by price low to high' },
  { value: 'Price: High to Low', label: 'Price: High to Low', accessibilityLabel: 'Sort by price high to low' },
  { value: 'Most liked', label: 'Most liked', accessibilityLabel: 'Sort by most liked items' },
];

// "Ending soon" only applies to auction listings — it is meaningless for
// fixed-price browse/search, so it is excluded unless the filter context is
// an auction category (mirrors BrowseScreen.getSortOptions).
const AUCTION_SORT_OPTION: { value: SortOption; label: string; accessibilityLabel: string } = {
  value: 'Ending soon',
  label: 'Ending soon',
  accessibilityLabel: 'Sort by ending soon' };

const toKey = (value: string) => value.trim().toLowerCase();

function getSubcategoryToken(categoryId: string, subcategoryId?: string, title?: string) {
  if (subcategoryId) {
    return subcategoryId
      .toLowerCase()
      .replace(/^[^-]+-/, '')
      .replace(/-/g, ' ')
      .trim();
  }

  if (!title) {
    return '';
  }

  const loweredTitle = title.toLowerCase().replace(/["']/g, '').trim();
  if (loweredTitle.startsWith('all ')) {
    return '';
  }

  const cleanedCategoryId = categoryId.toLowerCase();
  if (loweredTitle.startsWith(cleanedCategoryId)) {
    return loweredTitle.slice(cleanedCategoryId.length).trim();
  }

  return loweredTitle;
}

export default function FilterScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<FilterRoute>();
  const browseFilters = useStore((state) => state.browseFilters);
  const updateBrowseFilters = useStore((state) => state.updateBrowseFilters);
  const { listings, source, isSyncing, lastError, refreshListings } = useBackendData();
  const { show } = useToast();
  const { mySizes, setMySizes, toggleMySize, filterPresets, saveFilterPreset, removeFilterPreset } = useSettingsPreferences();
  const { colors } = useAppTheme();
  const { formatFromFiat, currencySymbol } = useFormattedPrice();
  const reducedMotion = useReducedMotion();
  const { height, width } = useWindowDimensions();
  const SNAP_HALF = height * 0.5;
  const SNAP_FULL = height * 0.1;
  const styles = useMemo(() => createStyles(colors, width, height), [colors, width, height]);
  const { conditions } = useTaxonomy();
  const conditionOptions = useMemo(() => [
    { value: 'Any' as const, label: 'Any', accessibilityLabel: 'Any condition' },
    ...conditions.map(c => ({
      value: c.name as ConditionOption,
      label: c.name,
      accessibilityLabel: c.name })),
  ], [conditions]);

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
  const sortOptions = React.useMemo(
    () => (isAuctionContext ? [...SORT_OPTIONS, AUCTION_SORT_OPTION] : SORT_OPTIONS),
    [isAuctionContext],
  );

  const [activeSort, setActiveSort] = useState<SortOption>(browseFilters.sort);
  const [selectedBrands, setSelectedBrands] = useState<string[]>(browseFilters.brands);
  const [selectedSizes, setSelectedSizes] = useState<string[]>(browseFilters.sizes);
  const [isSavingPreset, setIsSavingPreset] = useState(false);
  const [presetName, setPresetName] = useState('');
  const [selectedCondition, setSelectedCondition] = useState<ConditionOption>(browseFilters.condition);
  const [showAllBrands, setShowAllBrands] = useState(false);
  const [sustainableOnly, setSustainableOnly] = useState<boolean>(browseFilters.sustainableOnly);
  const [priceMin, setPriceMin] = useState<string>(browseFilters.priceMin != null ? String(browseFilters.priceMin) : '');
  const [priceMax, setPriceMax] = useState<string>(browseFilters.priceMax != null ? String(browseFilters.priceMax) : '');

  // Collapsible section state — progressive disclosure per 2026 mobile filter UX
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['sort', 'price']));
  const toggleSection = useCallback((section: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(section)) {
        next.delete(section);
      } else {
        next.add(section);
      }
      return next;
    });
  }, []);

  const translateY = useSharedValue(height);
  const contextY = useSharedValue(0);

  useEffect(() => {
    translateY.value = withTiming(SNAP_HALF, { duration: reducedMotion ? 0 : 200 });
  }, [reducedMotion, SNAP_HALF]);

  const closeBottomSheet = () => {
    translateY.value = withTiming(height, { duration: reducedMotion ? 0 : 180 }, () => {
      runOnJS(navigation.goBack)();
    });
  };

  const gesture = Gesture.Pan()
    .onStart(() => {
      contextY.value = translateY.value;
    })
    .onUpdate((e) => {
      translateY.value = Math.max(SNAP_FULL, contextY.value + e.translationY);
    })
    .onEnd((e) => {
      if (e.translationY > 100 && e.velocityY > 500) {
        runOnJS(closeBottomSheet)();
      } else if (translateY.value > SNAP_HALF + 100) {
        runOnJS(closeBottomSheet)();
      } else if (translateY.value < SNAP_HALF - 50) {
        // Snap to full (90% height)
        translateY.value = withTiming(SNAP_FULL, { duration: reducedMotion ? 0 : 180 });
      } else {
        // Snap back to half
        translateY.value = withTiming(SNAP_HALF, { duration: reducedMotion ? 0 : 180 });
      }
    });

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }] }));

  const overlayStyle = useAnimatedStyle(() => {
    const opacity = interpolate(translateY.value, [SNAP_FULL, height], [0.6, 0], Extrapolation.CLAMP);
    return { opacity };
  });

  const brandOptions = React.useMemo(() => {
    return Array.from(
      new Set(
        listings
          .map((listing) => listing.brand?.trim())
          .filter((brand): brand is string => Boolean(brand)),
      ),
    );
  }, [listings]);

  const visibleBrandOptions = React.useMemo(() => {
    if (showAllBrands) {
      return brandOptions;
    }

    return brandOptions.slice(0, 8);
  }, [brandOptions, showAllBrands]);

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

  const renderLoadingState = () => (
    <View style={styles.loadingStateWrap}>
      <View style={styles.loadingSection}>
        <SkeletonLoader width="32%" height={Space.md - 2} borderRadius={Radius.md - 1} style={{ marginBottom: Space.sm + Space.xs }} />
        <View style={styles.loadingChipRow}>
          {Array.from({ length: 4 }).map((_, index) => (
            <SkeletonLoader key={`filter_sort_loading_${index}`} width={Space.xxl + Space.xxl + Space.lg} height={Space.xl + Space.sm + 2} borderRadius={Radius.xl + 1} />
          ))}
        </View>
      </View>

      <View style={styles.loadingSection}>
        <SkeletonLoader width="24%" height={Space.md - 2} borderRadius={Radius.md - 1} style={{ marginBottom: Space.sm + Space.xs }} />
        <View style={styles.loadingChipWrap}>
          {Array.from({ length: 8 }).map((_, index) => (
            <SkeletonLoader key={`filter_brand_loading_${index}`} width={Space.xxl + Space.xxl + Space.sm} height={Space.xl + Space.sm + 2} borderRadius={Radius.xl + 1} />
          ))}
        </View>
      </View>
    </View>
  );

  const toggleBrand = (b: string) => {
    setSelectedBrands(prev => prev.includes(b) ? prev.filter(x => x !== b) : [...prev, b]);
  };

  const toggleSize = (s: string) => {
    setSelectedSizes(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]);
  };

  const getResultsCount = () => {
    const normalizedCategory = toKey(categoryId);
    const normalizedSubcategory = getSubcategoryToken(categoryId, subcategoryId, title);
    const query = browseFilters.query.trim().toLowerCase();
    const selectedBrandKeys = new Set(selectedBrands.map((brand) => brand.toLowerCase()));
    const selectedSizeKeys = new Set(selectedSizes.map((size) => size.toLowerCase()));

    return listings.filter((listing) => {
      if (normalizedCategory !== 'search' && listing.category?.toLowerCase() !== normalizedCategory) {
        return false;
      }

      if (normalizedCategory !== 'search' && normalizedSubcategory) {
        if (!listing.subcategory?.toLowerCase()?.includes(normalizedSubcategory)) {
          return false;
        }
      }

      if (query) {
        const searchable = [
          listing.title,
          listing.brand,
          listing.description,
          listing.category,
          listing.subcategory,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();

        if (!searchable?.includes(query)) {
          return false;
        }
      }

      if (selectedBrandKeys.size > 0 && !selectedBrandKeys.has(listing.brand?.toLowerCase() ?? '')) {
        return false;
      }

      if (selectedSizeKeys.size > 0 && !selectedSizeKeys.has(listing.size?.toLowerCase() ?? '')) {
        return false;
      }

      if (selectedCondition !== 'Any' && listing.condition !== selectedCondition) {
        return false;
      }

      // Price range filter (GBP)
      const minVal = priceMin.trim() ? Number(priceMin.trim()) : null;
      const maxVal = priceMax.trim() ? Number(priceMax.trim()) : null;
      if (minVal != null && !Number.isNaN(minVal) && listing.price < minVal) return false;
      if (maxVal != null && !Number.isNaN(maxVal) && listing.price > maxVal) return false;

      // Sustainable — filters by seller-applied tags / heuristic grade.
      // Returns false in production (no real data), so the filter yields no
      // results until a backend impact service or seller tags exist.
      if (
        sustainableOnly &&
        !isSustainableGrade({
          condition: listing.condition,
          category: listing.category,
          subcategory: listing.subcategory,
          brand: listing.brand,
          sellerLocation: listing.seller?.location ?? null })
      ) {
        return false;
      }

      return true;
    }).length;
  };

  const handleClear = () => {
    setActiveSort('Recommended');
    setSelectedBrands([]);
    setSelectedSizes([]);
    setSelectedCondition('Any');
    setSustainableOnly(false);
    setPriceMin('');
    setPriceMax('');
  };

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

  const handleApplyPreset = (preset: typeof filterPresets[number]) => {
    setActiveSort(preset.sort as SortOption);
    setSelectedBrands(preset.brands);
    setSelectedSizes(preset.sizes);
    setSelectedCondition(preset.condition as ConditionOption);
    show(`Applied preset "${preset.name}"`, 'success');
  };

  const handleSavePreset = () => {
    const trimmed = presetName.trim();
    if (!trimmed) return;
    saveFilterPreset({
      name: trimmed,
      sort: activeSort,
      brands: selectedBrands,
      sizes: selectedSizes,
      condition: selectedCondition });
    show(`Saved preset "${trimmed}"`, 'success');
    setPresetName('');
    setIsSavingPreset(false);
  };

  const hasActiveSelection =
    selectedBrands.length > 0 || selectedSizes.length > 0 || selectedCondition !== 'Any' || activeSort !== 'Recommended' || sustainableOnly || priceMin.trim() !== '' || priceMax.trim() !== '';

  const activeFilterCount =
    selectedBrands.length
    + selectedSizes.length
    + (selectedCondition !== 'Any' ? 1 : 0)
    + (activeSort !== 'Recommended' ? 1 : 0)
    + (sustainableOnly ? 1 : 0)
    + (priceMin.trim() !== '' ? 1 : 0)
    + (priceMax.trim() !== '' ? 1 : 0);

  const resultCount = getResultsCount();
  const applyLabel = showFilterLoadingState ? 'Loading options...' : `Show ${resultCount} items`;

  return (
    <View style={styles.container}>
      <Reanimated.View style={[StyleSheet.absoluteFill, { backgroundColor: colors.overlay }, overlayStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={closeBottomSheet} />
      </Reanimated.View>

      <GestureDetector gesture={gesture}>
        <Reanimated.View style={[styles.sheet, sheetStyle]}>
          {/* Drag Handle */}
          <View style={styles.handleContainer}>
            <View style={styles.handle} />
          </View>

          <View style={styles.header}>
            <View style={styles.headerTitleRow}>
              <Text style={styles.headerTitle}>Filter & Sort</Text>
              {activeFilterCount > 0 && (
                <View style={styles.activeCountBadge}>
                  <Text style={styles.activeCountBadgeText}>{activeFilterCount}</Text>
                </View>
              )}
            </View>
            <AppButton
              title="Clear"
              onPress={handleClear}
              variant="secondary"
              size="sm"
              style={styles.clearBtn}
              titleStyle={styles.clearText}
              accessibilityLabel="Clear selected filters"
            />
          </View>

          <View style={styles.statusRow}>
            <Text style={styles.statusMeta}>{resultCount} matches currently</Text>
            <SyncStatusPill tone={filterStatus.tone} label={filterStatus.label} compact />
          </View>

          <View style={styles.contextActionRow}>
            <AnimatedPressable
              style={styles.contextIdentity}
              onPress={() => navigation.navigate('CategoryTree', { categoryPrefix: categoryId === 'search' ? '' : categoryId })}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Open category tree"
              accessibilityHint="Shows the full category tree for this filter context"
            >
              <Ionicons name="funnel-outline" size={16} color={colors.textPrimary} aria-hidden={true} />
              <Text style={styles.contextText} numberOfLines={1}>
                {title ?? categoryId}
              </Text>
            </AnimatedPressable>

          </View>

          {/* Filter presets — quick apply chips + save current */}
          {(filterPresets.length > 0 || isSavingPreset) && (
            <View style={styles.presetsWrap}>
              <View style={styles.presetsHeaderRow}>
                <Text style={styles.presetsLabel}>Presets</Text>
                {!isSavingPreset && hasActiveSelection && (
                  <AnimatedPressable
                    onPress={() => setIsSavingPreset(true)}
                    accessibilityLabel="Save current filters as a preset"
                    accessibilityRole="button"
                  >
                    <Text style={styles.presetsSaveLink}>+ Save current</Text>
                  </AnimatedPressable>
                )}
              </View>

              {isSavingPreset ? (
                <View style={styles.presetInputWrap}>
                  <TextInput
                    style={styles.presetInput}
                    placeholder="Preset name (e.g. Streetwear M)"
                    placeholderTextColor={colors.textMuted}
                    value={presetName}
                    onChangeText={setPresetName}
                    autoFocus
                    maxLength={30}
                    returnKeyType="done"
                    onSubmitEditing={handleSavePreset}
                  />
                  <AnimatedPressable
                    style={[styles.presetSaveBtn, !presetName.trim() && styles.presetSaveBtnDisabled]}
                    onPress={handleSavePreset}
                    accessibilityLabel="Save preset"
                    accessibilityRole="button"
                  >
                    <Ionicons name="checkmark" size={18} color={colors.surface} aria-hidden={true} />
                  </AnimatedPressable>
                  <AnimatedPressable
                    style={styles.presetCancelBtn}
                    onPress={() => { setIsSavingPreset(false); setPresetName(''); }}
                    accessibilityLabel="Cancel saving preset"
                    accessibilityRole="button"
                  >
                    <Ionicons name="close" size={18} color={colors.textMuted} aria-hidden={true} />
                  </AnimatedPressable>
                </View>
              ) : (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.presetsScroll}>
                  {filterPresets.map((preset) => (
                    <View key={preset.id} style={styles.presetChipWrap}>
                      <AnimatedPressable
                        style={styles.presetChip}
                        onPress={() => handleApplyPreset(preset)}
                        accessibilityLabel={`Apply filter preset ${preset.name}`}
                        accessibilityRole="button"
                      >
                        <Ionicons name="bookmark" size={12} color={colors.brand} aria-hidden={true} />
                        <Text style={styles.presetChipText} numberOfLines={1}>{preset.name}</Text>
                      </AnimatedPressable>
                      <AnimatedPressable
                        style={styles.presetRemoveBtn}
                        onPress={() => removeFilterPreset(preset.id)}
                        accessibilityLabel={`Remove filter preset ${preset.name}`}
                        accessibilityRole="button"
                      >
                        <Ionicons name="close-circle" size={16} color={colors.textMuted} aria-hidden={true} />
                      </AnimatedPressable>
                    </View>
                  ))}
                </ScrollView>
              )}
            </View>
          )}

          {/* Inline "Save current" entry when no presets exist yet */}
          {filterPresets.length === 0 && !isSavingPreset && hasActiveSelection && (
            <AnimatedPressable
              style={styles.presetsEmptyCta}
              onPress={() => setIsSavingPreset(true)}
              accessibilityLabel="Save current filters as a preset"
              accessibilityRole="button"
            >
              <Ionicons name="bookmark-outline" size={16} color={colors.brand} aria-hidden={true} />
              <Text style={styles.presetsEmptyCtaText}>Save current filters as a preset</Text>
            </AnimatedPressable>
          )}

          {lastError ? (
            <SyncRetryBanner
              message="Live filter data is delayed. Showing cached catalog options."
              onRetry={() => void refreshListings()}
              isRetrying={isSyncing}
              telemetryContext="filter_sync"
              containerStyle={styles.syncRetryBanner}
              actionStyle={styles.syncRetryBtn}
            />
          ) : null}

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
            {showFilterLoadingState ? (
              renderLoadingState()
            ) : (
              <>
                {/* Sort Section — collapsible */}
                <Pressable
                  style={styles.collapsibleHeader}
                  onPress={() => toggleSection('sort')}
                  accessibilityRole="button"
                  accessibilityLabel={expandedSections.has('sort') ? 'Collapse sort section' : 'Expand sort section'}
                  accessibilityState={{ expanded: expandedSections.has('sort') }}
                >
                  <Text style={styles.sectionHeading}>Sort By</Text>
                  <Ionicons name={expandedSections.has('sort') ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textMuted} aria-hidden={true} />
                </Pressable>
                {expandedSections.has('sort') && (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hScroll}>
                    <AppSegmentControl
                      options={sortOptions}
                      value={activeSort}
                      onChange={setActiveSort}
                      optionStyle={styles.chip}
                      optionActiveStyle={styles.chipActive}
                      optionTextStyle={styles.chipText}
                      optionTextActiveStyle={styles.chipTextActive}
                    />
                  </ScrollView>
                )}

                <View style={styles.sectionDivider} />

                {/* Brand Section — collapsible */}
                <Pressable
                  style={styles.collapsibleHeader}
                  onPress={() => toggleSection('brand')}
                  accessibilityRole="button"
                  accessibilityLabel={expandedSections.has('brand') ? 'Collapse brand section' : 'Expand brand section'}
                  accessibilityState={{ expanded: expandedSections.has('brand') }}
                >
                  <View style={styles.sectionHeaderRow}>
                    <Text style={styles.sectionHeading}>Brand</Text>
                    {selectedBrands.length > 0 && (
                      <View style={styles.sectionCountBadge}>
                        <Text style={styles.sectionCountBadgeText}>{selectedBrands.length}</Text>
                      </View>
                    )}
                  </View>
                  <Ionicons name={expandedSections.has('brand') ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textMuted} aria-hidden={true} />
                </Pressable>
                {expandedSections.has('brand') && (
                  <>
                    {brandOptions.length > 8 ? (
                      <View style={styles.seeAllRow}>
                        <AppButton
                          title={showAllBrands ? 'Show less' : 'See all'}
                          onPress={() => setShowAllBrands((current) => !current)}
                          variant="secondary"
                          size="sm"
                          style={styles.seeAllBtn}
                          titleStyle={styles.seeAllText}
                          accessibilityLabel={showAllBrands ? 'Show fewer brand options' : 'Show all brand options'}
                        />
                      </View>
                    ) : null}
                    <View style={styles.wrapContainer}>
                      {visibleBrandOptions.length > 0 ? (
                        visibleBrandOptions.map(b => {
                          const isActive = selectedBrands.includes(b);
                          return (
                            <AppButton
                              key={b}
                              title={b}
                              variant="secondary"
                              size="sm"
                              style={[styles.chip, isActive && styles.chipActive]}
                              titleStyle={[styles.chipText, isActive && styles.chipTextActive]}
                              onPress={() => toggleBrand(b)}
                              accessibilityLabel={`Toggle brand filter ${b}`}
                            />
                          );
                        })
                      ) : (
                        <Text style={styles.emptySectionText}>No brands in this category yet.</Text>
                      )}
                    </View>
                  </>
                )}

                <View style={styles.sectionDivider} />

                {/* Size Section — collapsible */}
                <Pressable
                  style={styles.collapsibleHeader}
                  onPress={() => toggleSection('size')}
                  accessibilityRole="button"
                  accessibilityLabel={expandedSections.has('size') ? 'Collapse size section' : 'Expand size section'}
                  accessibilityState={{ expanded: expandedSections.has('size') }}
                >
                  <View style={styles.sectionHeaderRow}>
                    <Text style={styles.sectionHeading}>Size</Text>
                    {selectedSizes.length > 0 && (
                      <View style={styles.sectionCountBadge}>
                        <Text style={styles.sectionCountBadgeText}>{selectedSizes.length}</Text>
                      </View>
                    )}
                  </View>
                  <Ionicons name={expandedSections.has('size') ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textMuted} aria-hidden={true} />
                </Pressable>
                {expandedSections.has('size') && (
                  <>
                    {/* My Sizes — saved size profile for quick application */}
                    {mySizes.length > 0 ? (
                      <View style={styles.mySizesRow}>
                        <Text style={styles.mySizesLabel}>My sizes:</Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.mySizesScroll}>
                          {mySizes.map(s => {
                            const isActive = selectedSizes.includes(s);
                            return (
                              <AppButton
                                key={s}
                                title={s}
                                variant="secondary"
                                size="sm"
                                style={[styles.chip, styles.sizeChip, styles.mySizeChip, isActive && styles.chipActive]}
                                titleStyle={[styles.chipText, isActive && styles.chipTextActive]}
                                onPress={() => toggleSize(s)}
                                accessibilityLabel={`Toggle your saved size ${s}`}
                              />
                            );
                          })}
                        </ScrollView>
                      </View>
                    ) : null}

                    <View style={styles.wrapContainer}>
                      {sizeOptions.length > 0 ? (
                        sizeOptions.map(s => {
                          const isActive = selectedSizes.includes(s);
                          const isMySize = mySizes.includes(s);
                          return (
                            <Pressable
                              key={s}
                              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                              onLongPress={() => {
                                toggleMySize(s);
                                haptics.press();
                                show(
                                  mySizes.includes(s) ? `Removed ${s} from your sizes` : `Saved ${s} to your sizes`,
                                  'success'
                                );
                              }}
                              delayLongPress={400}
                            accessibilityRole="switch" accessibilityLabel="Toggle size filter"
                            >
                              <AppButton
                                title={s}
                                icon={isMySize ? <Ionicons name="checkmark-circle-outline" size={12} color={colors.brand} aria-hidden={true} /> : undefined}
                                variant="secondary"
                                size="sm"
                                style={[styles.chip, styles.sizeChip, isActive && styles.chipActive, isMySize && styles.mySizeMarkedChip]}
                                titleStyle={[styles.chipText, isActive && styles.chipTextActive]}
                                onPress={() => toggleSize(s)}
                                accessibilityLabel={`Toggle size filter ${s}. Long press to ${mySizes.includes(s) ? 'remove from' : 'save to'} your sizes.`}
                              />
                            </Pressable>
                          );
                        })
                      ) : (
                        <Text style={styles.emptySectionText}>No sizes in this category yet.</Text>
                      )}
                    </View>

                    {/* Save current sizes as my sizes */}
                    {selectedSizes.length > 0 ? (
                      <View style={styles.saveSizesRow}>
                        <AppButton
                          title={selectedSizes.every(s => mySizes.includes(s)) ? 'All saved' : 'Save as my sizes'}
                          icon={selectedSizes.every(s => mySizes.includes(s)) ? <Ionicons name="checkmark-circle" size={16} color={colors.brand} aria-hidden={true} /> : undefined}
                          variant="secondary"
                          size="sm"
                          style={styles.saveSizesBtn}
                          titleStyle={styles.saveSizesBtnText}
                          onPress={() => {
                            // Merge current selection into my sizes
                            const merged = [...new Set([...mySizes, ...selectedSizes])];
                            setMySizes(merged);
                            show(`Saved ${selectedSizes.length} size${selectedSizes.length === 1 ? '' : 's'} to your profile`, 'success');
                          }}
                          accessibilityLabel="Save current size selection to your profile"
                        />
                      </View>
                    ) : null}
                  </>
                )}

                <View style={styles.sectionDivider} />

                {/* Condition Section — collapsible */}
                <Pressable
                  style={styles.collapsibleHeader}
                  onPress={() => toggleSection('condition')}
                  accessibilityRole="button"
                  accessibilityLabel={expandedSections.has('condition') ? 'Collapse condition section' : 'Expand condition section'}
                  accessibilityState={{ expanded: expandedSections.has('condition') }}
                >
                  <View style={styles.sectionHeaderRow}>
                    <Text style={styles.sectionHeading}>Condition</Text>
                    {selectedCondition !== 'Any' && (
                      <View style={styles.sectionCountBadge}>
                        <Text style={styles.sectionCountBadgeText}>1</Text>
                      </View>
                    )}
                  </View>
                  <Ionicons name={expandedSections.has('condition') ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textMuted} aria-hidden={true} />
                </Pressable>
                {expandedSections.has('condition') && (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hScroll}>
                    <AppSegmentControl
                      options={conditionOptions}
                      value={selectedCondition}
                      onChange={setSelectedCondition}
                      optionStyle={styles.chip}
                      optionActiveStyle={styles.chipActive}
                      optionTextStyle={styles.chipText}
                      optionTextActiveStyle={styles.chipTextActive}
                    />
                  </ScrollView>
                )}

                <View style={styles.sectionDivider} />

                {/* Sustainability Section — collapsible toggle */}
                <Pressable
                  style={styles.collapsibleHeader}
                  onPress={() => toggleSection('sustainability')}
                  accessibilityRole="button"
                  accessibilityLabel={expandedSections.has('sustainability') ? 'Collapse sustainability section' : 'Expand sustainability section'}
                  accessibilityState={{ expanded: expandedSections.has('sustainability') }}
                >
                  <Text style={styles.sectionHeading}>Sustainability</Text>
                  <Ionicons name={expandedSections.has('sustainability') ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textMuted} aria-hidden={true} />
                </Pressable>
                {expandedSections.has('sustainability') && (
                  <Pressable
                    onPress={() => {
                      haptics.press();
                      setSustainableOnly((prev) => !prev);
                    }}
                    style={styles.sustainableRow}
                    accessibilityRole="switch"
                    accessibilityState={{ checked: sustainableOnly }}
                    accessibilityLabel="Toggle sustainable items only"
                  >
                    <View style={styles.sustainableLabelWrap}>
                      <Ionicons
                        name="leaf"
                        size={16}
                        color={sustainableOnly ? colors.success : colors.textSecondary}
                        aria-hidden={true}
                      />
                      <View style={styles.sustainableTextWrap}>
                        <Text style={[styles.sustainableTitle, { color: colors.textPrimary }]}>
                          Sustainable only
                        </Text>
                        <Text style={[styles.sustainableCaption, { color: colors.textMuted }]}>
                          Items tagged sustainable by sellers
                        </Text>
                      </View>
                    </View>
                    <View
                      style={[
                        styles.sustainableToggle,
                        {
                          borderColor: sustainableOnly ? colors.success : colors.border,
                          backgroundColor: sustainableOnly ? colors.successSubtle : colors.surfaceAlt },
                      ]}
                    >
                      <View
                        style={[
                          styles.sustainableToggleThumb,
                          {
                            backgroundColor: sustainableOnly ? colors.success : colors.textMuted,
                            alignSelf: sustainableOnly ? 'flex-end' : 'flex-start' },
                        ]}
                      />
                    </View>
                  </Pressable>
                )}

                <View style={styles.sectionDivider} />

                {/* Price Range Section — collapsible */}
                <Pressable
                  style={styles.collapsibleHeader}
                  onPress={() => toggleSection('price')}
                  accessibilityRole="button"
                  accessibilityLabel={expandedSections.has('price') ? 'Collapse price section' : 'Expand price section'}
                  accessibilityState={{ expanded: expandedSections.has('price') }}
                >
                  <View style={styles.sectionHeaderRow}>
                    <Text style={styles.sectionHeading}>Price Range</Text>
                    {(priceMin.trim() !== '' || priceMax.trim() !== '') && (
                      <View style={styles.sectionCountBadge}>
                        <Text style={styles.sectionCountBadgeText}>
                          {[priceMin.trim() !== '', priceMax.trim() !== ''].filter(Boolean).length}
                        </Text>
                      </View>
                    )}
                  </View>
                  <Ionicons name={expandedSections.has('price') ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textMuted} aria-hidden={true} />
                </Pressable>
                {expandedSections.has('price') && (
                  <View style={styles.priceRangeRow}>
                    <View style={styles.priceInputWrap}>
                      <Text style={styles.priceInputLabel}>Min</Text>
                      <TextInput
                        style={styles.priceInput}
                        placeholder={formatFromFiat(0, 'GBP')}
                        placeholderTextColor={colors.textMuted}
                        value={priceMin}
                        onChangeText={setPriceMin}
                        keyboardType="numeric"
                        returnKeyType="done"
                        accessibilityLabel="Minimum price in pounds"
                      />
                    </View>
                    <Text style={styles.priceRangeDash}>—</Text>
                    <View style={styles.priceInputWrap}>
                      <Text style={styles.priceInputLabel}>Max</Text>
                      <TextInput
                        style={styles.priceInput}
                        placeholder="No limit"
                        placeholderTextColor={colors.textMuted}
                        value={priceMax}
                        onChangeText={setPriceMax}
                        keyboardType="numeric"
                        returnKeyType="done"
                        accessibilityLabel="Maximum price in pounds"
                      />
                    </View>
                  </View>
                )}

                {/* Advanced Section — collapsible, gated by the
                    advanced_filters feature flag. Additive; absent when the
                    flag is off (current behaviour). Surfaces quick price
                    range presets that set the existing priceMin/priceMax
                    fields — a progressive-disclosure shortcut for power
                    users. */}
                {advancedFiltersEnabled ? (
                  <>
                    <View style={styles.sectionDivider} />
                    <Pressable
                      style={styles.collapsibleHeader}
                      onPress={() => toggleSection('advanced')}
                      accessibilityRole="button"
                      accessibilityLabel={expandedSections.has('advanced') ? 'Collapse advanced section' : 'Expand advanced section'}
                      accessibilityState={{ expanded: expandedSections.has('advanced') }}
                    >
                      <Text style={styles.sectionHeading}>Advanced</Text>
                      <Ionicons name={expandedSections.has('advanced') ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textMuted} aria-hidden={true} />
                    </Pressable>
                    {expandedSections.has('advanced') && (
                      <View style={styles.wrapContainer}>
                        {[
                          { label: `Under ${currencySymbol}20`, min: '', max: '20' },
                          { label: `${currencySymbol}20 – ${currencySymbol}50`, min: '20', max: '50' },
                          { label: `${currencySymbol}50 – ${currencySymbol}100`, min: '50', max: '100' },
                          { label: `${currencySymbol}100+`, min: '100', max: '' },
                        ].map((preset) => {
                          const isActive = priceMin === preset.min && priceMax === preset.max;
                          return (
                            <AppButton
                              key={preset.label}
                              title={preset.label}
                              variant="secondary"
                              size="sm"
                              style={[styles.chip, isActive && styles.chipActive]}
                              titleStyle={[styles.chipText, isActive && styles.chipTextActive]}
                              onPress={() => {
                                haptics.press();
                                setPriceMin(preset.min);
                                setPriceMax(preset.max);
                              }}
                              accessibilityLabel={`Apply price preset: ${preset.label}`}
                            />
                          );
                        })}
                      </View>
                    )}
                  </>
                ) : null}
              </>
            )}

            {/* Sticky Bottom Action — Apply + Reset side by side */}
            <View style={styles.footer}>
              <AppButton
                style={[styles.resetBtn, !hasActiveSelection && styles.resetBtnDisabled]}
                title="Reset"
                titleStyle={[styles.resetBtnText, !hasActiveSelection && styles.resetBtnTextDisabled]}
                onPress={handleClear}
                disabled={!hasActiveSelection}
                variant="secondary"
                size="lg"
                accessibilityLabel="Reset all filters"
              />
              <AppButton
                style={[styles.applyBtn, showFilterLoadingState && styles.applyBtnDisabled]}
                title={applyLabel}
                titleStyle={[styles.applyBtnText, showFilterLoadingState && styles.applyBtnTextDisabled]}
                onPress={handleApply}
                disabled={showFilterLoadingState}
                variant="primary"
                size="lg"
                align="center"
                accessibilityLabel={applyLabel}
              />
            </View>
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
    ...Elevation.modal },
  handleContainer: {
    alignItems: 'center',
    paddingVertical: Space.sm + Space.xs },
  handle: {
    width: Space.xl + Space.xs,
    height: Space.xs,
    borderRadius: Radius.sm,
    backgroundColor: colors.borderSubtle },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Space.lg,
    paddingBottom: Space.md },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 2 },
  headerTitle: { fontSize: TypographyV2.priceList.size, fontFamily: TypographyV2.priceList.fontFamily, color: colors.textPrimary, letterSpacing: TypographyV2.priceList.letterSpacing },
  activeCountBadge: {
    minWidth: Space.lg + 2,
    height: Space.lg + 2,
    borderRadius: Radius.full,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Space.xs + 2 },
  activeCountBadgeText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: Typography.family.bold,
    color: colors.textInverse },
  clearBtn: {
    minHeight: Control.chromeCompact,
    borderRadius: Radius.xl,
    paddingHorizontal: Space.sm,
    borderWidth: 0,
    backgroundColor: 'transparent' },
  clearText: { color: colors.brand, fontSize: TypographyV2.bodyStrong.size, fontFamily: TypographyV2.bodyStrong.fontFamily },
  statusRow: {
    paddingHorizontal: Space.lg,
    paddingBottom: Space.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Space.sm + 2 },
  statusMeta: {
    color: colors.textMuted,
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily },
  contextActionRow: {
    marginHorizontal: Space.lg,
    marginBottom: Space.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Space.sm },
  contextIdentity: {
    flex: 1,
    minHeight: Control.chromeCompact,
    borderRadius: Radius.lg,
    borderWidth: Stroke.hairline,
    borderColor: colors.border,
    backgroundColor: 'transparent',
    paddingHorizontal: Space.sm + 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 3 },
  contextText: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily },

  // Filter presets — flat canvas, no card container (hairline separators only)
  presetsWrap: {
    marginHorizontal: Space.lg,
    marginBottom: Space.sm,
    paddingVertical: Space.sm + 2,
    paddingHorizontal: 0,
    borderRadius: Radius.none,
    backgroundColor: 'transparent',
    borderWidth: 0,
    borderColor: 'transparent',
    borderTopWidth: Stroke.hairline,
    borderTopColor: colors.border,
    borderBottomWidth: Stroke.hairline,
    borderBottomColor: colors.border },
  presetsHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Space.sm },
  presetsLabel: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.textMuted,
    letterSpacing: TypographyV2.label.letterSpacing,
    textTransform: 'uppercase' },
  presetsSaveLink: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.brand },
  presetsScroll: {
    gap: Space.sm },
  presetChipWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'transparent',
    borderRadius: Radius.full,
    borderWidth: Stroke.hairline,
    borderColor: colors.border,
    minHeight: Control.chrome,
    paddingHorizontal: Space.sm + 2 },
  presetChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 2 },
  presetChipText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.textPrimary,
    maxWidth: Space.xxl + Space.xxl + Space.lg },
  presetRemoveBtn: {
    width: Space.lg + Space.xs,
    height: Space.lg + Space.xs,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: Space.xs },
  presetInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm },
  presetInput: {
    flex: 1,
    height: Space.xl + Space.xs + 2,
    borderRadius: Radius.lg,
    borderWidth: Stroke.hairline,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: Space.md,
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    color: colors.textPrimary },
  presetSaveBtn: {
    width: Space.xl + Space.xs + 2,
    height: Space.xl + Space.xs + 2,
    borderRadius: Radius.lg,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center' },
  presetSaveBtnDisabled: {
    opacity: 0.4 },
  presetCancelBtn: {
    width: Space.xl + Space.xs + 2,
    height: Space.xl + Space.xs + 2,
    borderRadius: Radius.lg,
    alignItems: 'center',
    justifyContent: 'center' },
  presetsEmptyCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    marginHorizontal: Space.lg,
    marginBottom: Space.sm,
    paddingVertical: Space.sm + 2,
    paddingHorizontal: Space.md + 2,
    borderRadius: Radius.none,
    backgroundColor: 'transparent',
    borderWidth: 0,
    borderColor: 'transparent' },
  presetsEmptyCtaText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.brand },

  syncRetryBanner: {
    marginHorizontal: Space.lg,
    marginBottom: Space.sm,
    backgroundColor: colors.surface },
  syncRetryBtn: {
    backgroundColor: colors.surface },

  scrollContent: { paddingTop: Space.sm, paddingBottom: Space.xxl + Space.xs + Space.xs },
  loadingStateWrap: {
    paddingHorizontal: Space.xl,
    gap: Space.xl + 2 },
  loadingSection: {
    gap: Space.sm },
  loadingChipRow: {
    flexDirection: 'row',
    gap: Space.sm + 2 },
  loadingChipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Space.sm + 2 },

  sectionHeading: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    color: colors.textPrimary,
    paddingHorizontal: Space.xl,
    marginBottom: 0,
    letterSpacing: TypographyV2.body.letterSpacing },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Space.xs + 2,
    flex: 1 },
  collapsibleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingRight: Space.xl,
    paddingVertical: Space.md,
    minHeight: Control.hit },
  sectionCountBadge: {
    minWidth: Space.md + 2,
    height: Space.md + 2,
    borderRadius: Radius.full,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Space.xs },
  sectionCountBadgeText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: Typography.family.bold,
    color: colors.textSecondary },
  seeAllRow: {
    paddingHorizontal: Space.xl,
    marginBottom: Space.sm },
  seeAllBtn: {
    minHeight: Control.chromeCompact,
    borderRadius: Radius.xl,
    paddingHorizontal: Space.sm,
    borderWidth: 0,
    backgroundColor: 'transparent' },
  seeAllText: { color: colors.brand, fontSize: TypographyV2.body.size, fontFamily: TypographyV2.body.fontFamily },

  hScroll: { paddingHorizontal: Space.xl, gap: Space.sm },

  wrapContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: Space.xl,
    gap: Space.sm },

  emptySectionText: {
    paddingHorizontal: Space.xl,
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.textMuted,
    fontStyle: 'italic' },

  chip: {
    minHeight: Control.chrome,
    paddingHorizontal: Space.md - 2,
    borderRadius: Radius.full,
    backgroundColor: 'transparent',
    borderWidth: Stroke.hairline,
    borderColor: colors.border },
  sizeChip: { minWidth: Space.xxl + Space.sm, alignItems: 'center' },
  mySizeChip: {
    borderColor: colors.brand,
    borderWidth: Stroke.standard + Stroke.hairline },
  mySizeMarkedChip: {
    borderWidth: Stroke.standard + Stroke.hairline,
    borderColor: colors.brand },
  mySizesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Space.xl,
    marginBottom: Space.sm,
    gap: Space.sm },
  mySizesLabel: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.textSecondary },
  mySizesScroll: {
    gap: Space.xs + 2 },
  saveSizesRow: {
    paddingHorizontal: Space.md + Space.xs,
    marginTop: Space.sm + 2,
    marginBottom: Space.xs },
  saveSizesBtn: {
    alignSelf: 'flex-start',
    minHeight: Control.chromeCompact,
    borderRadius: Radius.xl,
    borderWidth: Stroke.hairline,
    borderColor: colors.brand,
    backgroundColor: 'transparent' },
  saveSizesBtnText: {
    color: colors.brand,
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily },
  chipActive: { backgroundColor: colors.textPrimary, borderColor: colors.textPrimary },

  chipText: { fontSize: TypographyV2.body.size, fontFamily: TypographyV2.body.fontFamily, color: colors.textPrimary },
  chipTextActive: { color: colors.background, fontFamily: TypographyV2.body.fontFamily },

  // ── Sustainability toggle ──
  sustainableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Space.md + Space.xs,
    paddingVertical: Space.sm,
    minHeight: Control.hit },
  sustainableLabelWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    flex: 1 },
  sustainableTextWrap: {
    flexDirection: 'column' },
  sustainableTitle: {
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: TypographyV2.bodyStrong.fontFamily,
    letterSpacing: TypographyV2.body.letterSpacing },
  sustainableCaption: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    marginTop: Space.xs / 4 },
  sustainableToggle: {
    width: Control.hit,
    height: Space.lg + 2,
    borderRadius: Radius.full,
    borderWidth: Stroke.standard,
    justifyContent: 'center',
    padding: Space.xs / 2 },
  sustainableToggleThumb: {
    width: Space.md + Space.xs,
    height: Space.md + Space.xs,
    borderRadius: Radius.full },

  sectionDivider: {
    height: Stroke.hairline,
    backgroundColor: colors.border,
    marginVertical: Space.md + Space.xs,
    marginHorizontal: Space.md + Space.xs },

  footer: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingHorizontal: Space.md + Space.xs,
    paddingTop: Space.md - 2,
    paddingBottom: Platform.OS === 'ios' ? Space.xl : Space.lg - 2,
    backgroundColor: colors.background,
    borderTopWidth: Stroke.hairline,
    borderTopColor: colors.border },
  resetBtn: {
    borderRadius: Radius.xl,
    borderWidth: Stroke.hairline,
    borderColor: colors.border,
    backgroundColor: 'transparent',
    minHeight: Space.xxl + Space.xs,
    paddingHorizontal: Space.lg },
  resetBtnDisabled: {
    opacity: 0.4 },
  resetBtnText: {
    color: colors.textSecondary,
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    letterSpacing: LetterSpacing.wide },
  resetBtnTextDisabled: {
    color: colors.textMuted },
  applyBtn: {
    flex: 1,
    minHeight: Space.xxl + Space.xs,
    borderRadius: Radius.xl },
  applyBtnDisabled: {
    opacity: 0.6 },
  applyBtnText: {
    color: colors.textPrimary,
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    letterSpacing: LetterSpacing.wide },
  applyBtnTextDisabled: {
    color: colors.textMuted },

  // ── Price range ──
  priceRangeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Space.xl,
    gap: Space.sm },
  priceInputWrap: {
    flex: 1 },
  priceInputLabel: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.textMuted,
    marginBottom: Space.xs },
  priceInput: {
    height: Space.xxl - Space.xs,
    borderWidth: Stroke.hairline,
    borderColor: colors.border,
    borderRadius: Radius.md,
    paddingHorizontal: Space.md,
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    color: colors.textPrimary,
    backgroundColor: colors.background },
  priceRangeDash: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    color: colors.textMuted,
    marginTop: Space.md + Space.xs } });
}
