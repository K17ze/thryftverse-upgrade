import React, { useState, useEffect, useMemo } from 'react';
import {
  AnimatedPressable,
} from '../components/AnimatedPressable';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  StatusBar,
  Platform,
  Dimensions,
  Pressable,
  TextInput,
} from 'react-native';
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
import { Typography, Radius, Space, Type, Stroke, Control, LetterSpacing } from '../theme/designTokens';
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

const { height, width } = Dimensions.get('window');
const SNAP_HALF = height * 0.5;
const SNAP_FULL = height * 0.1;
const OVERLAY_BG = 'rgba(0,0,0,0.45)';

type SortOption = 'Recommended' | 'Newest' | 'Price: Low to High' | 'Price: High to Low' | 'Most liked' | 'Ending soon';
type ConditionOption = 'Any' | 'New with tags' | 'Very good' | 'Good' | 'Satisfactory';
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
  accessibilityLabel: 'Sort by ending soon',
};

const CONDITION_OPTIONS: Array<{ value: ConditionOption; label: string; accessibilityLabel: string }> = [
  { value: 'Any', label: 'Any', accessibilityLabel: 'Filter any condition' },
  { value: 'New with tags', label: 'New with tags', accessibilityLabel: 'Filter new with tags' },
  { value: 'Very good', label: 'Very good', accessibilityLabel: 'Filter very good condition' },
  { value: 'Good', label: 'Good', accessibilityLabel: 'Filter good condition' },
  { value: 'Satisfactory', label: 'Satisfactory', accessibilityLabel: 'Filter satisfactory condition' },
];

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
  const reducedMotion = useReducedMotion();
  const styles = useMemo(() => createStyles(colors), [colors]);
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

  const translateY = useSharedValue(height);
  const contextY = useSharedValue(0);

  useEffect(() => {
    translateY.value = withTiming(SNAP_HALF, { duration: reducedMotion ? 0 : 200 });
  }, [reducedMotion]);

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
    transform: [{ translateY: translateY.value }],
  }));

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
          live: 'Live data',
        },
      }),
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

      // Sustainable — client-side heuristic: only A/B graded items.
      if (
        sustainableOnly &&
        !isSustainableGrade({
          condition: listing.condition,
          category: listing.category,
          subcategory: listing.subcategory,
          brand: listing.brand,
          sellerLocation: listing.seller?.location ?? null,
        })
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
      condition: selectedCondition,
      sustainableOnly,
      priceMin: parsedMin != null && !Number.isNaN(parsedMin) ? parsedMin : null,
      priceMax: parsedMax != null && !Number.isNaN(parsedMax) ? parsedMax : null,
    });
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
      condition: selectedCondition,
    });
    show(`Saved preset "${trimmed}"`, 'success');
    setPresetName('');
    setIsSavingPreset(false);
  };

  const hasActiveSelection =
    selectedBrands.length > 0 || selectedSizes.length > 0 || selectedCondition !== 'Any' || activeSort !== 'Recommended' || sustainableOnly || priceMin.trim() !== '' || priceMax.trim() !== '';

  const resultCount = getResultsCount();
  const applyLabel = showFilterLoadingState ? 'Loading options...' : `Show ${resultCount} items`;

  return (
    <View style={styles.container}>
      <Reanimated.View style={[StyleSheet.absoluteFill, { backgroundColor: OVERLAY_BG }, overlayStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={closeBottomSheet} />
      </Reanimated.View>

      <GestureDetector gesture={gesture}>
        <Reanimated.View style={[styles.sheet, sheetStyle]}>
          {/* Drag Handle */}
          <View style={styles.handleContainer}>
            <View style={styles.handle} />
          </View>

          <View style={styles.header}>
            <Text style={styles.headerTitle}>Filter & Sort</Text>
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
              <Ionicons name="funnel-outline" size={14} color={colors.textPrimary} />
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
                    <Ionicons name="checkmark" size={18} color={colors.surface} />
                  </AnimatedPressable>
                  <AnimatedPressable
                    style={styles.presetCancelBtn}
                    onPress={() => { setIsSavingPreset(false); setPresetName(''); }}
                    accessibilityLabel="Cancel saving preset"
                    accessibilityRole="button"
                  >
                    <Ionicons name="close" size={18} color={colors.textMuted} />
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
                        <Ionicons name="bookmark" size={12} color={colors.brand} />
                        <Text style={styles.presetChipText} numberOfLines={1}>{preset.name}</Text>
                      </AnimatedPressable>
                      <AnimatedPressable
                        style={styles.presetRemoveBtn}
                        onPress={() => removeFilterPreset(preset.id)}
                        accessibilityLabel={`Remove filter preset ${preset.name}`}
                        accessibilityRole="button"
                      >
                        <Ionicons name="close-circle" size={14} color={colors.textMuted} />
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
              <Ionicons name="bookmark-outline" size={14} color={colors.brand} />
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
                {/* Sort Section */}
                <Text style={styles.sectionHeading}>Sort By</Text>
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

                <View style={styles.sectionDivider} />

                {/* Brand Section */}
                <View style={styles.sectionHeaderRow}>
                  <Text style={styles.sectionHeading}>Brand</Text>
                  {brandOptions.length > 8 ? (
                    <AppButton
                      title={showAllBrands ? 'Show less' : 'See all'}
                      onPress={() => setShowAllBrands((current) => !current)}
                      variant="secondary"
                      size="sm"
                      style={styles.seeAllBtn}
                      titleStyle={styles.seeAllText}
                      accessibilityLabel={showAllBrands ? 'Show fewer brand options' : 'Show all brand options'}
                    />
                  ) : null}
                </View>
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

                <View style={styles.sectionDivider} />

                {/* Size Section */}
                <Text style={styles.sectionHeading}>Size</Text>

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
                          onLongPress={() => {
                            toggleMySize(s);
                            haptics.press();
                            show(
                              mySizes.includes(s) ? `Removed ${s} from your sizes` : `Saved ${s} to your sizes`,
                              'success'
                            );
                          }}
                          delayLongPress={400}
                        >
                          <AppButton
                            title={s}
                            icon={isMySize ? <Ionicons name="star" size={11} color={colors.brand} /> : undefined}
                            iconContainerStyle={styles.chipIconWrap}
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
                      icon={selectedSizes.every(s => mySizes.includes(s)) ? <Ionicons name="checkmark-circle" size={14} color={colors.brand} /> : undefined}
                      iconContainerStyle={styles.chipIconWrap}
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

                <View style={styles.sectionDivider} />

                {/* Condition Section */}
                <Text style={styles.sectionHeading}>Condition</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hScroll}>
                  <AppSegmentControl
                    options={CONDITION_OPTIONS}
                    value={selectedCondition}
                    onChange={setSelectedCondition}
                    optionStyle={styles.chip}
                    optionActiveStyle={styles.chipActive}
                    optionTextStyle={styles.chipText}
                    optionTextActiveStyle={styles.chipTextActive}
                  />
                </ScrollView>

                <View style={styles.sectionDivider} />

                {/* Sustainability Section — client-side heuristic toggle */}
                <Text style={styles.sectionHeading}>Sustainability</Text>
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
                    />
                    <View style={styles.sustainableTextWrap}>
                      <Text style={[styles.sustainableTitle, { color: colors.textPrimary }]}>
                        Sustainable only
                      </Text>
                      <Text style={[styles.sustainableCaption, { color: colors.textMuted }]}>
                        Estimated grade A or B items
                      </Text>
                    </View>
                  </View>
                  <View
                    style={[
                      styles.sustainableToggle,
                      {
                        borderColor: sustainableOnly ? colors.success : colors.border,
                        backgroundColor: sustainableOnly ? `${colors.success}22` : colors.surfaceAlt,
                      },
                    ]}
                  >
                    <View
                      style={[
                        styles.sustainableToggleThumb,
                        {
                          backgroundColor: sustainableOnly ? colors.success : colors.textMuted,
                          alignSelf: sustainableOnly ? 'flex-end' : 'flex-start',
                        },
                      ]}
                    />
                  </View>
                </Pressable>

                <View style={styles.sectionDivider} />

                {/* Price Range Section */}
                <Text style={styles.sectionHeading}>Price Range</Text>
                <View style={styles.priceRangeRow}>
                  <View style={styles.priceInputWrap}>
                    <Text style={styles.priceInputLabel}>Min</Text>
                    <TextInput
                      style={styles.priceInput}
                      placeholder="£0"
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
              </>
            )}

            {/* Sticky Bottom Action */}
            <View style={styles.footer}>
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

function createStyles(colors: ThemeColors) {
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
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -(Space.sm - 2) },
    shadowOpacity: 0.18,
    shadowRadius: Space.md,
    elevation: Space.md,
  },
  handleContainer: {
    alignItems: 'center',
    paddingVertical: Space.sm + Space.xs,
  },
  handle: {
    width: Space.xl + Space.xs,
    height: Space.xs,
    borderRadius: Radius.sm,
    backgroundColor: colors.borderSubtle,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Space.lg,
    paddingBottom: Space.md,
  },
  headerTitle: { fontSize: Type.priceList.size, fontFamily: Typography.family.bold, color: colors.textPrimary, letterSpacing: Type.priceList.letterSpacing },
  clearBtn: {
    minHeight: Control.chromeCompact,
    borderRadius: Radius.xl,
    paddingHorizontal: Space.sm,
    borderWidth: 0,
    backgroundColor: 'transparent',
  },
  clearText: { color: colors.brand, fontSize: Type.bodyStrong.size, fontFamily: Typography.family.semibold },
  statusRow: {
    paddingHorizontal: Space.lg,
    paddingBottom: Space.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Space.sm + 2,
  },
  statusMeta: {
    color: colors.textMuted,
    fontSize: Type.caption.size,
    fontFamily: Typography.family.medium,
  },
  contextActionRow: {
    marginHorizontal: Space.lg,
    marginBottom: Space.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Space.sm,
  },
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
    gap: Space.xs + 3,
  },
  contextText: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: Type.caption.size,
    fontFamily: Typography.family.semibold,
  },

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
    borderBottomColor: colors.border,
  },
  presetsHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Space.sm,
  },
  presetsLabel: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.semibold,
    color: colors.textMuted,
    letterSpacing: Type.label.letterSpacing,
    textTransform: 'uppercase',
  },
  presetsSaveLink: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.semibold,
    color: colors.brand,
  },
  presetsScroll: {
    gap: Space.sm,
  },
  presetChipWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'transparent',
    borderRadius: Radius.full,
    borderWidth: Stroke.hairline,
    borderColor: colors.border,
    minHeight: Control.chrome,
    paddingHorizontal: Space.sm + 2,
  },
  presetChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 2,
  },
  presetChipText: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.medium,
    color: colors.textPrimary,
    maxWidth: Space.xxl + Space.xxl + Space.lg,
  },
  presetRemoveBtn: {
    width: Space.lg + Space.xs,
    height: Space.lg + Space.xs,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: Space.xs,
  },
  presetInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
  },
  presetInput: {
    flex: 1,
    height: Space.xl + Space.xs + 2,
    borderRadius: Radius.lg,
    borderWidth: Stroke.hairline,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: Space.md,
    fontSize: Type.body.size,
    fontFamily: Typography.family.regular,
    color: colors.textPrimary,
  },
  presetSaveBtn: {
    width: Space.xl + Space.xs + 2,
    height: Space.xl + Space.xs + 2,
    borderRadius: Radius.lg,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  presetSaveBtnDisabled: {
    opacity: 0.4,
  },
  presetCancelBtn: {
    width: Space.xl + Space.xs + 2,
    height: Space.xl + Space.xs + 2,
    borderRadius: Radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
    borderColor: 'transparent',
  },
  presetsEmptyCtaText: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.medium,
    color: colors.brand,
  },

  syncRetryBanner: {
    marginHorizontal: Space.lg,
    marginBottom: Space.sm,
    backgroundColor: colors.surface,
  },
  syncRetryBtn: {
    backgroundColor: colors.surface,
  },

  scrollContent: { paddingTop: Space.sm, paddingBottom: Space.xxl + Space.xs + Space.xs },
  loadingStateWrap: {
    paddingHorizontal: Space.xl,
    gap: Space.xl + 2,
  },
  loadingSection: {
    gap: Space.sm,
  },
  loadingChipRow: {
    flexDirection: 'row',
    gap: Space.sm + 2,
  },
  loadingChipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Space.sm + 2,
  },

  sectionHeading: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.bold,
    color: colors.textPrimary,
    paddingHorizontal: Space.xl,
    marginBottom: Space.md,
    letterSpacing: Type.body.letterSpacing,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingRight: Space.md + Space.xs,
    marginBottom: Space.sm + Space.xs,
  },
  seeAllBtn: {
    minHeight: Control.chromeCompact,
    borderRadius: Radius.xl,
    paddingHorizontal: Space.sm,
    borderWidth: 0,
    backgroundColor: 'transparent',
  },
  seeAllText: { color: colors.brand, fontSize: Type.body.size, fontFamily: Typography.family.semibold },

  hScroll: { paddingHorizontal: Space.xl, gap: Space.sm },

  wrapContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: Space.xl,
    gap: Space.sm,
  },

  emptySectionText: {
    paddingHorizontal: Space.xl,
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    color: colors.textMuted,
    fontStyle: 'italic',
  },

  chip: {
    minHeight: Control.chrome,
    paddingHorizontal: Space.md - 2,
    borderRadius: Radius.full,
    backgroundColor: 'transparent',
    borderWidth: Stroke.hairline,
    borderColor: colors.border,
  },
  sizeChip: { minWidth: Space.xxl + Space.sm, alignItems: 'center' },
  mySizeChip: {
    borderColor: colors.brand,
    borderWidth: Stroke.standard + Stroke.hairline,
  },
  mySizeMarkedChip: {
    borderWidth: Stroke.standard + Stroke.hairline,
    borderColor: colors.brand,
  },
  mySizesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Space.xl,
    marginBottom: Space.sm,
    gap: Space.sm,
  },
  mySizesLabel: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.semibold,
    color: colors.textSecondary,
  },
  mySizesScroll: {
    gap: Space.xs + 2,
  },
  saveSizesRow: {
    paddingHorizontal: Space.md + Space.xs,
    marginTop: Space.sm + 2,
    marginBottom: Space.xs,
  },
  saveSizesBtn: {
    alignSelf: 'flex-start',
    minHeight: Control.chromeCompact,
    borderRadius: Radius.xl,
    borderWidth: Stroke.hairline,
    borderColor: colors.brand,
    backgroundColor: 'transparent',
  },
  saveSizesBtnText: {
    color: colors.brand,
    fontSize: Type.caption.size,
    fontFamily: Typography.family.semibold,
  },
  chipActive: { backgroundColor: colors.textPrimary, borderColor: colors.textPrimary },

  chipIconWrap: {
    width: Control.iconCompact,
    height: Control.iconCompact,
    borderRadius: Radius.full,
  },

  chipText: { fontSize: Type.body.size, fontFamily: Typography.family.semibold, color: colors.textPrimary },
  chipTextActive: { color: colors.background, fontFamily: Typography.family.bold },

  // ── Sustainability toggle ──
  sustainableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Space.md + Space.xs,
    paddingVertical: Space.sm,
    minHeight: Control.hit,
  },
  sustainableLabelWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    flex: 1,
  },
  sustainableTextWrap: {
    flexDirection: 'column',
  },
  sustainableTitle: {
    fontSize: Type.bodyStrong.size,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.body.letterSpacing,
  },
  sustainableCaption: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    marginTop: Space.xs / 4,
  },
  sustainableToggle: {
    width: Control.hit,
    height: Space.lg + 2,
    borderRadius: Radius.full,
    borderWidth: Stroke.standard,
    justifyContent: 'center',
    padding: Space.xs / 2,
  },
  sustainableToggleThumb: {
    width: Space.md + Space.xs,
    height: Space.md + Space.xs,
    borderRadius: Radius.full,
  },

  sectionDivider: {
    height: Stroke.hairline,
    backgroundColor: colors.border,
    marginVertical: Space.md + Space.xs,
    marginHorizontal: Space.md + Space.xs,
  },

  footer: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    paddingHorizontal: Space.md + Space.xs,
    paddingTop: Space.md - 2,
    paddingBottom: Platform.OS === 'ios' ? Space.xl : Space.lg - 2,
    backgroundColor: colors.background,
    borderTopWidth: Stroke.hairline,
    borderTopColor: colors.border,
  },
  applyBtn: {
    width: '100%',
    minHeight: Space.xxl + Space.xs,
    borderRadius: Radius.xl,
  },
  applyBtnDisabled: {
    opacity: 0.6,
  },
  applyBtnText: {
    color: colors.textPrimary,
    fontSize: Type.body.size,
    fontFamily: Typography.family.bold,
    letterSpacing: LetterSpacing.wide,
  },
  applyBtnTextDisabled: {
    color: colors.textMuted,
  },

  // ── Price range ──
  priceRangeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Space.xl,
    gap: Space.sm,
  },
  priceInputWrap: {
    flex: 1,
  },
  priceInputLabel: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.medium,
    color: colors.textMuted,
    marginBottom: Space.xs,
  },
  priceInput: {
    height: Space.xxl - Space.xs,
    borderWidth: Stroke.hairline,
    borderColor: colors.border,
    borderRadius: Radius.md,
    paddingHorizontal: Space.md,
    fontSize: Type.body.size,
    fontFamily: Typography.family.regular,
    color: colors.textPrimary,
    backgroundColor: colors.background,
  },
  priceRangeDash: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.regular,
    color: colors.textMuted,
    marginTop: Space.md + Space.xs,
  },
  });
}
